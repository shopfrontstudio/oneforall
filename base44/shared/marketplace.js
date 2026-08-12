import { getPhase1Service, PHASE1_POLICY_VERSION } from './phase1-catalogue.js';
import { latestPublicAssertionForServicePeriod } from './public-assertions.js';

export const ELIGIBILITY_REASON = Object.freeze({
  ELIGIBLE: 'eligible',
  SERVICE_UNKNOWN: 'service_unknown',
  SERVICE_NOT_RELEASED: 'service_not_released',
  ACCOUNT_NOT_ACTIVE: 'account_not_active',
  OFFERING_NOT_APPROVED: 'offering_not_approved',
  OFFERING_INACTIVE: 'offering_inactive',
  OFFERING_SCOPE_MISMATCH: 'offering_scope_mismatch',
  REVERIFICATION_REQUIRED: 'reverification_required',
  EVIDENCE_MISSING: 'evidence_missing',
  EVIDENCE_NOT_VERIFIED: 'evidence_not_verified',
  EVIDENCE_EXPIRED: 'evidence_expired',
  EVIDENCE_EXPIRY_UNKNOWN: 'evidence_expiry_unknown',
  EVIDENCE_OUT_OF_SCOPE: 'evidence_out_of_scope',
  OUTSIDE_COVERAGE: 'outside_coverage',
  UNAVAILABLE: 'unavailable',
  NO_CAPACITY: 'no_capacity',
});

const normal = (value) => String(value || '').trim().toLowerCase();
const result = (eligible, reason, details = {}) => ({ eligible, reason, policy_version: PHASE1_POLICY_VERSION, ...details });
const sameScopeIds = (left = [], right = []) => {
  const normalised = (value) => [...new Set(Array.isArray(value) ? value.filter(Boolean) : [])].sort();
  return JSON.stringify(normalised(left)) === JSON.stringify(normalised(right));
};

// Records marked superseded by an admin-reviewed replacement cannot satisfy a
// gate. Creating/linking that replacement remains a next-checkpoint workflow;
// this pass intentionally adds no self-service evidence review UI.
export const isAuthoritativeEvidence = (item) => Boolean(item && !item.superseded_by_evidence_id && !item.superseded_at);

export function canSelectProviderExperience({ currentAccountType, onboardingOpen, hasProfile, hasApprovedOffering }) {
  return currentAccountType === 'tradie' || onboardingOpen === true || hasProfile === true || hasApprovedOffering === true;
}

export function evidenceExpiryState(expiresDate, now = new Date()) {
  if (!expiresDate) return 'no_expiry_recorded';
  const expiryTime = new Date(expiresDate).getTime();
  const referenceTime = new Date(now).getTime();
  if (!Number.isFinite(expiryTime) || !Number.isFinite(referenceTime)) return 'expired';
  const days = Math.ceil((expiryTime - referenceTime) / 86400000);
  if (days <= 0) return 'expired';
  if (days <= 7) return 'expires_within_7_days';
  if (days <= 30) return 'expires_within_30_days';
  return 'current';
}

