import { base44 } from '@/api/base44Client';
import { PHASE1_SERVICES, PHASE1_SERVICE_MAP } from '../../base44/shared/phase1-catalogue.js';

export const CATEGORIES = [
  { slug: 'cleaning', name: 'Cleaning', icon: 'Sparkles', tint: 'mist', low: 120, high: 500, service_key: 'cleaning.routine_domestic' },
  { slug: 'gardening', name: 'Gardening', icon: 'Trees', tint: 'sage', low: 120, high: 800, service_key: 'gardening.basic_maintenance' },
  { slug: 'beauty', name: 'Beauty', icon: 'Sparkles', tint: 'terracotta', low: 60, high: 250, service_key: 'beauty.adult_low_risk' },
  { slug: 'handyman', name: 'Handyman', icon: 'Wrench', tint: 'sandstone', low: 100, high: 800, service_key: 'handyman.minor_tasks' },
  { slug: 'rubbish-removal', name: 'Rubbish Removal', icon: 'Wrench', tint: 'eucalyptus', low: 120, high: 900, service_key: 'rubbish-removal.ordinary' },
  { slug: 'pest-control', name: 'Pest Control', icon: 'ShieldCheck', tint: 'lime', low: 120, high: 500, service_key: 'pest-control.diagnostic' },
];
export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.slug, c]));
export const PRIMARY_SERVICE_BY_CATEGORY = Object.freeze(Object.fromEntries(CATEGORIES.map(c => [c.slug, c.service_key])));
export { PHASE1_SERVICES, PHASE1_SERVICE_MAP };
export const MARKETPLACE_RELEASE_OPEN = PHASE1_SERVICES.some(service => service.flags.public_release_enabled);
export const PROVIDER_ONBOARDING_OPEN = PHASE1_SERVICES.some(service => service.flags.provider_onboarding_enabled);

export const URGENCY_OPTIONS = [
  { value: 'flexible', label: 'Flexible', mult: 1.0 },
  { value: 'this_week', label: 'This week', mult: 1.15 },
  { value: 'urgent', label: 'Urgent', mult: 1.4 },
];

export const formatAUD = (n) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('en-AU'));
export const formatAUDRange = (lo, hi) => (lo == null && hi == null ? '—' : `${formatAUD(lo)} – ${formatAUD(hi)}`);

export function estimateRange(slug, urgency = 'flexible') {
  const c = CATEGORY_MAP[slug] || CATEGORIES[0];
  const m = (URGENCY_OPTIONS.find(u => u.value === urgency) || URGENCY_OPTIONS[0]).mult;
  return { low: Math.round((c.low * m) / 10) * 10, high: Math.round((c.high * m) / 10) * 10 };
}

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
export function pseudoDistance(a = '', b = '') {
  const h = Math.abs(hashStr((a || '').toLowerCase() + (b || '').toLowerCase())) % 24;
  return h + 0.8;
}

export function matchScore(job, tradie) {
  if (!job || !tradie) return 0;
  let s = 60;
  const cats = tradie.trade_categories || [];
  if (cats.includes(job.category_slug)) s += 22;
  else if (cats.includes('maintenance') || cats.includes('unsure')) s += 9;
  const dist = pseudoDistance(job.suburb, tradie.suburb);
  if (dist <= (tradie.service_radius_km || 20)) s += 10; else s -= 6;
  if (tradie.open_to_work) s += 4;
  if (job.urgency === 'urgent') s += 2;
  if (tradie.rating_avg > 4.5) s += 3;
  return Math.max(55, Math.min(99, Math.round(s)));
}

export const URGENCY_LABEL = { flexible: 'Flexible', this_week: 'This week', urgent: 'Urgent' };
export const JOB_STATUS_LABEL = {
  draft: 'Draft request', published: 'Request received', matched: 'Booked', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled',
};

export async function setAccountType(type) { return callFunction('set-account-type', { account_type: type }); }

export async function ensureProfile(type, user) {
  if (type === 'tradie') {
    if (!PROVIDER_ONBOARDING_OPEN) throw new Error('Provider onboarding is not currently available.');
    // The gated backend creates a provider draft after eligibility opens. The
    // client deliberately has no direct provider-draft creation path.
    return;
  } else {
    const ex = await base44.entities.CustomerProfile.filter({ user_id: user.id });
    if (!ex.length) await base44.entities.CustomerProfile.create({ user_id: user.id, full_name: user.full_name || user.email, suburb: 'Ballarat' });
  }
}

// Every write that involves another person now goes through a backend function, so
// the server can check ownership, entitlement and quotas before it happens. invoke()
// resolves to the raw axios response and throws on non-2xx, with the function's own
// message at err.response.data.error — unwrap both so callers get a plain result and
// a readable Error.
export async function callFunction(name, payload = {}) {
  try {
    const response = await base44.functions.invoke(name, payload);
    return response.data;
  } catch (error) {
    throw new Error(error?.response?.data?.error || error?.message || 'Something went wrong. Please try again.');
  }
}

export async function myUnreadNotifications(userId) {
  const n = await base44.entities.Notification.filter({ user_id: userId, read: false });
  return n.length;
}
