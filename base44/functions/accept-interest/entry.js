import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { currentUser } from '../../shared/guards.js';
import { chooseCanonicalBooking, evaluateBookingGate, loadServiceEligibility } from '../../shared/marketplace.js';
import { getPhase1Service, PHASE1_POLICY_VERSION } from '../../shared/phase1-catalogue.js';
import { notifyUser } from '../../shared/notify.js';

async function recordEvent(base44, booking, actorId, idempotencyKey) {
  const prior = await base44.asServiceRole.entities.BookingEvent.filter({ idempotency_key: idempotencyKey });
  if (prior[0]) return prior[0];
  return base44.asServiceRole.entities.BookingEvent.create({
    booking_id: booking.id, job_id: booking.job_id, customer_id: booking.customer_id,
    provider_id: booking.provider_id, actor_id: actorId, actor_role: 'customer',
    event_type: 'booking_accepted', to_state: 'accepted', idempotency_key: idempotencyKey,
    policy_version: PHASE1_POLICY_VERSION,
  });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();
    const { request_id, action, idempotency_key } = await req.json();
    if (!request_id || !['accept', 'decline'].includes(action)) return fail('A valid quote action is required.');
    if (!idempotency_key) return fail('An idempotency key is required.');
    const request = await base44.asServiceRole.entities.InterestRequest.get(request_id);
    if (!request) return fail('That quote no longer exists.', 404);
    const job = await base44.asServiceRole.entities.Job.get(request.job_id);
    if (!job) return fail('That request no longer exists.', 404);
    if (job.customer_id !== user.id) return forbidden('Only the customer who posted this request can respond.');

    if (action === 'decline') {
      if (request.status === 'declined') return ok({ status: 'declined', already_applied: true });
      if (request.status !== 'pending') return fail('That quote can no longer be declined.', 409);
      await base44.asServiceRole.entities.InterestRequest.update(request.id, { status: 'declined' });
      return ok({ status: 'declined' });
    }

    const duplicate = await base44.asServiceRole.entities.Booking.filter({ idempotency_key });
    if (duplicate[0]) return ok({ status: 'accepted', booking: duplicate[0], already_applied: true });
    const existingBookings = await base44.asServiceRole.entities.Booking.filter({ job_id: job.id });
    const existingWinner = chooseCanonicalBooking(existingBookings);
    if (existingWinner) {
      if (existingWinner.quote_id === request.id) return ok({ status: 'accepted', booking: existingWinner, already_applied: true });
      return fail('Another quote has already been accepted for this request.', 409);
    }
    if (job.status !== 'published' || request.status !== 'pending') return fail('That quote can no longer be accepted.', 409);
    const definition = getPhase1Service(job.service_key);
    if (!definition?.flags.booking_enabled || !definition.flags.public_release_enabled) return fail('Booking is not enabled for this service.', 403);

    const providerEligibility = await loadServiceEligibility(base44, { providerId: request.tradie_id, serviceKey: job.service_key, suburb: job.suburb, now: new Date() });
    const worker = await base44.asServiceRole.entities.ProviderWorker.get(request.attending_worker_id);
    const workerEvidence = await base44.asServiceRole.entities.ProviderEvidence.filter({ provider_id: request.tradie_id, worker_id: request.attending_worker_id });
    const gate = evaluateBookingGate({
      serviceKey: job.service_key, providerEligibility, worker, workerEvidence,
      hazardScreen: { status: job.hazard_screen_status, scope_decision: job.scope_decision },
      serviceDate: job.preferred_date || new Date(), substitutionDisclosed: true,
    });
    if (!gate.eligible) return fail(`Booking blocked: ${gate.reason}.`, 403);

    // Base44 exposes no transaction or unique constraint here. The idempotency read,
    // post-create canonical election and loser supersession make retries safe and
    // converge races, but cannot provide strict serialisability.
    const booking = await base44.asServiceRole.entities.Booking.create({
      job_id: job.id, quote_id: request.id, customer_id: user.id, provider_id: request.tradie_id,
      attending_worker_id: request.attending_worker_id, service_key: job.service_key, state: 'accepted',
      hazard_screen_status: job.hazard_screen_status, scope_decision: job.scope_decision,
      substitution_disclosed: true, idempotency_key, policy_version: PHASE1_POLICY_VERSION, version: 1,
    });
    const afterCreate = await base44.asServiceRole.entities.Booking.filter({ job_id: job.id });
    const winner = chooseCanonicalBooking(afterCreate);
    for (const candidate of afterCreate) {
      if (candidate.id !== winner.id && candidate.state !== 'superseded') {
        await base44.asServiceRole.entities.Booking.update(candidate.id, { state: 'superseded', version: Number(candidate.version || 1) + 1 });
      }
    }
    if (winner.id !== booking.id) return fail('Another quote won a simultaneous acceptance. Refresh this request.', 409);

    const siblings = await base44.asServiceRole.entities.InterestRequest.filter({ job_id: job.id });
    await base44.asServiceRole.entities.InterestRequest.update(request.id, { status: 'accepted', booking_id: booking.id });
    await Promise.all(siblings.filter((item) => item.id !== request.id && item.status === 'pending').map((item) => base44.asServiceRole.entities.InterestRequest.update(item.id, { status: 'declined' })));
    await base44.asServiceRole.entities.Job.update(job.id, { status: 'matched', assigned_tradie_id: request.tradie_id, accepted_quote_id: request.id, booking_id: booking.id });
    await recordEvent(base44, booking, user.id, `${idempotency_key}:event`);

    const conversations = await base44.asServiceRole.entities.Conversation.filter({ job_id: job.id, tradie_id: request.tradie_id });
    const conversation = conversations[0] || await base44.asServiceRole.entities.Conversation.create({ job_id: job.id, job_title: job.title, customer_id: user.id, tradie_id: request.tradie_id, contact_unlocked: true });
    await notifyUser(base44, request.tradie_id, { type: 'accepted', title: 'Quote accepted', body: `Your quote for "${job.title}" was accepted.`, link: '/messages' });
    return ok({ status: 'accepted', booking, conversation_id: conversation.id });
  } catch (error) {
    return serverError(error);
  }
}