export function evaluateServiceEligibility({ user, serviceKey, serviceDefinition = null, offering, evidence = [], selectedScopeIds = [], suburb, now = new Date() }) {
  const service = serviceDefinition || getPhase1Service(serviceKey);
  if (!service) return result(false, ELIGIBILITY_REASON.SERVICE_UNKNOWN);
  if (!service.flags.public_release_enabled || !service.flags.quote_enabled) {
    return result(false, ELIGIBILITY_REASON.SERVICE_NOT_RELEASED);
  }
  if (user?.account_standing !== 'active') return result(false, ELIGIBILITY_REASON.ACCOUNT_NOT_ACTIVE);
  if (!offering || offering.service_key !== serviceKey || offering.review_status !== 'approved') {
    return result(false, ELIGIBILITY_REASON.OFFERING_NOT_APPROVED);
  }
  if (!offering.active) return result(false, ELIGIBILITY_REASON.OFFERING_INACTIVE);
  if (offering.reverification_required !== false) return result(false, ELIGIBILITY_REASON.REVERIFICATION_REQUIRED);
  const requestedScopes = [...new Set(Array.isArray(selectedScopeIds) ? selectedScopeIds : [])];
  const configuredScopes = new Set((service.scope_options || []).map((scope) => scope.id));
  const approvedScopes = Array.isArray(offering.approved_scope) ? offering.approved_scope : [];
  if (!requestedScopes.length || requestedScopes.some((scopeId) => !configuredScopes.has(scopeId)) || (!approvedScopes.includes('*') && requestedScopes.some((scopeId) => !approvedScopes.includes(scopeId)))) {
    return result(false, ELIGIBILITY_REASON.OFFERING_SCOPE_MISMATCH, { selected_scope_ids: requestedScopes });
  }
  if (!offering.available) return result(false, ELIGIBILITY_REASON.UNAVAILABLE);
  if (Number(offering.capacity_remaining) <= 0) return result(false, ELIGIBILITY_REASON.NO_CAPACITY);
  const covered = (offering.coverage_suburbs || []).map(normal);
  if (!covered.includes('*') && (!normal(suburb) || !covered.includes(normal(suburb)))) {
    return result(false, ELIGIBILITY_REASON.OUTSIDE_COVERAGE);
  }

  const providerRequirements = (service.evidence_requirements || []).filter((requirement) => requirement.subject === 'provider' && ((requirement.scope_ids || []).includes('*') || requestedScopes.some((scopeId) => (requirement.scope_ids || []).includes(scopeId))));
  for (const requirement of providerRequirements) {
    const matching = evidence.filter((item) => isAuthoritativeEvidence(item) && item.evidence_type === requirement.evidence_type && item.subject_type === 'provider' && !item.worker_id);
    if (!matching.length) return result(false, ELIGIBILITY_REASON.EVIDENCE_MISSING, { evidence_type: requirement.evidence_type });
    const verified = matching.find((item) => item.review_status === 'verified');
    if (!verified) return result(false, ELIGIBILITY_REASON.EVIDENCE_NOT_VERIFIED, { evidence_type: requirement.evidence_type });
    if (requirement.evidence_type === 'abn_entity_match' && verified.abn_entity_match !== true) {
      return result(false, ELIGIBILITY_REASON.EVIDENCE_NOT_VERIFIED, { evidence_type: requirement.evidence_type });
    }
    if (requirement.expiry_required && !verified.expires_date) {
      return result(false, ELIGIBILITY_REASON.EVIDENCE_EXPIRY_UNKNOWN, { evidence_type: requirement.evidence_type });
    }
    if (evidenceExpiryState(verified.expires_date, now) === 'expired') {
      return result(false, ELIGIBILITY_REASON.EVIDENCE_EXPIRED, { evidence_type: requirement.evidence_type });
    }
    const scopes = verified.service_scopes || [];
    if (!scopes.includes('*') && !scopes.includes(serviceKey)) {
      return result(false, ELIGIBILITY_REASON.EVIDENCE_OUT_OF_SCOPE, { evidence_type: requirement.evidence_type });
    }
    const approvedEvidenceScopes = verified.approved_scope_ids || [];
    if (!approvedEvidenceScopes.includes('*') && requestedScopes.some((scopeId) => !approvedEvidenceScopes.includes(scopeId))) {
      return result(false, ELIGIBILITY_REASON.EVIDENCE_OUT_OF_SCOPE, { evidence_type: requirement.evidence_type });
    }
  }
  return result(true, ELIGIBILITY_REASON.ELIGIBLE);
}

