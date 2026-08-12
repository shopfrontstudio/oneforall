import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { currentUser } from '../../shared/guards.js';
import { canTransitionBooking, idempotencyScope } from '../../shared/marketplace.js';
import { PHASE1_POLICY_VERSION } from '../../shared/phase1-catalogue.js';

const jobState = { accepted: 'matched', scheduled: 'matched', in_progress: 'in_progress', completed: 'completed', cancelled: 'cancelled', disputed: 'in_progress' };

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();
    const { booking_id, job_id, to_state, idempotency_key } = await req.json();
    if ((!booking_id && !job_id) || !to_state || !idempotency_key) return fail('A booking, state and idempotency key are required.');
    const matches = booking_id ? [await base44.asServiceRole.entities.Booking.get(booking_id)] : await base44.asServiceRole.entities.Booking.filter({ job_id });
    const booking = matches.find(Boolean);
    if (!booking) return fail('That booking no longer exists.', 404);
    const actorRole = user.role === 'admin' ? 'admin' : booking.customer_id === user.id ? 'customer' : booking.provider_id === user.id ? 'provider' : null;
    if (!actorRole) return forbidden();
    const prior = await base44.asServiceRole.entities.BookingEvent.filter(idempotencyScope.event({ key: idempotency_key, actorId: user.id, bookingId: booking.id, jobId: booking.job_id }));
    if (prior[0]) return ok({ booking, already_applied: true });
    if (!canTransitionBooking(booking.state, to_state, actorRole)) return fail('That booking transition is not allowed.', 409);
    const updated = await base44.asServiceRole.entities.Booking.update(booking.id, { state: to_state, version: Number(booking.version || 1) + 1 });
    if (jobState[to_state]) await base44.asServiceRole.entities.Job.update(booking.job_id, { status: jobState[to_state] });
    await base44.asServiceRole.entities.BookingEvent.create({
      booking_id: booking.id, job_id: booking.job_id, customer_id: booking.customer_id, provider_id: booking.provider_id,
      actor_id: user.id, actor_role: actorRole, event_type: 'booking_state_changed', from_state: booking.state,
      to_state, idempotency_key, policy_version: PHASE1_POLICY_VERSION,
    });
    return ok({ booking: updated });
  } catch (error) {
    return serverError(error);
  }
}
