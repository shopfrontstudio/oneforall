import { PHASE1_SERVICES } from '../domain/catalogue.js';
import { evidenceExpiryState } from '../domain/eligibility.js';

export const PROVIDER_NAV = Object.freeze([
  { to: '/provider/today', label: 'Today', icon: 'Home' },
  { to: '/provider/jobs', label: 'Jobs', icon: 'BriefcaseBusiness' },
  { to: '/provider/calendar', label: 'Calendar', icon: 'CalendarDays' },
  { to: '/provider/account', label: 'Account', icon: 'User' },
]);

export const PROVIDER_FEATURE_DEFAULTS = Object.freeze({
  provider_workspace_visible: true,
  application_writes_enabled: false,
  sensitive_uploads_enabled: false,
  hybrid_checks_enabled: false,
  transactional_email_enabled: false,
  provider_job_actions_enabled: false,
});

export const PROVIDER_APPLICATION_STATUS = Object.freeze({
  not_started: 'Not started',
  draft: 'In progress',
  submitted: 'Under review',
  under_review: 'Under review',
  action_required: 'Action needed',
  approved: 'Approved',
  expired: 'Expired',
  rejected: 'Action needed',
  suspended: 'Action needed',
});

export const PROVIDER_APPLICATION_STEPS = Object.freeze([
  { id: 1, label: 'About you', description: 'Your provider type and basic business details.' },
  { id: 2, label: 'Services', description: 'What you do, where you work and your regular availability.' },
  { id: 3, label: 'Verification', description: 'Identity, ABN, insurance and service-specific credentials.' },
  { id: 4, label: 'Review', description: 'Check your application and complete the declarations.' },
]);

export function providerApplicationStatusLabel(status) {
  return PROVIDER_APPLICATION_STATUS[status || 'not_started'] || 'In progress';
}

export function mergeProviderControls(row) {
  return { ...PROVIDER_FEATURE_DEFAULTS, ...(row || {}) };
}

export function providerEvidenceRequirements(serviceKeys = []) {
  const selected = new Set(serviceKeys);
  const requirements = new Map();
  if (selected.size) {
    for (const evidence_type of ['worker_identity', 'worker_relationship']) {
      const key = `worker:${evidence_type}`;
      requirements.set(key, { key, evidence_type, subject: 'worker', expiry_required: false, scope_ids: ['*'], service_keys: [...selected] });
    }
  }
  for (const service of PHASE1_SERVICES) {
    if (!selected.has(service.key)) continue;
    for (const requirement of service.evidence_requirements) {
      const key = `${requirement.subject}:${requirement.evidence_type}`;
      const current = requirements.get(key);
      requirements.set(key, {
        ...requirement,
        key,
        service_keys: [...new Set([...(current?.service_keys || []), service.key])],
        expiry_required: Boolean(current?.expiry_required || requirement.expiry_required),
      });
    }
  }
  return [...requirements.values()];
}

