import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { bookingTransitionEligibilityInstant, currentUser, normaliseFutureDateTime, normaliseISODateTime } from '../../shared/guards.js';
import { canTransitionBooking, chooseCanonicalBooking, idempotencyScope, jobStateForBooking, loadExactBookingEligibility, transitionRepairPlan } from '../../shared/marketplace.js';
import { PHASE1_POLICY_VERSION } from '../../shared/phase1-catalogue.js';

async function repairTransition(base44, { booking, job, events, toState, eventKey, actorId, actorRole, scheduledStart = null }) {
  const eventScope = idempotencyScope.event({ key: eventKey, actorId, bookingId: booking.id, jobId: booking.job_id });
  const initialPlan = transitionRepairPlan({ booking, job, events, toState, eventScope, scheduledStart });
  let knownEvents = events;
  // Write the immutable intent first. Base44 has no transaction here, so a
  // retry can find this event and repair a booking/job update interrupted after it.
  if (initialPlan.event_missing) {
    const eventData = {
      booking_id: booking.id, job_id: booking.job_id, customer_id: booking.customer_id, provider_id: booking.provider_id,
      actor_id: actorId, actor_role: actorRole, event_type: 'booking_state_changed', from_state: booking.state,
      to_state: toState, idempotency_key: eventKey, policy_version: PHASE1_POLICY_VERSION,
    };
    if (toState === 'scheduled') eventData.metadata = { scheduled_start: scheduledStart };
    const createdEvent = await base44.asServiceRole.entities.BookingEvent.create(eventData);
    knownEvents = [...knownEvents, createdEvent];
  }

  // Best-effort post-event re-read: make sure this booking is still canonical and
  // compute repair from the latest state. Base44 does not expose a transaction or
  // compare-and-swap update, so this narrows but cannot eliminate the race window.
  const [bookingRows, refreshedJob, refreshedEvents] = await Promise.all([
    base44.asServiceRole.entities.Booking.filter({ job_id: booking.job_id }),
    base44.asServiceRole.entities.Job.get(booking.job_id),
    base44.asServiceRole.entities.BookingEvent.filter({ booking_id: booking.id }),
  ]);
  let current = chooseCanonicalBooking(bookingRows);
  if (!current || current.id !== booking.id) return { conflict: true };
  const eventIds = new Set(refreshedEvents.map((event) => event.id).filter(Boolean));
  knownEvents = [...refreshedEvents, ...knownEvents.filter((event) => !event.id || !eventIds.has(event.id))];
  const plan = transitionRepairPlan({ booking: current, job: refreshedJob, events: knownEvents, toState, eventScope, scheduledStart });
  const eligibilitySensitiveRepair = ['scheduled', 'in_progress'].includes(plan.effective_state)
    && (plan.booking_needs_update || plan.scheduled_start_needs_update);
  if (eligibilitySensitiveRepair) {
    const gate = await verifyTransitionEligibility(base44, { booking: current, job: refreshedJob, toState: plan.effective_state, scheduledStart });
    if (!gate.eligible) return { eligibility_failure: gate };
  }
  if (plan.booking_needs_update || plan.scheduled_start_needs_update) {
    const update = { version: Number(current.version || 1) + 1 };
    if (plan.booking_needs_update) update.state = plan.effective_state;
    if (plan.scheduled_start_needs_update) update.scheduled_start = plan.effective_scheduled_start;
    current = await base44.asServiceRole.entities.Booking.update(current.id, update);
  }

  const [postRows, postJob] = await Promise.all([
    base44.asServiceRole.entities.Booking.filter({ job_id: booking.job_id }),
    base44.asServiceRole.entities.Job.get(booking.job_id),
  ]);
  const elected = chooseCanonicalBooking(postRows);
  if (!elected || elected.id !== booking.id) return { conflict: true };
  const canonical = Number(current.version || 1) > Number(elected.version || 1) ? current : elected;
  const mappedJobState = jobStateForBooking(canonical.state);
  if (mappedJobState && postJob?.status !== mappedJobState) {
    await base44.asServiceRole.entities.Job.update(booking.job_id, { status: mappedJobState });
  }
  return { booking: canonical, conflict: false };
}

