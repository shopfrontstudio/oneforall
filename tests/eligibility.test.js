import test from 'node:test';
import assert from 'node:assert/strict';
import { getPhase1Service } from '../base44/shared/phase1-catalogue.js';
import { ELIGIBILITY_REASON, evaluateBookingGate, evaluateServiceEligibility, evidenceExpiryState } from '../base44/shared/marketplace.js';

const serviceKey = 'cleaning.routine_domestic';
const enabledService = { ...getPhase1Service(serviceKey), flags: { publicly_visible: true, request_enabled: true, provider_onboarding_enabled: true, quote_enabled: true, booking_enabled: true, recurrence_enabled: true, public_release_enabled: true } };
const offering = { provider_id: 'p1', service_key: serviceKey, review_status: 'approved', active: true, available: true, capacity_remaining: 2, coverage_suburbs: ['Ballarat'], reverification_required: false };
const evidence = enabledService.required_evidence.map((evidence_type) => ({ evidence_type, review_status: 'verified', service_scopes: [serviceKey], abn_entity_match: evidence_type === 'abn_entity_match', expires_date: evidence_type.includes('insurance') ? '2030-01-01T00:00:00.000Z' : undefined }));

const evaluate = (overrides = {}) => evaluateServiceEligibility({ user: { id: 'p1', account_standing: 'active', verified: false }, serviceKey, serviceDefinition: enabledService, offering, evidence, suburb: 'Ballarat', now: new Date('2026-08-12T00:00:00.000Z'), ...overrides });

test('release flags fail closed before provider attributes', () => {
  assert.equal(evaluateServiceEligibility({ user: { account_standing: 'active' }, serviceKey, offering, evidence, suburb: 'Ballarat' }).reason, ELIGIBILITY_REASON.SERVICE_NOT_RELEASED);
});

test('subscription data and generic verified do not influence eligibility', () => {
  const baseline = evaluate();
  const withLegacySubscription = evaluate({ subscription: { plan: 'pro', status: 'active' }, user: { id: 'p1', account_standing: 'active', verified: true } });
  assert.deepEqual(withLegacySubscription, baseline);
  assert.equal(baseline.eligible, true);
});

test('standing, offering, reverification, coverage, availability and capacity return stable reasons', () => {
  assert.equal(evaluate({ user: { account_standing: 'suspended' } }).reason, ELIGIBILITY_REASON.ACCOUNT_NOT_ACTIVE);
  assert.equal(evaluate({ offering: { ...offering, review_status: 'pending' } }).reason, ELIGIBILITY_REASON.OFFERING_NOT_APPROVED);
  assert.equal(evaluate({ offering: { ...offering, reverification_required: true } }).reason, ELIGIBILITY_REASON.REVERIFICATION_REQUIRED);
  assert.equal(evaluate({ suburb: 'Geelong' }).reason, ELIGIBILITY_REASON.OUTSIDE_COVERAGE);
  assert.equal(evaluate({ offering: { ...offering, available: false } }).reason, ELIGIBILITY_REASON.UNAVAILABLE);
  assert.equal(evaluate({ offering: { ...offering, capacity_remaining: 0 } }).reason, ELIGIBILITY_REASON.NO_CAPACITY);
});

test('missing, unverified, expired and out-of-scope evidence block', () => {
  assert.equal(evaluate({ evidence: evidence.slice(1) }).reason, ELIGIBILITY_REASON.EVIDENCE_MISSING);
  assert.equal(evaluate({ evidence: evidence.map((item, index) => index ? item : { ...item, review_status: 'pending' }) }).reason, ELIGIBILITY_REASON.EVIDENCE_NOT_VERIFIED);
  assert.equal(evaluate({ evidence: evidence.map((item) => item.evidence_type === 'service_specific_insurance' ? { ...item, expires_date: '2026-08-11T00:00:00.000Z' } : item) }).reason, ELIGIBILITY_REASON.EVIDENCE_EXPIRED);
  assert.equal(evaluate({ evidence: evidence.map((item) => ({ ...item, service_scopes: ['other.service'] })) }).reason, ELIGIBILITY_REASON.EVIDENCE_OUT_OF_SCOPE);
});

test('expiry states support 30/7-day alert windows and hard blocking', () => {
  const now = new Date('2026-08-12T00:00:00.000Z');
  assert.equal(evidenceExpiryState('2026-09-01T00:00:00.000Z', now), 'expires_within_30_days');
  assert.equal(evidenceExpiryState('2026-08-18T00:00:00.000Z', now), 'expires_within_7_days');
  assert.equal(evidenceExpiryState('2026-08-12T00:00:00.000Z', now), 'expired');
});

test('booking gate requires a linked worker, service-date credentials, hazard pass and separate subcontractor verification', () => {
  const providerEligibility = { eligible: true, reason: 'eligible', provider_id: 'p1' };
  const worker = { id: 'w1', provider_id: 'p1', active: true, identity_verified: true, relationship_verified: true, is_subcontractor: false };
  const workerEvidence = [{ review_status: 'verified', service_scopes: [serviceKey], expires_date: '2026-08-20T00:00:00.000Z' }];
  const hazardScreen = { status: 'passed', scope_decision: 'allowed' };
  const base = { serviceKey, providerEligibility, worker, workerEvidence, hazardScreen, serviceDate: '2026-08-15T00:00:00.000Z' };
  const run = (overrides = {}) => evaluateBookingGate({ ...base, substitutionDisclosed: true, ...overrides });
  assert.equal(evaluateBookingGate(base).reason, 'worker_disclosure_not_acknowledged');
  assert.equal(run().eligible, true);
  assert.equal(run({ substitutionDisclosed: false }).reason, 'worker_disclosure_not_acknowledged');
  assert.equal(run({ hazardScreen: { status: 'manual_review', scope_decision: 'manual_review' } }).reason, 'hazard_screen_not_passed');
  assert.equal(run({ workerEvidence: [{ ...workerEvidence[0], expires_date: '2026-08-14T00:00:00.000Z' }] }).reason, 'worker_credentials_expired_on_service_date');
  assert.equal(run({ worker: { ...worker, is_subcontractor: true, subcontractor_separately_verified: false } }).reason, 'subcontractor_not_verified');
});
