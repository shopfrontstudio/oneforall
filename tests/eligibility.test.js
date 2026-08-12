import test from 'node:test';
import assert from 'node:assert/strict';
import { getPhase1Service } from '../base44/shared/phase1-catalogue.js';
import { ELIGIBILITY_REASON, evaluateBookingGate, evaluateServiceEligibility, evaluateWorkerEligibility, evidenceExpiryState, loadExactBookingEligibility } from '../base44/shared/marketplace.js';
import { bookingTransitionEligibilityInstant, latestServiceDate, melbourneDateTimeLocalValue, melbourneLocalDateTimeToISO, normaliseFutureDateTime, normaliseISODate, serviceDateHasPassed, validateLockedQuoteMessage } from '../base44/shared/guards.js';

const serviceKey = 'cleaning.routine_domestic';
const selectedScopeIds = ['vacuum-mop-dust'];
const enabledService = { ...getPhase1Service(serviceKey), flags: { publicly_visible: true, request_enabled: true, provider_onboarding_enabled: true, quote_enabled: true, booking_enabled: true, recurrence_enabled: true, public_release_enabled: true } };
const offering = { provider_id: 'p1', service_key: serviceKey, review_status: 'approved', active: true, available: true, capacity_remaining: 2, coverage_suburbs: ['Ballarat'], approved_scope: selectedScopeIds, reverification_required: false };
const providerEvidence = enabledService.evidence_requirements.filter((requirement) => requirement.subject === 'provider').map((requirement) => ({ evidence_type: requirement.evidence_type, subject_type: 'provider', review_status: 'verified', service_scopes: [serviceKey], approved_scope_ids: selectedScopeIds, abn_entity_match: requirement.evidence_type === 'abn_entity_match', expires_date: requirement.expiry_required ? '2030-01-01T00:00:00.000Z' : undefined }));
const evaluate = (overrides = {}) => evaluateServiceEligibility({ user: { id: 'p1', account_standing: 'active' }, serviceKey, selectedScopeIds, serviceDefinition: enabledService, offering, evidence: providerEvidence, suburb: 'Ballarat', now: new Date('2026-08-12T00:00:00.000Z'), ...overrides });

test('release flags fail closed before provider attributes', () => {
  assert.equal(evaluateServiceEligibility({ user: { account_standing: 'active' }, serviceKey, selectedScopeIds, offering, evidence: providerEvidence, suburb: 'Ballarat' }).reason, ELIGIBILITY_REASON.SERVICE_NOT_RELEASED);
});

test('approved offering scope must cover every selected request scope', () => {
  assert.equal(evaluate().eligible, true);
  assert.equal(evaluate({ selectedScopeIds: [] }).reason, ELIGIBILITY_REASON.OFFERING_SCOPE_MISMATCH);
  assert.equal(evaluate({ selectedScopeIds: ['vacuum-mop-dust', 'kitchen-bathroom'] }).reason, ELIGIBILITY_REASON.OFFERING_SCOPE_MISMATCH);
});

test('provider evidence uses explicit subject, expiry and selected-scope metadata', () => {
  assert.equal(evaluate({ evidence: providerEvidence.map((item) => ({ ...item, subject_type: 'worker' })) }).reason, ELIGIBILITY_REASON.EVIDENCE_MISSING);
  assert.equal(evaluate({ evidence: providerEvidence.map((item) => item.evidence_type === 'service_specific_insurance' ? { ...item, expires_date: undefined } : item) }).reason, ELIGIBILITY_REASON.EVIDENCE_EXPIRY_UNKNOWN);
  assert.equal(evaluate({ evidence: providerEvidence.map((item) => ({ ...item, approved_scope_ids: ['other-scope'] })) }).reason, ELIGIBILITY_REASON.EVIDENCE_OUT_OF_SCOPE);
  const expiresBeforeService = providerEvidence.map((item) => item.evidence_type === 'service_specific_insurance' ? { ...item, expires_date: '2026-08-20T00:00:00.000Z' } : item);
  assert.equal(evaluate({ evidence: expiresBeforeService, now: new Date('2026-09-01T00:00:00.000Z') }).reason, ELIGIBILITY_REASON.EVIDENCE_EXPIRED);
  assert.equal(evaluate({ evidence: providerEvidence.map((item) => ({ ...item, superseded_by_evidence_id: 'replacement' })) }).reason, ELIGIBILITY_REASON.EVIDENCE_MISSING);
});

