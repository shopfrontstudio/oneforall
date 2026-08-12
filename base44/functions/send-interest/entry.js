import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { currentUser, latestServiceDate, parseQuote, serviceDateHasPassed, validateLockedQuoteMessage } from '../../shared/guards.js';
import { evaluateWorkerEligibility, idempotencyScope, loadServiceEligibility } from '../../shared/marketplace.js';
import { PHASE1_POLICY_VERSION } from '../../shared/phase1-catalogue.js';
import { notifyUser } from '../../shared/notify.js';
import { latestPublicAssertionForServicePeriod } from '../../shared/public-assertions.js';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();
    const payload = await req.json();
    if (!payload?.invitation_id || !payload?.attending_worker_id || !payload?.idempotency_key) {
      return fail('A routed invitation, attending worker and idempotency key are required.');
    }
    const quote = parseQuote(payload);
    if (quote.error) return fail(quote.error);
    const quoteMessage = validateLockedQuoteMessage(payload.message);
    if (quoteMessage.error) return fail(quoteMessage.error, 422);
    const invitation = await base44.asServiceRole.entities.Invitation.get(payload.invitation_id);
    if (!invitation) return fail('That routed invitation no longer exists.', 404);
    if (invitation.tradie_id !== user.id) return forbidden('This request was not routed to you.');
    if (payload.job_id && payload.job_id !== invitation.job_id) return forbidden('The invitation does not match that request.');
    const duplicate = await base44.asServiceRole.entities.InterestRequest.filter(idempotencyScope.quote({ key: payload.idempotency_key, providerId: user.id, jobId: invitation.job_id }));
    if (duplicate[0]) return ok({ request: duplicate[0], already_sent: true });
    const existing = await base44.asServiceRole.entities.InterestRequest.filter({ job_id: invitation.job_id, tradie_id: user.id });
    const live = existing.find((item) => ['pending', 'accepted'].includes(item.status));
    if (live) {
      if (invitation.status === 'pending') await base44.asServiceRole.entities.Invitation.update(invitation.id, { status: 'responded' });
      return ok({ request: live, already_sent: true });
    }
    if (invitation.status !== 'pending') return fail('That routed invitation is no longer open.', 409);
    const job = await base44.asServiceRole.entities.Job.get(invitation.job_id);
    if (!job) return fail('That job no longer exists.', 404);
    if (job.status !== 'published') return fail('That job is no longer open for quotes.');
    if (job.customer_id === user.id) return forbidden('You cannot quote on your own job.');

    const serviceDate = latestServiceDate(job.preferred_date, quote.availability);
    if (serviceDateHasPassed(serviceDate)) return fail('The preferred service date has passed.', 409);
    const eligibility = await loadServiceEligibility(base44, { providerId: user.id, serviceKey: job.service_key, selectedScopeIds: job.selected_scope_ids, suburb: job.suburb, now: new Date(serviceDate) });
    if (!eligibility.eligible) return fail(`Quote access blocked: ${eligibility.reason}.`, 403);
    const worker = await base44.asServiceRole.entities.ProviderWorker.get(payload.attending_worker_id);
    const workerEvidence = await base44.asServiceRole.entities.ProviderEvidence.filter({ provider_id: user.id, worker_id: payload.attending_worker_id });
    const workerEligibility = evaluateWorkerEligibility({
      serviceKey: job.service_key,
      selectedScopeIds: job.selected_scope_ids,
      providerId: user.id,
      worker,
      workerEvidence,
      serviceDate,
      substitutionDisclosed: payload.substitution_disclosed === true,
    });
    if (!workerEligibility.eligible) return fail(`Attending worker blocked: ${workerEligibility.reason}.`, 403);

    const assertions = await base44.asServiceRole.entities.ProviderPublicAssertion.filter({ provider_id: user.id });
    const assertion = latestPublicAssertionForServicePeriod(assertions, job.service_key, new Date(serviceDate));
    if (!assertion) return fail('A current service-covering public assertion is required to quote.', 403);
    const providerLabel = assertion.display_name;

    const request = await base44.asServiceRole.entities.InterestRequest.create({
      job_id: job.id, job_title: invitation.job_title || 'Managed service request', customer_id: job.customer_id,
      tradie_id: user.id, attending_worker_id: worker.id, attending_worker_display_name: worker.display_name,
      worker_relationship_label: worker.is_subcontractor ? 'Subcontractor' : 'Provider team member',
      substitution_disclosed: payload.substitution_disclosed, service_key: job.service_key,
      selected_scope_ids: job.selected_scope_ids,
      tradie_name: providerLabel,
      provider_assertion_id: assertion.id,
      provider_assertion_evidence_checked_date: assertion.evidence_checked_date,
      provider_assertion_valid_through: assertion.valid_through,
      quote_low: quote.low, quote_high: quote.high, earliest_availability: quote.availability,
      message: quoteMessage.message, status: 'pending',
      idempotency_key: payload.idempotency_key, policy_version: PHASE1_POLICY_VERSION,
      response_deadline: new Date(Date.now() + 12 * 3600e3).toISOString(),
    });
    await base44.asServiceRole.entities.Invitation.update(invitation.id, { status: 'responded', quote_low: quote.low, quote_high: quote.high, earliest_availability: quote.availability, message: quoteMessage.message });
    await notifyUser(base44, job.customer_id, { type: 'interest', title: 'New managed quote', body: `${providerLabel} sent a quote for your request.`, link: `/booking/${job.id}` });
    return ok({ request });
  } catch (error) {
    return serverError(error);
  }
}
