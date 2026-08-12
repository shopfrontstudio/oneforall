import { base44 } from '@/api/base44Client';

export const CATEGORIES = [
  { slug: 'electrical', name: 'Electrical', icon: 'Zap', tint: 'terracotta', low: 120, high: 450 },
  { slug: 'plumbing', name: 'Plumbing', icon: 'Droplets', tint: 'mist', low: 110, high: 600 },
  { slug: 'carpentry', name: 'Carpentry', icon: 'Hammer', tint: 'sandstone', low: 200, high: 1200 },
  { slug: 'building', name: 'Building & Renovation', icon: 'HardHat', tint: 'eucalyptus', low: 2000, high: 25000 },
  { slug: 'painting', name: 'Painting', icon: 'PaintRoller', tint: 'terracotta', low: 350, high: 2500 },
  { slug: 'gardening', name: 'Gardening & Outdoor', icon: 'Trees', tint: 'sage', low: 150, high: 1200 },
  { slug: 'cleaning', name: 'Cleaning', icon: 'Sparkles', tint: 'mist', low: 120, high: 500 },
  { slug: 'maintenance', name: 'General Maintenance', icon: 'Wrench', tint: 'sandstone', low: 100, high: 800 },
  { slug: 'unsure', name: "Not sure what I need", icon: 'HelpCircle', tint: 'lime', low: 150, high: 1000 },
];
export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.slug, c]));

export const URGENCY_OPTIONS = [
  { value: 'flexible', label: 'Flexible', mult: 1.0 },
  { value: 'this_week', label: 'This week', mult: 1.15 },
  { value: 'urgent', label: 'Urgent', mult: 1.4 },
];

export const PLAN_INFO = {
  free: { name: 'Free', price: 0, radius: 0, perks: ['Verified profile', 'Anonymous job browsing', 'Suitable-job notifications'] },
  local: { name: 'Local', price: 69, radius: 20, perks: ['One service area', '20 km radius', 'Unlimited interest requests', 'Messaging & quotes', 'Contact unlocks'] },
  pro: { name: 'Pro', price: 99, radius: 60, perks: ['60 km radius', 'Multiple saved service areas', 'Broader notifications', 'Future business tools'] },
};

export const formatAUD = (n) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('en-AU'));
export const formatAUDRange = (lo, hi) => (lo == null && hi == null ? '—' : `${formatAUD(lo)} – ${formatAUD(hi)}`);

export function estimateRange(slug, urgency = 'flexible') {
  const c = CATEGORY_MAP[slug] || CATEGORY_MAP.unsure;
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
  draft: 'Draft', published: 'Open', matched: 'Matched', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled',
};

export async function setAccountType(type) { await base44.auth.updateMe({ account_type: type }); }

export async function ensureProfile(type, user) {
  if (type === 'tradie') {
    const ex = await base44.entities.TradieProfile.filter({ user_id: user.id });
    if (!ex.length) await base44.entities.TradieProfile.create({ user_id: user.id, full_name: user.full_name || user.email, open_to_work: true, service_radius_km: 20 });
    await ensureSubscription(user.id);
  } else {
    const ex = await base44.entities.CustomerProfile.filter({ user_id: user.id });
    if (!ex.length) await base44.entities.CustomerProfile.create({ user_id: user.id, full_name: user.full_name || user.email, suburb: 'Ballarat' });
  }
}

async function ensureSubscription(tradieId) {
  const ex = await base44.entities.Subscription.filter({ tradie_id: tradieId });
  if (!ex.length) {
    await base44.entities.Subscription.create({ tradie_id: tradieId, plan: 'pro', status: 'trial', founding_trial: true, started_date: new Date().toISOString(), expires_date: new Date(Date.now() + 30 * 864e5).toISOString() });
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
