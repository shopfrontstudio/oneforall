// Notifications are now emitted only here, as a side effect of an action the
// backend has already authorised. Notification.create is closed to the client, so
// a notification's title, body and link can no longer be chosen by a stranger.

import { loadServiceEligibility } from './marketplace.js';

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
  const offerings = await base44.asServiceRole.entities.ProviderOffering.filter({ service_key: job.service_key, review_status: 'approved' });
  const eligible = await Promise.all(offerings.map(async (offering) => {
    const result = await loadServiceEligibility(base44, { providerId: offering.provider_id, serviceKey: job.service_key, suburb: job.suburb });
    if (!result.eligible) return null;
    const profiles = await base44.asServiceRole.entities.TradieProfile.filter({ user_id: offering.provider_id });
    return profiles[0] || null;
  }));
  return eligible.filter(Boolean);
}

export async function notifyMatchingTradies(base44, job, notification) {
  const eligible = await matchingTradies(base44, job);
  await Promise.allSettled(eligible.map((tradie) => notifyUser(base44, tradie.user_id, notification)));
  return eligible.length;
}