export function evaluateWorkerEligibility({
  serviceKey,
  selectedScopeIds = [],
  providerId,
  worker,
  workerEvidence = [],
  serviceDate,
  substitutionDisclosed = false,
  serviceDefinition,
}) {
  if (!worker?.id || !worker.active || worker.provider_id !== providerId || !worker.identity_verified || !worker.relationship_verified) {
    return result(false, 'worker_not_verified');
  }
  if (!substitutionDisclosed) return result(false, 'worker_disclosure_required');
  if (worker.is_subcontractor && !worker.subcontractor_separately_verified) {
    return result(false, 'subcontractor_not_verified');
  }
  const service = serviceDefinition || getPhase1Service(serviceKey);
  if (!service) return result(false, ELIGIBILITY_REASON.SERVICE_UNKNOWN);
  const requestedScopes = [...new Set(Array.isArray(selectedScopeIds) ? selectedScopeIds.filter(Boolean) : [])];
  if (!requestedScopes.length) return result(false, 'worker_selected_scope_missing');
  const configuredScopes = new Set((service.scope_options || []).map((scope) => scope.id));
  if (requestedScopes.some((scopeId) => !configuredScopes.has(scopeId))) return result(false, 'worker_selected_scope_unknown');
  const workerRequirements = (service.evidence_requirements || []).filter((requirement) => requirement.subject === 'worker' && ((requirement.scope_ids || []).includes('*') || requestedScopes.some((scopeId) => (requirement.scope_ids || []).includes(scopeId))));
  for (const requirement of workerRequirements) {
    const matching = workerEvidence.filter((item) => isAuthoritativeEvidence(item) && item.evidence_type === requirement.evidence_type && item.subject_type === 'worker' && item.worker_id === worker.id);
    if (!matching.length) return result(false, 'worker_credentials_missing', { evidence_type: requirement.evidence_type });
    const verified = matching.find((item) => item.review_status === 'verified');
    if (!verified) return result(false, 'worker_credentials_not_verified', { evidence_type: requirement.evidence_type });
    if (requirement.expiry_required && !verified.expires_date) return result(false, 'worker_credentials_expiry_unknown', { evidence_type: requirement.evidence_type });
    if (verified.expires_date && evidenceExpiryState(verified.expires_date, serviceDate) === 'expired') {
      return result(false, 'worker_credentials_expired_on_service_date', { evidence_type: requirement.evidence_type });
    }
    const serviceScopes = verified.service_scopes || [];
    if (!serviceScopes.includes('*') && !serviceScopes.includes(serviceKey)) return result(false, 'worker_credentials_out_of_service_scope', { evidence_type: requirement.evidence_type });
    const approvedEvidenceScopes = verified.approved_scope_ids || [];
    if (!approvedEvidenceScopes.includes('*') && requestedScopes.some((scopeId) => !approvedEvidenceScopes.includes(scopeId))) {
      return result(false, 'worker_credentials_out_of_selected_scope', { evidence_type: requirement.evidence_type });
    }
  }
  return result(true, ELIGIBILITY_REASON.ELIGIBLE);
}

export function evaluateBookingGate({
  serviceKey,
  selectedScopeIds = [],
  providerEligibility,
  worker,
  workerEvidence = [],
  hazardScreen,
  serviceDate,
  workerDisclosed = false,
  customerAcknowledged = false,
  serviceDefinition,
}) {
  if (!providerEligibility?.eligible) return providerEligibility || result(false, ELIGIBILITY_REASON.OFFERING_NOT_APPROVED);
  const workerEligibility = evaluateWorkerEligibility({
    serviceKey,
    selectedScopeIds,
    providerId: providerEligibility.provider_id,
    worker,
    workerEvidence,
    serviceDate,
    substitutionDisclosed: workerDisclosed,
    serviceDefinition,
  });
  if (!workerEligibility.eligible) return workerEligibility;
  if (!customerAcknowledged) return result(false, 'worker_disclosure_not_acknowledged');
  if (hazardScreen?.status !== 'passed' || hazardScreen?.scope_decision !== 'allowed') return result(false, 'hazard_screen_not_passed');
  return result(true, ELIGIBILITY_REASON.ELIGIBLE);
}

export async function loadServiceEligibility(base44, { providerId, serviceKey, selectedScopeIds = [], suburb, now, serviceDefinition = null }) {
  const [provider, offerings, evidence] = await Promise.all([
    base44.asServiceRole.entities.User.get(providerId),
    base44.asServiceRole.entities.ProviderOffering.filter({ provider_id: providerId, service_key: serviceKey }),
    base44.asServiceRole.entities.ProviderEvidence.filter({ provider_id: providerId }),
  ]);
  const evaluation = evaluateServiceEligibility({ user: provider, serviceKey, serviceDefinition, offering: offerings[0], evidence, selectedScopeIds, suburb, now });
  return { ...evaluation, provider_id: providerId };
}

