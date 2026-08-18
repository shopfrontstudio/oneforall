import { getPhase1Service, PHASE1_POLICY_VERSION } from './catalogue.js';

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
  EVIDENCE_CONFLICT_MANUAL_REVIEW: 'evidence_conflict_manual_review',
  OUTSIDE_COVERAGE: 'outside_coverage',
  UNAVAILABLE: 'unavailable',
  NO_CAPACITY: 'no_capacity',
  OPERATIONAL_TERMS_MISSING: 'operational_terms_missing',
  OFFERING_DAY_UNAVAILABLE: 'offering_day_unavailable',
  MINIMUM_UNITS_NOT_MET: 'minimum_units_not_met',
  MINIMUM_JOB_VALUE_NOT_MET: 'minimum_job_value_not_met',
  MINIMUM_NOTICE_NOT_MET: 'minimum_notice_not_met',
  WORKER_RELATIONSHIP_INCOMPATIBLE: 'worker_relationship_incompatible',
});

const normal = (value) => String(value || '').trim().toLowerCase();
const result = (eligible, reason, details = {}) => ({ eligible, reason, policy_version: PHASE1_POLICY_VERSION, ...details });

export const isAuthoritativeEvidence = (item) => Boolean(item && !item.superseded_by_evidence_id && !item.superseded_at);

const hasPendingReplacementUncertainty = (rows, authoritative) => rows.some((item) =>
  item.id !== authoritative?.id
  && item.supersedes_evidence_id === authoritative?.id
  && !item.superseded_at
  && !item.superseded_by_evidence_id
  && ['submitted', 'under_review'].includes(item.submission_status)
  && !['rejected', 'expired'].includes(item.review_status));

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

export function evaluateServiceEligibility({ user, serviceKey, serviceDefinition = null, offering, evidence = [], selectedScopeIds = [], suburb, serviceDate = null, requestedUnits, requestedValue, enforceNotice = true, now = new Date() }) {
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
  if (!offering.approved_delivery_pathway || offering.approved_delivery_pathway !== service.pathway || !offering.approved_labour_mode || !Array.isArray(offering.availability_days) || !offering.availability_days.length || !Number.isFinite(Number(offering.minimum_units)) || !Number.isFinite(Number(offering.minimum_job_value)) || !Number.isFinite(Number(offering.minimum_notice_hours))) return result(false, ELIGIBILITY_REASON.OPERATIONAL_TERMS_MISSING);
  const serviceInstant = new Date(serviceDate || now);
  if (!Number.isFinite(serviceInstant.getTime())) return result(false, 'service_date_invalid');
  const weekday = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'long' }).format(serviceInstant).toLowerCase();
  if (!offering.availability_days.includes(weekday)) return result(false, ELIGIBILITY_REASON.OFFERING_DAY_UNAVAILABLE);
  if (!Number.isFinite(Number(requestedUnits)) || Number(requestedUnits) < Number(offering.minimum_units)) return result(false, ELIGIBILITY_REASON.MINIMUM_UNITS_NOT_MET);
  if (!Number.isFinite(Number(requestedValue)) || Number(requestedValue) < Number(offering.minimum_job_value)) return result(false, ELIGIBILITY_REASON.MINIMUM_JOB_VALUE_NOT_MET);
  if (enforceNotice && (serviceInstant.getTime() - new Date(now).getTime()) / 3600000 < Number(offering.minimum_notice_hours)) return result(false, ELIGIBILITY_REASON.MINIMUM_NOTICE_NOT_MET);
  const covered = (offering.coverage_suburbs || []).map(normal);
  if (!covered.includes('*') && (!normal(suburb) || !covered.includes(normal(suburb)))) {
    return result(false, ELIGIBILITY_REASON.OUTSIDE_COVERAGE);
  }

  const providerRequirements = (service.evidence_requirements || []).filter((requirement) => requirement.subject === 'provider' && ((requirement.scope_ids || []).includes('*') || requestedScopes.some((scopeId) => (requirement.scope_ids || []).includes(scopeId))));
  for (const requirement of providerRequirements) {
    const matching = evidence.filter((item) => isAuthoritativeEvidence(item) && item.evidence_type === requirement.evidence_type && item.subject_type === 'provider' && !item.worker_id);
    if (!matching.length) return result(false, ELIGIBILITY_REASON.EVIDENCE_MISSING, { evidence_type: requirement.evidence_type });
    if (matching.length !== 1) return result(false, ELIGIBILITY_REASON.EVIDENCE_CONFLICT_MANUAL_REVIEW, { evidence_type: requirement.evidence_type });
    const verified = matching[0]?.review_status === 'verified' ? matching[0] : null;
    if (!verified) return result(false, ELIGIBILITY_REASON.EVIDENCE_NOT_VERIFIED, { evidence_type: requirement.evidence_type });
    if (hasPendingReplacementUncertainty(evidence.filter((item) => item.evidence_type === requirement.evidence_type && item.subject_type === 'provider' && !item.worker_id), verified)) {
      return result(false, ELIGIBILITY_REASON.EVIDENCE_CONFLICT_MANUAL_REVIEW, { evidence_type: requirement.evidence_type });
    }
    if (requirement.evidence_type === 'abn_entity_match' && verified.abn_entity_match !== true) {
      return result(false, ELIGIBILITY_REASON.EVIDENCE_NOT_VERIFIED, { evidence_type: requirement.evidence_type });
    }
    if (requirement.expiry_required && !verified.expires_date) {
      return result(false, ELIGIBILITY_REASON.EVIDENCE_EXPIRY_UNKNOWN, { evidence_type: requirement.evidence_type });
    }
    if (evidenceExpiryState(verified.expires_date, serviceInstant) === 'expired') {
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
    if (matching.length !== 1) return result(false, ELIGIBILITY_REASON.EVIDENCE_CONFLICT_MANUAL_REVIEW, { evidence_type: requirement.evidence_type });
    const verified = matching[0]?.review_status === 'verified' ? matching[0] : null;
    if (!verified) return result(false, 'worker_credentials_not_verified', { evidence_type: requirement.evidence_type });
    if (hasPendingReplacementUncertainty(workerEvidence.filter((item) => item.evidence_type === requirement.evidence_type && item.subject_type === 'worker' && item.worker_id === worker.id), verified)) {
      return result(false, ELIGIBILITY_REASON.EVIDENCE_CONFLICT_MANUAL_REVIEW, { evidence_type: requirement.evidence_type });
    }
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

export function workerRelationshipEligibility(offering, worker) {
  const relationship = worker?.relationship_type;
  const mode = offering?.approved_labour_mode;
  const compatible = mode === 'mixed'
    || (mode === 'sole_provider' && ['owner', 'director'].includes(relationship))
    || (mode === 'employees' && ['owner', 'director', 'employee'].includes(relationship))
    || (mode === 'subcontractors' && relationship === 'subcontractor');
  return compatible ? result(true, ELIGIBILITY_REASON.ELIGIBLE) : result(false, ELIGIBILITY_REASON.WORKER_RELATIONSHIP_INCOMPATIBLE);
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
