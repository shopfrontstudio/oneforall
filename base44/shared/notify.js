// Notifications are now emitted only here, as a side effect of an action the
// backend has already authorised. Notification.create is closed to the client, so
// a notification's title, body and link can no longer be chosen by a stranger.

import { loadServiceEligibility } from './marketplace.js';
import { getPhase1Service, PHASE1_POLICY_VERSION } from './phase1-catalogue.js';
import { latestPublicAssertionForServicePeriod } from './public-assertions.js';
import { serviceDateHasPassed } from './guards.js';

// Best-effort: a failed notification must never fail the action that triggered it.
export async function notifyUser(base44, userId, { type, title, body, link }) {
  if (!userId) return;
  try {
    await base44.asServiceRole.entities.Notification.create({
      user_id: userId,
      type,
      title,
      body,
      link,
      read: false,
    });
  } catch (error) {
    console.error('notification failed for', userId, error?.message || error);
  }
}

// Server-approved offerings whose evidence, coverage, availability, capacity and
// account standing all pass. A profile checkbox or generic verified badge is never
// an eligibility input.
export async function matchingTradies(base44, job) {
  if (job.preferred_date && serviceDateHasPassed(job.preferred_date)) return [];
  const offerings = await base44.asServiceRole.entities.ProviderOffering.filter({ service_key: job.service_key, review_status: 'approved' });
  const eligible = await Promise.all(offerings.map(async (offering) => {
    const result = await loadServiceEligibility(base44, {
      providerId: offering.provider_id,
      serviceKey: job.service_key,
      selectedScopeIds: job.selected_scope_ids,
      suburb: job.suburb,
      now: new Date(job.preferred_date || Date.now()),
    });
    if (!result.eligible) return null;
    const assertions = await base44.asServiceRole.entities.ProviderPublicAssertion.filter({ provider_id: offering.provider_id });
    const assertion = latestPublicAssertionForServicePeriod(assertions, job.service_key, new Date(job.preferred_date || Date.now()));
    if (!assertion) return null;
    return {
      provider_id: offering.provider_id,
      offering_id: offering.id,
      provider_assertion_id: assertion.id,
      display_name: assertion.display_name,
      assertion_evidence_checked_date: assertion.evidence_checked_date,
      assertion_valid_through: assertion.valid_through,
    };
  }));
  return eligible.filter(Boolean);
}

export async function notifyMatchingTradies(base44, job, notification) {
  const eligible = await matchingTradies(base44, job);
  const definition = getPhase1Service(job.service_key);
  const selectedScopeLabels = (job.selected_scope_ids || []).map((scopeId) => definition?.scope_options.find((scope) => scope.id === scopeId)?.label).filter(Boolean);
  await Promise.allSettled(eligible.map(async (match) => {
    const existing = await base44.asServiceRole.entities.Invitation.filter({ job_id: job.id, tradie_id: match.provider_id });
    if (!existing.some((invitation) => invitation.status !== 'declined')) {
      await base44.asServiceRole.entities.Invitation.create({
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
        customer_id: job.customer_id,
        tradie_id: match.provider_id,
        tradie_name: match.display_name,
        provider_assertion_id: match.provider_assertion_id,
        provider_assertion_evidence_checked_date: match.assertion_evidence_checked_date,
        provider_assertion_valid_through: match.assertion_valid_through,
        status: 'pending',
      });
    }
    await notifyUser(base44, match.provider_id, notification);
  }));
  return eligible.length;
}
