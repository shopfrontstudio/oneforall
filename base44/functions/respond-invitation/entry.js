import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { cleanText, currentUser, parseQuote } from '../../shared/guards.js';
import { loadServiceEligibility } from '../../shared/marketplace.js';
import { PHASE1_POLICY_VERSION } from '../../shared/phase1-catalogue.js';
import { notifyUser } from '../../shared/notify.js';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();
    const payload = await req.json();
    if (!payload?.invitation_id || !['quote', 'decline'].includes(payload.action)) return fail('A valid invitation action is required.');
    const invitation = await base44.asServiceRole.entities.Invitation.get(payload.invitation_id);
    if (!invitation) return fail('That invitation no longer exists.', 404);
    if (invitation.tradie_id !== user.id) return forbidden('This invitation was not sent to you.');
    if (payload.action === 'decline') {
      if (invitation.status === 'declined') return ok({ status: 'declined', already_applied: true });
      await base44.asServiceRole.entities.Invitation.update(invitation.id, { status: 'declined' });
      return ok({ status: 'declined' });
    }
    if (invitation.status !== 'pending') return fail('You have already responded to this invitation.');
    if (!payload.attending_worker_id || !payload.idempotency_key) return fail('An attending worker and idempotency key are required.');
    const quote = parseQuote(payload);
    if (quote.error) return fail(quote.error);
    const job = await base44.asServiceRole.entities.Job.get(invitation.job_id);
    if (!job || job.status !== 'published') return fail('That job is no longer open for quotes.');
    const eligibility = await loadServiceEligibility(base44, { providerId: user.id, serviceKey: job.service_key, suburb: job.suburb });
    if (!eligibility.eligible) return fail(`Quote access blocked: ${eligibility.reason}.`, 403);
    const worker = await base44.asServiceRole.entities.ProviderWorker.get(payload.attending_worker_id);
    if (!worker?.active || worker.provider_id !== user.id || !worker.identity_verified || !worker.relationship_verified) return fail('The attending worker is not verified.', 403);

    const duplicate = await base44.asServiceRole.entities.InterestRequest.filter({ idempotency_key: payload.idempotency_key });
    let request = duplicate[0];
    if (!request) {
      const profiles = await base44.asServiceRole.entities.TradieProfile.filter({ user_id: user.id });
      request = await base44.asServiceRole.entities.InterestRequest.create({
        job_id: job.id, job_title: job.title, customer_id: job.customer_id, tradie_id: user.id,
        attending_worker_id: worker.id, service_key: job.service_key,
        tradie_name: profiles[0]?.full_name || invitation.tradie_name, tradie_business: profiles[0]?.business_name,
        quote_low: quote.low, quote_high: quote.high, earliest_availability: quote.availability,
        message: cleanText(payload.message, 2000), status: 'pending', idempotency_key: payload.idempotency_key,
        policy_version: PHASE1_POLICY_VERSION, response_deadline: new Date(Date.now() + 12 * 3600e3).toISOString(),
      });
    }
    await base44.asServiceRole.entities.Invitation.update(invitation.id, { status: 'responded', quote_low: quote.low, quote_high: quote.high, earliest_availability: quote.availability, message: cleanText(payload.message, 2000) });
    await notifyUser(base44, invitation.customer_id, { type: 'invite_response', title: 'Invitation response', body: `${invitation.tradie_name} responded to your invitation`, link: `/job/${job.id}` });
    return ok({ status: 'responded', request });
  } catch (error) {
    return serverError(error);
  }
}
