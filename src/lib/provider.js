import { PHASE1_SERVICES } from '../domain/catalogue.js';
import { evidenceExpiryState } from '../domain/eligibility.js';

export const PROVIDER_NAV = Object.freeze([
  { to: '/provider/today', label: 'Today', icon: 'Home' },
  { to: '/provider/requests', label: 'Requests', icon: 'ClipboardList' },
  { to: '/provider/jobs', label: 'Jobs', icon: 'BriefcaseBusiness' },
  { to: '/provider/calendar', label: 'Calendar', icon: 'CalendarDays' },
  { to: '/provider/more', label: 'More', icon: 'Menu' },
]);

export const providerStatusLabel = (row = {}) => {
  if (row.superseded_at || row.superseded_by_evidence_id) return 'Superseded';
  if (row.review_status === 'suspended') return 'Suspended';
  if (row.review_status === 'rejected' || row.submission_status === 'changes_required') return 'Changes required';
  if (row.review_status === 'verified') return evidenceExpiryState(row.expires_date) === 'expired' ? 'Expired' : 'Verified';
  if (row.review_status === 'approved' && row.active && row.available) return 'Active';
  if (row.review_status === 'approved' && !row.active) return 'Approved · inactive';
  if (row.review_status === 'approved' && !row.available) return 'Approved · unavailable';
  if (['submitted', 'under_review'].includes(row.submission_status)) return 'Under review';
  return 'Draft';
};

export function projectedInvitationStatus(row, now = new Date()) {
  if (row?.status === 'pending' && row.expires_at && new Date(row.expires_at).getTime() <= new Date(now).getTime()) return 'expired';
  return row?.status || 'unknown';
}

export const ownedProviderProjection = ({ userId, invitations = [], bookings = [], offerings = [], evidence = [], now = new Date() }) => {
  // Invitation snapshots are already scoped to auth.uid() by their dedicated
  // SECURITY DEFINER RPC and deliberately omit provider/customer identifiers.
  const ownedInvitations = invitations;
  const ownedBookings = bookings.filter((row) => row.provider_id === userId && row.state !== 'superseded');
  return {
    pending_requests: ownedInvitations.filter((row) => projectedInvitationStatus(row, now) === 'pending').length,
    needs_scheduling: ownedBookings.filter((row) => row.state === 'accepted' && !row.scheduled_start).length,
    scheduled_today: ownedBookings.filter((row) => row.state === 'scheduled' && melbourneDate(row.scheduled_start) === melbourneDate(now)).length,
    review_required: offerings.filter((row) => row.provider_id === userId && (row.reverification_required || !['approved'].includes(row.review_status))).length,
    evidence_alerts: evidence.filter((row) => row.provider_id === userId && ['expired', 'expires_within_7_days', 'expires_within_30_days'].includes(evidenceExpiryState(row.expires_date, now))).length,
  };
};

export function providerCalendarGroups(bookings = []) {
  return bookings.filter((row) => !['superseded', 'cancelled', 'disputed'].includes(row.state) && row.scheduled_start).reduce((groups, row) => {
    const key = melbourneDate(row.scheduled_start) || 'invalid';
    return { ...groups, [key]: [...(groups[key] || []), row] };
  }, {});
}

export function providerBookingGroups(bookings = [], now = new Date()) {
  const current = new Date(now).getTime();
  return {
    upcoming: bookings.filter((row) => ['accepted', 'scheduled'].includes(row.state) && (!row.scheduled_start || new Date(row.scheduled_start).getTime() >= current)),
    in_progress: bookings.filter((row) => row.state === 'in_progress'),
    history: bookings.filter((row) => ['completed', 'cancelled', 'disputed'].includes(row.state) || (row.state === 'scheduled' && new Date(row.scheduled_start).getTime() < current)),
  };
}

export function providerServiceLabels(serviceKey, scopeIds = []) {
  const service = PHASE1_SERVICES.find((item) => item.key === serviceKey);
  return { service: service?.name || 'Configured service unavailable', scopes: scopeIds.map((id) => service?.scope_options.find((scope) => scope.id === id)?.label).filter(Boolean) };
}

export function providerSetupRequirements(serviceKey) {
  const service = PHASE1_SERVICES.find((item) => item.key === serviceKey);
  return service ? service.evidence_requirements : [];
}

export function providerActionOpen(serviceKey, action) {
  const service = PHASE1_SERVICES.find((item) => item.key === serviceKey);
  const flag = { setup: 'provider_onboarding_enabled', quote: 'quote_enabled', booking: 'booking_enabled', recurrence: 'recurrence_enabled' }[action];
  return Boolean(service && flag && service.flags.public_release_enabled && service.flags[flag]);
}

export function melbourneDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function formatMelbourneDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Schedule unavailable';
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
