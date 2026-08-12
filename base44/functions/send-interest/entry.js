import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { cleanText, currentUser, displayName, parseQuote } from '../../shared/guards.js';
import { loadServiceEligibility } from '../../shared/marketplace.js';
import { PHASE1_POLICY_VERSION } from '../../shared/phase1-catalogue.js';
import { notifyUser } from '../../shared/notify.js';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();
    const payload = await req.json();
    if (!payload?.job_id || !payload?.attending_worker_id || !payload?.idempotency_key) {
      return fail('A job, attending worker and idempotency key are required.');
    }
    const quote = parseQuote(payload);
    if (quote.error) return fail(quote.error);
    const job = await base44.asServiceRole.entities.Job.get(payload.job_id);
    if (!job) return fail('That job no longer exists.', 404);
    if (job.status !== 'published') return fail('That job is no longer open for quotes.');
    if (job.customer_id === user.id) return forbidden('You cannot quote on your own job.');

    const eligibility = await loadServiceEligibility(base44, { providerId: user.id, serviceKey: job.service_key, suburb: job.suburb });
    if (!eligibility.eligible) return fail(`Quote access blocked: ${eligibility.reason}.`, 403);
    const worker = await base44.asServiceRole.entities.ProviderWorker.get(payload.attending_worker_id);
    if (!worker?.active || worker.provider_id !== user.id || !worker.identity_verified || !worker.relationship_verified) {
      return fail('The attending worker is not separately verified for this provider.', 403);
    }

    const duplicate = await base44.asServiceRole.entities.InterestRequest.filter({ idempotency_key: payload.idempotency_key });
    if (duplicate[0]) return ok({ request: duplicate[0], already_sent: true });
    const existing = await base44.asServiceRole.entities.InterestRequest.filter({ job_id: job.id, tradie_id: user.id });
    const live = existing.find((item) => item.status !== 'declined');
    if (live) return ok({ request: live, already_sent: true });
    const profiles = await base44.asServiceRole.entities.TradieProfile.filter({ user_id: user.id });
    const profile = profiles[0];
    if (!profile) return fail('Complete your provider profile first.');

    const request = await base44.asServiceRole.entities.InterestRequest.create({
      job_id: job.id, job_title: job.title, customer_id: job.customer_id,
      tradie_id: user.id, attending_worker_id: worker.id, service_key: job.service_key,
      tradie_name: profile.full_name || displayName(user), tradie_business: profile.business_name,
      quote_low: quote.low, quote_high: quote.high, earliest_availability: quote.availability,
      message: cleanText(payload.message, 2000), status: 'pending',
      idempotency_key: payload.idempotency_key, policy_version: PHASE1_POLICY_VERSION,
      response_deadline: new Date(Date.now() + 12 * 3600e3).toISOString(),
    });
    await notifyUser(base44, job.customer_id, { type: 'interest', title: 'New quote', body: `${profile.business_name || profile.full_name || displayName(user)} sent a quote for "${job.title}"`, link: `/job/${job.id}` });
    return ok({ request });
  } catch (error) {
    return serverError(error);
  }
}
