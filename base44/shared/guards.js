// Shared validation used by the write-path functions.
//
// The rule these all serve: never trust an id, name or entitlement that arrived in
// the request body. Resolve the caller from their session, then read the related
// records with the service role and derive everything else from those.

// Resolves the caller from the request's auth context, or null if unauthenticated.
export async function currentUser(base44) {
  try {
    const user = await base44.auth.me();
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

// The name we are willing to attach to records the caller authors.
export function displayName(user) {
  return user.full_name || user.email;
}

// A tradie may only quote on a paid or trial plan. This used to be checked only in
// the browser, where it could be skipped by calling the entity API directly.
export async function hasPaidPlan(base44, tradieId) {
  const subscriptions = await base44.asServiceRole.entities.Subscription.filter({ tradie_id: tradieId });
  return subscriptions.some(
    (subscription) =>
      ['active', 'trial'].includes(subscription.status) && subscription.plan && subscription.plan !== 'free',
  );
}

// Quote ranges arrive as strings from number inputs.
export function parseQuote({ quote_low, quote_high, earliest_availability }) {
  const low = Number(quote_low);
  const high = Number(quote_high);
  if (!Number.isFinite(low) || low <= 0) return { error: 'Enter a valid lower quote.' };
  if (!Number.isFinite(high) || high < low) return { error: 'The upper quote must be at least the lower quote.' };
  if (!earliest_availability) return { error: 'Add an availability date.' };
  return { low, high, availability: String(earliest_availability) };
}

// Free-text that ends up stored and shown to another person.
export function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}