test('expiry states support 30/7-day alert windows and hard blocking', () => {
  const now = new Date('2026-08-12T00:00:00.000Z');
  assert.equal(evidenceExpiryState('2026-09-01T00:00:00.000Z', now), 'expires_within_30_days');
  assert.equal(evidenceExpiryState('2026-08-18T00:00:00.000Z', now), 'expires_within_7_days');
  assert.equal(evidenceExpiryState('2026-08-12T00:00:00.000Z', now), 'expired');
});

test('arbitrary worker evidence and missing exact evidence cannot open booking gate', () => {
  const providerEligibility = { eligible: true, reason: 'eligible', provider_id: 'p1' };
  const worker = { id: 'w1', provider_id: 'p1', active: true, identity_verified: true, relationship_verified: true, is_subcontractor: false };
  const hazardScreen = { status: 'passed', scope_decision: 'allowed' };
  const base = { serviceKey, selectedScopeIds, providerEligibility, worker, hazardScreen, serviceDate: '2026-08-15T00:00:00.000Z', workerDisclosed: true, customerAcknowledged: true };
  assert.equal(evaluateBookingGate({ ...base, workerEvidence: [{ evidence_type: 'profile_note', subject_type: 'worker', worker_id: 'w1', review_status: 'verified', service_scopes: [serviceKey], approved_scope_ids: selectedScopeIds }] }).reason, 'worker_credentials_missing');
  const exact = enabledService.evidence_requirements.filter((requirement) => requirement.subject === 'worker').map((requirement) => ({ evidence_type: requirement.evidence_type, subject_type: 'worker', worker_id: 'w1', review_status: 'verified', service_scopes: [serviceKey], approved_scope_ids: selectedScopeIds, expires_date: requirement.expiry_required ? '2030-01-01T00:00:00.000Z' : undefined }));
  assert.equal(evaluateBookingGate({ ...base, workerEvidence: exact }).eligible, true);
});

test('Pest requires exact current worker licence and authorisation on service date', () => {
  const pest = getPhase1Service('pest-control.diagnostic');
  const pestScope = ['accessible-inspection'];
  const base = { serviceKey: pest.key, selectedScopeIds: pestScope, serviceDefinition: pest, providerEligibility: { eligible: true, provider_id: 'p1' }, worker: { id: 'w1', provider_id: 'p1', active: true, identity_verified: true, relationship_verified: true }, hazardScreen: { status: 'passed', scope_decision: 'allowed' }, serviceDate: '2026-08-15T00:00:00Z', workerDisclosed: true, customerAcknowledged: true };
  const evidence = pest.evidence_requirements.filter((requirement) => requirement.subject === 'worker').map((requirement) => ({ evidence_type: requirement.evidence_type, subject_type: 'worker', worker_id: 'w1', review_status: 'verified', service_scopes: [pest.key], approved_scope_ids: pestScope, expires_date: requirement.expiry_required ? '2030-01-01T00:00:00Z' : undefined }));
  assert.equal(evaluateBookingGate({ ...base, workerEvidence: evidence }).eligible, true);
  assert.equal(evaluateBookingGate({ ...base, workerEvidence: evidence.filter((item) => item.evidence_type !== 'pest_scope_authorisation') }).reason, 'worker_credentials_missing');
  assert.equal(evaluateBookingGate({ ...base, workerEvidence: evidence.map((item) => item.evidence_type === 'victorian_pest_licence' ? { ...item, expires_date: undefined } : item) }).reason, 'worker_credentials_expiry_unknown');
});

test('quote-time worker gate validates exact worker, disclosure and service-date expiry without customer acknowledgement', () => {
  const worker = { id: 'w1', provider_id: 'p1', active: true, identity_verified: true, relationship_verified: true, is_subcontractor: true, subcontractor_separately_verified: true };
  const evidence = enabledService.evidence_requirements.filter((requirement) => requirement.subject === 'worker').map((requirement) => ({ evidence_type: requirement.evidence_type, subject_type: 'worker', worker_id: 'w1', review_status: 'verified', service_scopes: [serviceKey], approved_scope_ids: selectedScopeIds, expires_date: '2026-08-20T00:00:00Z' }));
  const base = { serviceKey, selectedScopeIds, providerId: 'p1', worker, workerEvidence: evidence, substitutionDisclosed: true };
  assert.equal(evaluateWorkerEligibility({ ...base, serviceDate: '2026-08-15T00:00:00Z' }).eligible, true);
  assert.equal(evaluateWorkerEligibility({ ...base, serviceDate: '2026-09-01T00:00:00Z' }).reason, 'worker_credentials_expired_on_service_date');
  assert.equal(evaluateWorkerEligibility({ ...base, substitutionDisclosed: false, serviceDate: '2026-08-15T00:00:00Z' }).reason, 'worker_disclosure_required');
  assert.equal(evaluateWorkerEligibility({ ...base, worker: { ...worker, subcontractor_separately_verified: false }, serviceDate: '2026-08-15T00:00:00Z' }).reason, 'subcontractor_not_verified');
});

