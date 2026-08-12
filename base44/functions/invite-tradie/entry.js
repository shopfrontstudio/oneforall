import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { currentUser, serviceDateHasPassed } from '../../shared/guards.js';
import { loadServiceEligibility } from '../../shared/marketplace.js';
import { notifyUser } from '../../shared/notify.js';
import { getPhase1Service, PHASE1_POLICY_VERSION } from '../../shared/phase1-catalogue.js';
import { latestPublicAssertionForServicePeriod } from '../../shared/public-assertions.js';

// A customer invites a specific tradie to quote on one of their own jobs.
//
// Invitations carry a minimal request snapshot. They never disclose customer
// identity, contact details, access/safety notes, photos or private budget.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();

    const { job_id, provider_assertion_id } = await req.json();
    if (!job_id || !provider_assertion_id) return fail('A job and a reviewed provider assertion are required.');

    const job = await base44.asServiceRole.entities.Job.get(job_id);
    if (!job) return fail('That job no longer exists.', 404);
    if (job.customer_id !== user.id) return forbidden('You can only invite tradies to your own jobs.');
    if (job.status !== 'published') return fail('Publish the job before inviting tradies.');

    if (job.preferred_date && serviceDateHasPassed(job.preferred_date)) return fail('The preferred service date has passed.', 409);
    const requestedAssertion = await base44.asServiceRole.entities.ProviderPublicAssertion.get(provider_assertion_id);
    const assertion = latestPublicAssertionForServicePeriod([requestedAssertion], job.service_key, new Date(job.preferred_date || Date.now()));
    if (!assertion?.provider_id) return fail('That provider assertion is not current for this service.', 404);
    if (assertion.provider_id === user.id) return forbidden('You cannot invite yourself.');

    const eligibility = await loadServiceEligibility(base44, {
      providerId: assertion.provider_id,
      serviceKey: job.service_key,
      selectedScopeIds: job.selected_scope_ids,
      suburb: job.suburb,
      now: new Date(job.preferred_date || Date.now()),
    });
    if (!eligibility.eligible) return fail(`This provider cannot be invited for this service: ${eligibility.reason}.`, 403);

    const existing = await base44.asServiceRole.entities.Invitation.filter({
      job_id: job.id,
      tradie_id: assertion.provider_id,
    });
    if (existing.some((item) => item.status !== 'declined')) {
      return ok({ already_invited: true });
    }

    const definition = getPhase1Service(job.service_key);
    const selectedScopeLabels = (job.selected_scope_ids || []).map((scopeId) => definition?.scope_options.find((scope) => scope.id === scopeId)?.label).filter(Boolean);
    const invitation = await base44.asServiceRole.entities.Invitation.create({
      job_id: job.id,
      job_title: definition?.name || 'Managed service request',
      service_key: job.service_key,
      selected_scope_ids: job.selected_scope_ids,
      selected_scope_labels: selectedScopeLabels,
      service_area: job.suburb,
      preferred_date: job.preferred_date,
      urgency: job.urgency,
      indicative_low: job.indicative_low,
      indicative_high: job.indicative_high,
      policy_version: PHASE1_POLICY_VERSION,
      customer_id: user.id,
      tradie_id: assertion.provider_id,
      tradie_name: assertion.display_name,
      provider_assertion_id: assertion.id,
      provider_assertion_evidence_checked_date: assertion.evidence_checked_date,
      provider_assertion_valid_through: assertion.valid_through,
      status: 'pending',
    });

    await notifyUser(base44, assertion.provider_id, {
      type: 'invitation',
      title: 'Direct job invitation',
      body: `You received a managed ${definition?.name || 'service'} request in ${job.suburb}.`,
      link: '/provider/discover',
    });

    return ok({ invitation });
  } catch (error) {
    return serverError(error);
  }
}
