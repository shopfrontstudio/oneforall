import { getPhase1Service, PHASE1_POLICY_VERSION } from './phase1-catalogue.js';

export const ELIGIBILITY_REASON = Object.freeze({
  ELIGIBLE: 'eligible',
  SERVICE_UNKNOWN: 'service_unknown',
  SERVICE_NOT_RELEASED: 'service_not_released',
  ACCOUNT_NOT_ACTIVE: 'account_not_active',
  OFFERING_NOT_APPROVED: 'offering_not_approved',
  OFFERING_INACTIVE: 'offering_inactive',
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

export function evidenceExpiryState(expiresDate, now = new Date()) {
  if (!expiresDate) return 'no_expiry_recorded';
  const days = Math.ceil((new Date(expiresDate).getTime() - new Date(now).getTime()) / 86400000);
  if (days <= 0) return 'expired';
  if (days <= 7) return 'expires_within_7_days';
  if (days <= 30) return 'expires_within_30_days';
  return 'current';
}

export function evaluateServiceEligibility({ user, serviceKey, serviceDefinition, offering, evidence = [], suburb, now = new Date() }) {
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
  if (!offering.available) return result(false, ELIGIBILITY_REASON.UNAVAILABLE);
  if (Number(offering.capacity_remaining) <= 0) return result(false, ELIGIBILITY_REASON.NO_CAPACITY);
  const covered = (offering.coverage_suburbs || []).map(normal);
  if (!covered.includes('*') && (!normal(suburb) || !covered.includes(normal(suburb)))) {
    return result(false, ELIGIBILITY_REASON.OUTSIDE_COVERAGE);
  }

  for (const evidenceType of service.required_evidence) {
    const matching = evidence.filter((item) => item.evidence_type === evidenceType);
    if (!matching.length) return result(false, ELIGIBILITY_REASON.EVIDENCE_MISSING, { evidence_type: evidenceType });
    const verified = matching.find((item) => item.review_status === 'verified');
    if (!verified) return result(false, ELIGIBILITY_REASON.EVIDENCE_NOT_VERIFIED, { evidence_type: evidenceType });
    if (evidenceType === 'abn_entity_match' && verified.abn_entity_match !== true) {
      return result(false, ELIGIBILITY_REASON.EVIDENCE_NOT_VERIFIED, { evidence_type: evidenceType });
    }
    if ((evidenceType.includes('insurance') || evidenceType.includes('licence')) && !verified.expires_date) {
      return result(false, ELIGIBILITY_REASON.EVIDENCE_EXPIRY_UNKNOWN, { evidence_type: evidenceType });
    }
    if (evidenceExpiryState(verified.expires_date, now) === 'expired') {
      return result(false, ELIGIBILITY_REASON.EVIDENCE_EXPIRED, { evidence_type: evidenceType });
    }
    const scopes = verified.service_scopes || [];
    if (!scopes.includes('*') && !scopes.includes(serviceKey)) {
      return result(false, ELIGIBILITY_REASON.EVIDENCE_OUT_OF_SCOPE, { evidence_type: evidenceType });
    }
  }
  return result(true, ELIGIBILITY_REASON.ELIGIBLE);
}

export function evaluateBookingGate({ serviceKey, providerEligibility, worker, workerEvidence = [], hazardScreen, serviceDate, substitutionDisclosed = false }) {
  if (!providerEligibility?.eligible) return providerEligibility || result(false, ELIGIBILITY_REASON.OFFERING_NOT_APPROVED);
  if (!worker?.id || !worker.active || worker.provider_id !== providerEligibility.provider_id || !worker.identity_verified || !worker.relationship_verified) {
    return result(false, 'worker_not_verified');
  }
  if (!substitutionDisclosed) return result(false, 'worker_disclosure_not_acknowledged');
  if (worker.is_subcontractor && !worker.subcontractor_separately_verified) {
    return result(false, 'subcontractor_not_verified');
  }
  const relevant = workerEvidence.filter((item) => item.review_status === 'verified' && ((item.service_scopes || []).includes('*') || (item.service_scopes || []).includes(serviceKey)));
  if (!relevant.length) return result(false, 'worker_credentials_missing');
  if (relevant.some((item) => item.expires_date && evidenceExpiryState(item.expires_date, serviceDate) === 'expired')) {
    return result(false, 'worker_credentials_expired_on_service_date');
  }
  if (hazardScreen?.status !== 'passed' || hazardScreen?.scope_decision !== 'allowed') return result(false, 'hazard_screen_not_passed');
  return result(true, ELIGIBILITY_REASON.ELIGIBLE);
}

export async function loadServiceEligibility(base44, { providerId, serviceKey, suburb, now }) {
  const [provider, offerings, evidence] = await Promise.all([
    base44.asServiceRole.entities.User.get(providerId),
    base44.asServiceRole.entities.ProviderOffering.filter({ provider_id: providerId, service_key: serviceKey }),
    base44.asServiceRole.entities.ProviderEvidence.filter({ provider_id: providerId }),
  ]);
  const evaluation = evaluateServiceEligibility({ user: provider, serviceKey, offering: offerings[0], evidence, suburb, now });
  return { ...evaluation, provider_id: providerId };
}

export function chooseCanonicalBooking(bookings = []) {
  return [...bookings]
    .filter((booking) => booking.state !== 'superseded')
    .sort((a, b) => String(a.created_date || '').localeCompare(String(b.created_date || '')) || String(a.id || '').localeCompare(String(b.id || '')))[0] || null;
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
});
