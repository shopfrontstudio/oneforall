// Notifications are now emitted only here, as a side effect of an action the
// backend has already authorised. Notification.create is closed to the client, so
// a notification's title, body and link can no longer be chosen by a stranger.

// Mirrors pseudoDistance in src/lib/oneforall.js — the two must agree, or a tradie
// would be notified about jobs the UI then refuses to rank for them.
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function pseudoDistance(a = '', b = '') {
  const h = Math.abs(hashStr((a || '').toLowerCase() + (b || '').toLowerCase())) % 24;
  return h + 0.8;
}

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

// Verified, available tradies whose trades and radius cover this job.
export async function matchingTradies(base44, job) {
  const tradies = await base44.asServiceRole.entities.TradieProfile.filter({
    verified: true,
    open_to_work: true,
  });
  return tradies.filter(
    (tradie) =>
      (tradie.trade_categories || []).includes(job.category_slug) &&
      pseudoDistance(job.suburb, tradie.suburb) <= (tradie.service_radius_km || 20),
  );
}

export async function notifyMatchingTradies(base44, job, notification) {
  const eligible = await matchingTradies(base44, job);
  await Promise.allSettled(eligible.map((tradie) => notifyUser(base44, tradie.user_id, notification)));
  return eligible.length;
}