export function evidenceRequirementLabel(value) {
  const labels = {
    responsible_identity: 'Identity',
    worker_identity: 'Worker identity',
    worker_relationship: 'Worker relationship to the business',
    abn_entity_match: 'ABN details',
    service_specific_insurance: 'Public liability insurance',
    victorian_electrical_contractor_registration: 'Victorian electrical contractor registration',
    victorian_electrical_licence: 'Victorian electrical licence',
    victorian_plumbing_registration_or_licence: 'Victorian plumbing registration or licence',
    victorian_builder_registration_where_required: 'Victorian builder registration',
    victorian_pest_licence: 'Victorian pest-control licence',
    goods_in_transit_insurance: 'Goods-in-transit insurance',
  };
  if (labels[value]) return labels[value];
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export function providerApplicationCompletion(application = {}, evidence = []) {
  const completed = new Set(application.completed_steps || []);
  const requiredEvidence = evidence.filter((row) => !row.superseded_at);
  return {
    completed_steps: completed.size,
    total_steps: PROVIDER_APPLICATION_STEPS.length,
    evidence_total: requiredEvidence.length,
    evidence_ready: requiredEvidence.filter((row) => ['submitted', 'under_review'].includes(row.submission_status) || row.review_status === 'verified').length,
    complete: completed.size === PROVIDER_APPLICATION_STEPS.length,
  };
}

export function validProviderPriceRange(low, high) {
  const minimum = Number(low);
  const maximum = Number(high);
  return Number.isFinite(minimum) && Number.isFinite(maximum) && minimum > 0 && maximum >= minimum;
}

export function invitationCountdown(expiresAt, now = new Date()) {
  const remaining = new Date(expiresAt).getTime() - new Date(now).getTime();
  if (!Number.isFinite(remaining) || remaining <= 0) return 'Expired';
  const minutes = Math.ceil(remaining / 60000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h${remainder ? ` ${remainder}m` : ''} left`;
}

export const providerStatusLabel = (row = {}) => {
  if (row.superseded_at || row.superseded_by_evidence_id) return 'Expired';
  if (row.review_status === 'suspended') return 'Action needed';
  if (row.review_status === 'rejected' || row.submission_status === 'changes_required') return 'Action needed';
  if (row.review_status === 'verified') return evidenceExpiryState(row.expires_date) === 'expired' ? 'Expired' : 'Approved';
  if (row.review_status === 'approved') return 'Approved';
  if (['submitted', 'under_review'].includes(row.submission_status)) return 'Under review';
  if (row.document_path || row.requested_selected || row.display_name) return 'In progress';
  return 'Not started';
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

export function providerNextActions({ application = null, invitations = [], bookings = [], evidence = [], now = new Date() }) {
  const actions = [];
  const status = application?.status || 'not_started';
  if (status === 'not_started') actions.push({ key: 'application', title: 'Become a provider', body: 'Start the four-step application.', to: '/provider/apply' });
  if (status === 'draft') actions.push({ key: 'application', title: 'Finish your application', body: `Continue from step ${application?.current_step || 1}.`, to: '/provider/apply' });
  if (['action_required', 'rejected', 'suspended'].includes(status)) actions.push({ key: 'application', title: 'Application needs attention', body: application?.provider_action_reason || 'Review the requested changes.', to: '/provider/apply' });
  const pending = invitations.filter((row) => projectedInvitationStatus(row, now) === 'pending');
  if (pending.length) actions.push({ key: 'matches', title: `Respond to ${pending.length} new ${pending.length === 1 ? 'match' : 'matches'}`, body: 'Review scope, timing and the indicative range.', to: '/provider/jobs?section=matches' });
  const unscheduled = bookings.filter((row) => row.state === 'accepted' && !row.scheduled_start);
  if (unscheduled.length) actions.push({ key: 'schedule', title: `Schedule ${unscheduled.length} ${unscheduled.length === 1 ? 'job' : 'jobs'}`, body: 'Confirm a date and time with the customer.', to: '/provider/jobs?section=upcoming' });
  const today = bookings.filter((row) => ['scheduled', 'in_progress'].includes(row.state) && melbourneDate(row.scheduled_start) === melbourneDate(now));
  if (today.length) actions.push({ key: 'today', title: `${today.length} ${today.length === 1 ? 'job' : 'jobs'} today`, body: 'Open the booking before you travel or start work.', to: '/provider/calendar' });
  const expiring = evidence.filter((row) => ['expired', 'expires_within_7_days', 'expires_within_30_days'].includes(evidenceExpiryState(row.expires_date, now)));
  if (expiring.length) actions.push({ key: 'evidence', title: `${expiring.length} ${expiring.length === 1 ? 'document needs' : 'documents need'} attention`, body: 'Update expired or expiring evidence.', to: '/provider/account#verification' });
  return actions;
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
