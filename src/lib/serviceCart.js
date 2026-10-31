import { sanitiseIntakeDraft, evaluateIntakeDraft, INTAKE_TTL_MS } from './intake.js';

export const CART_LIMIT = 8;
const key = (userId) => `oneforall.service-cart.${userId}`;
export function requestPayload(draft) {
  const safe = sanitiseIntakeDraft(draft);
  if (!safe) throw new Error('Choose a valid service.');
  const { version, policy_version, saved_at, photo_names, ...payload } = safe;
  return payload;
}
export function loadCart(userId, storage = globalThis.sessionStorage, now = Date.now()) {
  if (!userId) return [];
  try {
    const cart = JSON.parse(storage.getItem(key(userId)) || 'null');
    if (!cart || cart.saved_at > now || now - cart.saved_at > INTAKE_TTL_MS || !Array.isArray(cart.items)) return [];
    return cart.items.slice(0, CART_LIMIT).map(sanitiseIntakeDraft).filter(Boolean);
  } catch { return []; }
}
export function saveCart(userId, items, storage = globalThis.sessionStorage, now = Date.now()) {
  if (!userId) throw new Error('Sign in to keep your service list private.');
  if (!Array.isArray(items) || items.length > CART_LIMIT) throw new Error(`Add up to ${CART_LIMIT} services at a time.`);
  const safe = items.map(sanitiseIntakeDraft);
  if (safe.some((item) => !item)) throw new Error('An item is no longer available.');
  storage.setItem(key(userId), JSON.stringify({ saved_at: now, items: safe }));
  return safe;
}
export function addToCart(userId, draft, storage = globalThis.sessionStorage, now = Date.now()) {
  if (!['ready', 'manual_review'].includes(evaluateIntakeDraft(draft).state)) throw new Error('Complete the service details first.');
  const items = loadCart(userId, storage, now).filter((item) => item.idempotency_key !== draft.idempotency_key);
  return saveCart(userId, [...items, draft], storage, now);
}
export function clearCart(userId, storage = globalThis.sessionStorage) {
  if (userId) storage.removeItem(key(userId));
}