test('service dates are compared in the Ballarat operating timezone', () => {
  const now = new Date('2026-08-12T14:30:00Z'); // 13 August in Melbourne
  assert.equal(serviceDateHasPassed('2026-08-12', now), true);
  assert.equal(serviceDateHasPassed('2026-08-13', now), false);
  assert.equal(serviceDateHasPassed('not-a-date', now), true);
  assert.equal(normaliseISODate('2026-02-30'), null);
  assert.equal(latestServiceDate('2026-08-15', '2026-08-20'), '2026-08-20');
});

test('scheduling requires an explicit timezone and a future instant', () => {
  const now = new Date('2026-08-12T00:00:00.000Z');
  assert.equal(normaliseFutureDateTime(undefined, now), null);
  assert.equal(normaliseFutureDateTime('2026-08-11T10:00:00.000Z', now), null);
  assert.equal(normaliseFutureDateTime('2026-08-13T10:00', now), null);
  assert.equal(normaliseFutureDateTime('2026-08-13T10:00:00+10:00', now), '2026-08-13T00:00:00.000Z');
});

test('Ballarat wall-clock conversion is deterministic and rejects DST gaps and ambiguity', () => {
  assert.equal(melbourneLocalDateTimeToISO('2026-08-13T10:00'), '2026-08-13T00:00:00.000Z');
  assert.equal(melbourneLocalDateTimeToISO('2026-01-13T10:00'), '2026-01-12T23:00:00.000Z');
  assert.equal(melbourneLocalDateTimeToISO('2026-10-04T02:30'), null);
  assert.equal(melbourneLocalDateTimeToISO('2026-04-05T02:30'), null);
  assert.equal(melbourneDateTimeLocalValue('2026-08-13T00:00:00Z'), '2026-08-13T10:00');
});

test('commencement eligibility uses actual time after confirmed start', () => {
  const booking = { scheduled_start: '2026-08-20T00:00:00.000Z' };
  assert.equal(bookingTransitionEligibilityInstant({ booking: {}, toState: 'in_progress', now: '2026-08-20T01:00:00.000Z' }).error, 'confirmed_schedule_missing');
  assert.deepEqual(bookingTransitionEligibilityInstant({ booking: {}, toState: 'in_progress', scheduledStart: '2026-08-20T00:00:00.000Z', now: '2026-08-20T01:00:00.000Z' }), { serviceDate: '2026-08-20T01:00:00.000Z' });
  assert.equal(bookingTransitionEligibilityInstant({ booking, toState: 'in_progress', now: '2026-08-19T23:59:59.000Z' }).error, 'scheduled_start_not_reached');
  assert.deepEqual(bookingTransitionEligibilityInstant({ booking, toState: 'in_progress', now: '2026-08-21T12:00:00.000Z' }), { serviceDate: '2026-08-21T12:00:00.000Z' });
});