export async function loadExactBookingEligibility(base44, { booking, job, serviceDate, serviceDefinition = null }) {
  if (!booking || !job || booking.job_id !== job.id || booking.quote_id == null) {
    return result(false, 'booking_context_invalid');
  }
  const serviceInstant = new Date(serviceDate);
  if (!Number.isFinite(serviceInstant.getTime())) return result(false, 'service_date_invalid');
  const definition = serviceDefinition || getPhase1Service(booking.service_key);
  if (!definition?.flags.public_release_enabled || !definition.flags.quote_enabled || !definition.flags.booking_enabled) {
    return result(false, ELIGIBILITY_REASON.SERVICE_NOT_RELEASED);
  }
  if (booking.service_key !== job.service_key || booking.provider_id !== job.assigned_tradie_id || booking.quote_id !== job.accepted_quote_id || booking.hazard_screen_status !== job.hazard_screen_status || booking.scope_decision !== job.scope_decision) {
    return result(false, 'booking_canonical_mapping_mismatch');
  }
  const quote = await base44.asServiceRole.entities.InterestRequest.get(booking.quote_id);
  if (!quote || quote.job_id !== job.id || quote.tradie_id !== booking.provider_id || quote.attending_worker_id !== booking.attending_worker_id || quote.status !== 'accepted') {
    return result(false, 'accepted_quote_mismatch');
  }
  const selectedScopeIds = [...new Set(Array.isArray(job.selected_scope_ids) ? job.selected_scope_ids.filter(Boolean) : [])];
  if (!sameScopeIds(booking.selected_scope_ids, selectedScopeIds) || !sameScopeIds(quote.selected_scope_ids, selectedScopeIds)) {
    return result(false, ELIGIBILITY_REASON.OFFERING_SCOPE_MISMATCH);
  }
  const providerEligibility = await loadServiceEligibility(base44, {
    providerId: booking.provider_id,
    serviceKey: booking.service_key,
    selectedScopeIds,
    suburb: job.suburb,
    now: serviceInstant,
    serviceDefinition: definition,
  });
  if (!providerEligibility.eligible) return providerEligibility;
  if (!quote.provider_assertion_id) return result(false, 'provider_assertion_missing');
  const [worker, workerEvidence, assertions] = await Promise.all([
    base44.asServiceRole.entities.ProviderWorker.get(booking.attending_worker_id),
    base44.asServiceRole.entities.ProviderEvidence.filter({ provider_id: booking.provider_id, worker_id: booking.attending_worker_id }),
    base44.asServiceRole.entities.ProviderPublicAssertion.filter({ provider_id: booking.provider_id }),
  ]);
  const assertion = latestPublicAssertionForServicePeriod(
    assertions.filter((candidate) => candidate.id === quote.provider_assertion_id),
    booking.service_key,
    serviceDate,
  );
  if (!assertion) return result(false, 'provider_assertion_not_current_for_service_date');
  const gate = evaluateBookingGate({
    serviceKey: booking.service_key,
    selectedScopeIds,
    providerEligibility,
    worker,
    workerEvidence,
    hazardScreen: { status: booking.hazard_screen_status, scope_decision: booking.scope_decision },
    serviceDate,
    workerDisclosed: quote.substitution_disclosed === true && booking.substitution_disclosed === true,
    customerAcknowledged: booking.customer_worker_acknowledged === true,
    serviceDefinition: definition,
  });
  return gate.eligible ? { ...gate, quote, assertion } : gate;
}

export function chooseCanonicalBooking(bookings = []) {
  return [...bookings]
    .filter((booking) => booking.state !== 'superseded')
    .sort((a, b) => String(a.created_date || '').localeCompare(String(b.created_date || '')) || String(a.id || '').localeCompare(String(b.id || '')))[0] || null;
}

export function bookingRepairPlan({ booking, job, quotes = [], events = [], conversations = [], eventKey }) {
  if (!booking) return null;
  const winner = quotes.find((quote) => quote.id === booking.quote_id);
  const expectedJobState = jobStateForBooking(booking.state) || 'matched';
  return {
    booking,
    winner_quote: winner,
    quote_updates: quotes
      .filter((quote) => quote.id === booking.quote_id ? quote.status !== 'accepted' || quote.booking_id !== booking.id : !['declined', 'expired'].includes(quote.status))
      .map((quote) => quote.id === booking.quote_id
        ? { id: quote.id, status: 'accepted', booking_id: booking.id }
        : { id: quote.id, status: 'declined' }),
    job_update: !job || job.status !== expectedJobState || job.booking_id !== booking.id || job.accepted_quote_id !== booking.quote_id || job.assigned_tradie_id !== booking.provider_id
      ? { status: expectedJobState, booking_id: booking.id, accepted_quote_id: booking.quote_id, assigned_tradie_id: booking.provider_id }
      : null,
    event_missing: !events.some((event) => event.idempotency_key === eventKey),
    conversation: conversations[0] || null,
    conversation_missing: conversations.length === 0,
  };
}