async function verifyTransitionEligibility(base44, { booking, job, toState, scheduledStart, now = new Date() }) {
  const eligibilityInstant = bookingTransitionEligibilityInstant({ booking, toState, scheduledStart, now });
  if (eligibilityInstant.error) return { eligible: false, reason: eligibilityInstant.error };
  return loadExactBookingEligibility(base44, { booking, job, serviceDate: eligibilityInstant.serviceDate });
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();
    const { booking_id, job_id, to_state, idempotency_key, expected_version, scheduled_start } = await req.json();
    if ((!booking_id && !job_id) || !to_state || !idempotency_key || !Number.isInteger(expected_version)) {
      return fail('A booking, state, expected version and idempotency key are required.');
    }
    const matches = booking_id
      ? [await base44.asServiceRole.entities.Booking.get(booking_id)]
      : await base44.asServiceRole.entities.Booking.filter({ job_id });
    const booking = booking_id ? matches.find((item) => item?.state !== 'superseded') : chooseCanonicalBooking(matches);
    if (!booking) return fail('That booking no longer exists.', 404);
    const actorRole = user.role === 'admin' ? 'admin' : booking.customer_id === user.id ? 'customer' : booking.provider_id === user.id ? 'provider' : null;
    if (!actorRole) return forbidden();
    const [job, events] = await Promise.all([
      base44.asServiceRole.entities.Job.get(booking.job_id),
      base44.asServiceRole.entities.BookingEvent.filter({ booking_id: booking.id }),
    ]);
    const eventScope = idempotencyScope.event({ key: idempotency_key, actorId: user.id, bookingId: booking.id, jobId: booking.job_id });
    const prior = events.find((event) => Object.entries(eventScope).every(([key, value]) => event[key] === value));
    if (prior) {
      const priorScheduledStart = prior.to_state === 'scheduled' ? normaliseISODateTime(prior.metadata?.scheduled_start) : null;
      if (prior.to_state === 'scheduled' && !priorScheduledStart) return fail('The original scheduling event has no valid scheduled time.', 409);
      // Recheck only if this immutable intent can still advance the canonical
      // booking. A historic retry that merely preserves later state stays a
      // non-mutating idempotent read and cannot regress or erase schedule data.
      if (booking.state === prior.from_state && ['scheduled', 'in_progress'].includes(prior.to_state)) {
        const gate = await verifyTransitionEligibility(base44, { booking, job, toState: prior.to_state, scheduledStart: priorScheduledStart });
        if (!gate.eligible) return fail(`Booking transition blocked: ${gate.reason}.`, 403);
      }
      const repaired = await repairTransition(base44, { booking, job, events, toState: prior.to_state, eventKey: idempotency_key, actorId: user.id, actorRole, scheduledStart: priorScheduledStart });
      if (repaired.eligibility_failure) return fail(`Booking transition blocked: ${repaired.eligibility_failure.reason}.`, 403);
      if (repaired.conflict) return fail('Another booking became canonical. Refresh before trying again.', 409);
      return ok({ booking: repaired.booking, already_applied: true });
    }
    if (Number(booking.version || 1) !== expected_version) return fail('This booking changed. Refresh before trying again.', 409);
    if (!canTransitionBooking(booking.state, to_state, actorRole)) return fail('That booking transition is not allowed.', 409);
    const scheduledStart = to_state === 'scheduled' ? normaliseFutureDateTime(scheduled_start) : null;
    if (to_state === 'scheduled' && !scheduledStart) return fail('Choose a valid future booking date and time.', 422);
    if (['scheduled', 'in_progress'].includes(to_state)) {
      const gate = await verifyTransitionEligibility(base44, { booking, job, toState: to_state, scheduledStart });
      if (!gate.eligible) return fail(`Booking transition blocked: ${gate.reason}.`, 403);
    }
    const updated = await repairTransition(base44, { booking, job, events, toState: to_state, eventKey: idempotency_key, actorId: user.id, actorRole, scheduledStart });
    if (updated.eligibility_failure) return fail(`Booking transition blocked: ${updated.eligibility_failure.reason}.`, 403);
    if (updated.conflict) return fail('Another booking became canonical. Refresh before trying again.', 409);
    return ok({ booking: updated.booking });
  } catch (error) {
    return serverError(error);
  }
}