const bookingGateFixture = ({ providerExpiry = '2030-01-01T00:00:00.000Z', workerExpiry = '2030-01-01T00:00:00.000Z', assertionThrough = '2030-01-01' } = {}) => {
  const job = { id: 'j1', service_key: serviceKey, selected_scope_ids: selectedScopeIds, suburb: 'Ballarat', assigned_tradie_id: 'p1', accepted_quote_id: 'q1', hazard_screen_status: 'passed', scope_decision: 'allowed' };
  const booking = { id: 'b1', job_id: 'j1', quote_id: 'q1', provider_id: 'p1', attending_worker_id: 'w1', service_key: serviceKey, selected_scope_ids: selectedScopeIds, hazard_screen_status: 'passed', scope_decision: 'allowed', substitution_disclosed: true, customer_worker_acknowledged: true };
  const quote = { id: 'q1', job_id: 'j1', tradie_id: 'p1', attending_worker_id: 'w1', status: 'accepted', selected_scope_ids: selectedScopeIds, substitution_disclosed: true, provider_assertion_id: 'a1' };
  const providerRows = enabledService.evidence_requirements.filter((requirement) => requirement.subject === 'provider').map((requirement) => ({ ...providerEvidence.find((row) => row.evidence_type === requirement.evidence_type), expires_date: requirement.expiry_required ? providerExpiry : undefined }));
  const workerRows = enabledService.evidence_requirements.filter((requirement) => requirement.subject === 'worker').map((requirement) => ({ evidence_type: requirement.evidence_type, subject_type: 'worker', worker_id: 'w1', review_status: 'verified', service_scopes: [serviceKey], approved_scope_ids: selectedScopeIds, expires_date: workerExpiry }));
  const entities = {
    InterestRequest: { get: async () => quote },
    User: { get: async () => ({ id: 'p1', account_standing: 'active' }) },
    ProviderOffering: { filter: async () => [offering] },
    ProviderEvidence: { filter: async (query) => query.worker_id ? workerRows : providerRows },
    ProviderWorker: { get: async () => ({ id: 'w1', provider_id: 'p1', active: true, identity_verified: true, relationship_verified: true, is_subcontractor: false }) },
    ProviderPublicAssertion: { filter: async () => [{ id: 'a1', provider_id: 'p1', approved_service_ids: [serviceKey], evidence_checked_date: '2026-08-01', valid_through: assertionThrough }] },
  };
  return { base44: { asServiceRole: { entities } }, booking, job };
};

test('exact booking gate uses confirmed service instant for provider, worker and assertion expiry', async () => {
  const valid = bookingGateFixture();
  assert.equal((await loadExactBookingEligibility(valid.base44, { booking: valid.booking, job: valid.job, serviceDate: '2026-08-20T00:00:00.000Z', serviceDefinition: enabledService })).eligible, true);

  const providerExpired = bookingGateFixture({ providerExpiry: '2026-08-19T00:00:00.000Z' });
  assert.equal((await loadExactBookingEligibility(providerExpired.base44, { booking: providerExpired.booking, job: providerExpired.job, serviceDate: '2026-08-20T00:00:00.000Z', serviceDefinition: enabledService })).reason, ELIGIBILITY_REASON.EVIDENCE_EXPIRED);

  const workerExpired = bookingGateFixture({ workerExpiry: '2026-08-19T00:00:00.000Z' });
  assert.equal((await loadExactBookingEligibility(workerExpired.base44, { booking: workerExpired.booking, job: workerExpired.job, serviceDate: '2026-08-20T00:00:00.000Z', serviceDefinition: enabledService })).reason, 'worker_credentials_expired_on_service_date');

  const assertionExpired = bookingGateFixture({ assertionThrough: '2026-08-19' });
  assert.equal((await loadExactBookingEligibility(assertionExpired.base44, { booking: assertionExpired.booking, job: assertionExpired.job, serviceDate: '2026-08-20T00:00:00.000Z', serviceDefinition: enabledService })).reason, 'provider_assertion_not_current_for_service_date');
});

test('delayed commencement rechecks at actual start time and blocks newly expired evidence', async () => {
  const fixture = bookingGateFixture({ providerExpiry: '2026-08-20T12:00:00.000Z', workerExpiry: '2026-08-20T12:00:00.000Z', assertionThrough: '2026-08-20' });
  fixture.booking.scheduled_start = '2026-08-20T10:00:00.000Z';
  const instant = bookingTransitionEligibilityInstant({ booking: fixture.booking, toState: 'in_progress', now: '2026-08-21T01:00:00.000Z' });
  assert.deepEqual(instant, { serviceDate: '2026-08-21T01:00:00.000Z' });
  const gate = await loadExactBookingEligibility(fixture.base44, { booking: fixture.booking, job: fixture.job, serviceDate: instant.serviceDate, serviceDefinition: enabledService });
  assert.equal(gate.eligible, false);
  assert.ok([ELIGIBILITY_REASON.EVIDENCE_EXPIRED, 'worker_credentials_expired_on_service_date', 'provider_assertion_not_current_for_service_date'].includes(gate.reason));
});

test('pre-booking quote messages reject direct contact details and stay bounded', () => {
  assert.equal(validateLockedQuoteMessage('Happy to help with this job.').message, 'Happy to help with this job.');
  for (const value of ['email me at worker@example.com', 'call 0412 345 678', 'see https://example.com']) {
    assert.match(validateLockedQuoteMessage(value).error, /Contact details and links/);
  }
  assert.ok(validateLockedQuoteMessage('x'.repeat(1001)).error);
});