export function transitionRepairPlan({ booking, job, events = [], toState, eventScope, scheduledStart = null }) {
  const scopeEntries = Object.entries(eventScope || {});
  const event = events.find((item) => scopeEntries.length && scopeEntries.every(([key, value]) => item[key] === value));
  // An immutable event is repair authority only while the mutable booking still
  // equals the state that event observed. A later state must never be rolled back
  // by retrying an older idempotency key.
  const eventCanAdvance = Boolean(event && booking.state === event.from_state);
  const effectiveState = eventCanAdvance ? event.to_state : event ? booking.state : toState;
  const eventScheduledStart = event?.to_state === 'scheduled' ? event.metadata?.scheduled_start || null : null;
  // The immutable scheduling event repairs an interrupted first transition. If
  // the booking has progressed, retain its canonical time and only fill a gap;
  // an old retry must never erase or replace later booking data.
  const effectiveScheduledStart = eventScheduledStart
    ? (eventCanAdvance ? eventScheduledStart : booking.scheduled_start || eventScheduledStart)
    : event ? booking.scheduled_start || null : toState === 'scheduled' ? scheduledStart : booking.scheduled_start || null;
  return {
    effective_state: effectiveState,
    effective_scheduled_start: effectiveScheduledStart,
    event_missing: !event,
    booking_needs_update: booking.state !== effectiveState,
    scheduled_start_needs_update: Boolean(effectiveScheduledStart && booking.scheduled_start !== effectiveScheduledStart),
    job_needs_update: Boolean(jobStateForBooking(effectiveState) && job?.status !== jobStateForBooking(effectiveState)),
    repair_mode: !event ? 'new_transition' : eventCanAdvance ? 'resume_interrupted_transition' : 'preserve_current_state',
  };
}

export function requestTransitionRepairPlan({ job, event }) {
  if (!job || !event) return { effective_status: job?.status, request_needs_update: false, repair_mode: 'no_event' };
  const eventCanAdvance = job.status === event.from_state;
  const effectiveStatus = eventCanAdvance ? event.to_state : job.status;
  return {
    effective_status: effectiveStatus,
    request_needs_update: job.status !== effectiveStatus,
    repair_mode: eventCanAdvance ? 'resume_interrupted_transition' : 'preserve_current_state',
  };
}

export function jobStateForBooking(state) {
  return ({ accepted: 'matched', scheduled: 'matched', in_progress: 'in_progress', completed: 'completed', cancelled: 'cancelled', disputed: 'in_progress' })[state] || null;
}

const BOOKING_TRANSITIONS = Object.freeze({
  accepted: { customer: ['cancelled'], provider: ['scheduled', 'cancelled'], admin: ['scheduled', 'cancelled', 'disputed'] },
  scheduled: { customer: ['cancelled', 'disputed'], provider: ['in_progress', 'cancelled'], admin: ['in_progress', 'cancelled', 'disputed'] },
  in_progress: { customer: ['disputed'], provider: ['completed'], admin: ['completed', 'cancelled', 'disputed'] },
  completed: { customer: ['disputed'], provider: [], admin: ['disputed'] },
  cancelled: { customer: [], provider: [], admin: [] },
  disputed: { customer: [], provider: [], admin: ['completed', 'cancelled'] },
  superseded: { customer: [], provider: [], admin: [] },
});

export function canTransitionBooking(from, to, actorRole) {
  return Boolean(BOOKING_TRANSITIONS[from]?.[actorRole]?.includes(to));
}

export const idempotencyScope = Object.freeze({
  job: ({ key, customerId, serviceKey }) => ({ request_idempotency_key: key, customer_id: customerId, service_key: serviceKey }),
  quote: ({ key, providerId, jobId }) => ({ idempotency_key: key, tradie_id: providerId, job_id: jobId }),
  booking: ({ key, customerId, jobId }) => ({ idempotency_key: key, customer_id: customerId, job_id: jobId }),
  event: ({ key, actorId, bookingId, jobId }) => ({ idempotency_key: key, actor_id: actorId, booking_id: bookingId, job_id: jobId }),
  requestEvent: ({ key, actorId, jobId }) => ({ idempotency_key: key, actor_id: actorId, job_id: jobId }),
});
