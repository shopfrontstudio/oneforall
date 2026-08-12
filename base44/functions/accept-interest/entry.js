import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { currentUser, latestServiceDate, serviceDateHasPassed } from '../../shared/guards.js';
import { bookingRepairPlan, chooseCanonicalBooking, evaluateBookingGate, idempotencyScope, loadServiceEligibility } from '../../shared/marketplace.js';
import { getPhase1Service, PHASE1_POLICY_VERSION } from '../../shared/phase1-catalogue.js';
import { notifyUser } from '../../shared/notify.js';
import { latestPublicAssertionForServicePeriod } from '../../shared/public-assertions.js';

async function reconcileAcceptedBooking(base44, { booking, job, request, actorId }) {
  const canonicalEventKey = `booking:${booking.id}:accepted`;
  const [quotes, events, conversations] = await Promise.all([
    base44.asServiceRole.entities.InterestRequest.filter({ job_id: job.id }),
    base44.asServiceRole.entities.BookingEvent.filter({ booking_id: booking.id }),
    base44.asServiceRole.entities.Conversation.filter({ job_id: job.id, tradie_id: booking.provider_id }),
  ]);
  const plan = bookingRepairPlan({ booking, job, quotes, events, conversations, eventKey: canonicalEventKey });
  if (!plan.winner_quote || plan.winner_quote.id !== request.id) return { conflict: true };
  // Base44 has no transaction: persist immutable canonical intent before mutable
  // mappings so an interrupted retry can detect and repair the remaining writes.
  if (plan.event_missing) {
    await base44.asServiceRole.entities.BookingEvent.create({
      booking_id: booking.id, job_id: booking.job_id, customer_id: booking.customer_id,
      provider_id: booking.provider_id, actor_id: actorId, actor_role: 'customer',
      event_type: 'booking_accepted', to_state: 'accepted', idempotency_key: canonicalEventKey,
      policy_version: PHASE1_POLICY_VERSION,
      metadata: {
        reconciliation: booking.state === 'accepted' ? 'canonical_acceptance' : 'historic_acceptance_repair',
        observed_booking_state: booking.state,
        canonical_booking_id: booking.id,
        canonical_quote_id: booking.quote_id,
      },
    });
  }
  for (const update of plan.quote_updates) {
    const { id, ...data } = update;
    await base44.asServiceRole.entities.InterestRequest.update(id, data);
  }
  if (plan.job_update) await base44.asServiceRole.entities.Job.update(job.id, plan.job_update);
  let conversation = plan.conversation;
  if (!conversation) {
    try {
      conversation = await base44.asServiceRole.entities.Conversation.create({
        job_id: job.id, job_title: job.title, customer_id: booking.customer_id,
        tradie_id: booking.provider_id, contact_unlocked: true,
      });
    } catch (error) {
      const repaired = await base44.asServiceRole.entities.Conversation.filter({ job_id: job.id, tradie_id: booking.provider_id });
      if (!repaired[0]) throw error;
      conversation = repaired[0];
    }
  }
  return { booking, conversation };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();
    const { request_id, action, idempotency_key, worker_acknowledged } = await req.json();
    if (!request_id || !['accept', 'decline'].includes(action)) return fail('A valid quote action is required.');
    if (!idempotency_key) return fail('An idempotency key is required.');
    const request = await base44.asServiceRole.entities.InterestRequest.get(request_id);
    if (!request) return fail('That quote no longer exists.', 404);
    const job = await base44.asServiceRole.entities.Job.get(request.job_id);
    if (!job) return fail('That request no longer exists.', 404);
    if (job.customer_id !== user.id) return forbidden('Only the customer who submitted this request can respond.');

    if (action === 'decline') {
      if (request.status === 'declined') return ok({ status: 'declined', already_applied: true });
      if (request.status !== 'pending') return fail('That quote can no longer be declined.', 409);
      await base44.asServiceRole.entities.InterestRequest.update(request.id, { status: 'declined' });
      return ok({ status: 'declined' });
    }

    const duplicate = await base44.asServiceRole.entities.Booking.filter(idempotencyScope.booking({ key: idempotency_key, customerId: user.id, jobId: job.id }));
    const existingBookings = await base44.asServiceRole.entities.Booking.filter({ job_id: job.id });
    const existingWinner = chooseCanonicalBooking([...existingBookings, ...duplicate].filter((row, index, rows) => rows.findIndex((other) => other.id === row.id) === index));
    if (existingWinner) {
      if (existingWinner.quote_id !== request.id) return fail('Another quote has already been accepted for this request.', 409);
      const repaired = await reconcileAcceptedBooking(base44, { booking: existingWinner, job, request, actorId: user.id });
      if (repaired.conflict) return fail('The canonical booking cannot be reconciled with this quote.', 409);
      return ok({ status: 'accepted', booking: repaired.booking, conversation_id: repaired.conversation.id, already_applied: true });
    }
    if (job.status !== 'published' || request.status !== 'pending') return fail('That quote can no longer be accepted.', 409);
    const definition = getPhase1Service(job.service_key);
    if (!definition?.flags.booking_enabled || !definition.flags.public_release_enabled) return fail('Booking is not enabled for this service.', 403);

    const serviceDate = latestServiceDate(job.preferred_date, request.earliest_availability);
    if (serviceDateHasPassed(serviceDate)) return fail('The preferred service date has passed.', 409);
    if (!request.provider_assertion_id) return fail('This quote has no reviewed provider assertion and cannot be booked.', 403);
    const assertionRows = await base44.asServiceRole.entities.ProviderPublicAssertion.filter({ provider_id: request.tradie_id });
    const assertion = latestPublicAssertionForServicePeriod(
      assertionRows.filter((candidate) => candidate.id === request.provider_assertion_id),
      job.service_key,
      new Date(serviceDate),
    );
    if (!assertion) return fail('The provider assertion for this quote is not current through the service date.', 403);
    const providerEligibility = await loadServiceEligibility(base44, {
      providerId: request.tradie_id, serviceKey: job.service_key,
      selectedScopeIds: job.selected_scope_ids, suburb: job.suburb, now: new Date(serviceDate),
    });
    const worker = await base44.asServiceRole.entities.ProviderWorker.get(request.attending_worker_id);
    const workerEvidence = await base44.asServiceRole.entities.ProviderEvidence.filter({ provider_id: request.tradie_id, worker_id: request.attending_worker_id });
    const gate = evaluateBookingGate({
      serviceKey: job.service_key, selectedScopeIds: job.selected_scope_ids,
      providerEligibility, worker, workerEvidence,
      hazardScreen: { status: job.hazard_screen_status, scope_decision: job.scope_decision },
      serviceDate,
      workerDisclosed: request.substitution_disclosed === true,
      customerAcknowledged: worker_acknowledged === true,
    });
    if (!gate.eligible) return fail(`Booking blocked: ${gate.reason}.`, 403);

    // Base44 exposes no transaction or unique constraint here. Canonical election,
    // loser supersession, and reconciliation make retries repair-safe and converge
    // races, but do not provide strict serialisability.
    const booking = await base44.asServiceRole.entities.Booking.create({
      job_id: job.id, quote_id: request.id, customer_id: user.id, provider_id: request.tradie_id,
      attending_worker_id: request.attending_worker_id, attending_worker_display_name: request.attending_worker_display_name,
      worker_relationship_label: request.worker_relationship_label, customer_worker_acknowledged: worker_acknowledged === true,
      service_key: job.service_key, selected_scope_ids: job.selected_scope_ids, state: 'accepted',
      hazard_screen_status: job.hazard_screen_status, scope_decision: job.scope_decision,
      substitution_disclosed: request.substitution_disclosed === true, idempotency_key, policy_version: PHASE1_POLICY_VERSION, version: 1,
    });
    const afterCreate = await base44.asServiceRole.entities.Booking.filter({ job_id: job.id });
    const winner = chooseCanonicalBooking(afterCreate);
    for (const candidate of afterCreate) {
      if (candidate.id !== winner.id && candidate.state !== 'superseded') {
        await base44.asServiceRole.entities.Booking.update(candidate.id, { state: 'superseded', version: Number(candidate.version || 1) + 1 });
      }
    }
    if (winner.id !== booking.id) return fail('Another quote won a simultaneous acceptance. Refresh this request.', 409);

    const repaired = await reconcileAcceptedBooking(base44, { booking, job, request, actorId: user.id });
    await notifyUser(base44, request.tradie_id, { type: 'accepted', title: 'Quote accepted', body: `Your quote for "${job.title}" was accepted.`, link: '/messages' });
    return ok({ status: 'accepted', booking, conversation_id: repaired.conversation.id });
  } catch (error) {
    return serverError(error);
  }
}
