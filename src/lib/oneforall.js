import { base44 } from '@/api/base44Client';
import { CATEGORY_META, PHASE1_SERVICES, PHASE1_SERVICE_MAP } from '@/lib/catalogue';

const PRIMARY = Object.freeze({
  cleaning: 'cleaning.routine_domestic', gardening: 'gardening.basic_maintenance', beauty: 'beauty.adult_low_risk',
  handyman: 'handyman.minor_tasks', electrical: 'electrical.licensed_services', plumbing: 'plumbing.licensed_services',
  carpentry: 'carpentry.household', 'building-renovation': 'building-renovation.managed_quote', painting: 'painting.residential',
  'rubbish-removal': 'rubbish-removal.ordinary', 'pest-control': 'pest-control.diagnostic',
  'moving-packing': 'moving-packing.household', 'not-sure': 'general.guided_request',
});
export const CATEGORIES = CATEGORY_META.map((category) => ({ slug: category.key, name: category.name, service_key: PRIMARY[category.key] }));
export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((category) => [category.slug, category]));
export const PRIMARY_SERVICE_BY_CATEGORY = PRIMARY;
export { PHASE1_SERVICES, PHASE1_SERVICE_MAP };
export const MARKETPLACE_RELEASE_OPEN = PHASE1_SERVICES.some((service) => service.flags.public_release_enabled);
export const PROVIDER_ONBOARDING_OPEN = PHASE1_SERVICES.some((service) => service.flags.provider_onboarding_enabled);
export const URGENCY_LABEL = { flexible: 'Flexible', this_week: 'This week', urgent: 'Urgent' };
export const JOB_STATUS_LABEL = { draft: 'Draft request', manual_review: 'Private review', submitted: 'Received', published: 'Routed', matched: 'Booked', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };
export const formatAUD = (value) => value == null ? '—' : `$${Math.round(value).toLocaleString('en-AU')}`;
export const formatAUDRange = (low, high) => low == null && high == null ? 'Quote after review' : `${formatAUD(low)} – ${formatAUD(high)}`;

export async function callFunction(name, payload = {}) {
  try { const response = await base44.functions.invoke(name, payload); return response.data; }
  catch (error) { throw new Error(error?.message || 'Something went wrong. Please try again.'); }
}
export const setAccountType = (type) => callFunction('set-account-type', { account_type: type });
export async function ensureProfile(type) {
  if (type === 'tradie') throw new Error('Provider onboarding is not currently available.');
  return callFunction('ensure-customer-profile');
}
export async function myUnreadNotifications(userId) {
  return (await base44.entities.Notification.filter({ user_id: userId, read: false })).length;
}
