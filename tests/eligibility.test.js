import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASE1_SERVICE_MAP } from '../src/domain/catalogue.js';
import { ELIGIBILITY_REASON, evaluateBookingGate, evaluateServiceEligibility, evaluateWorkerEligibility } from '../src/domain/eligibility.js';

const released = (service) => ({ ...service, flags: {
  publicly_visible: true, request_enabled: true, provider_onboarding_enabled: true,
  quote_enabled: true, booking_enabled: true, recurrence_enabled: true, public_release_enabled: true,
} });
const providerEvidence = (service, scopes) => service.evidence_requirements.filter((requirement) => requirement.subject === 'provider').map((requirement) => ({
  id: `p-${requirement.evidence_type}`, evidence_type: requirement.evidence_type, subject_type: 'provider',
  review_status: 'verified', service_scopes: [service.key], approved_scope_ids: scopes,
  abn_entity_match: requirement.evidence_type === 'abn_entity_match',
  expires_date: requirement.expiry_required ? '2030-01-01T00:00:00Z' : undefined,
}));
const workerEvidence = (service, scopes, workerId = 'w1') => service.evidence_requirements.filter((requirement) => requirement.subject === 'worker').map((requirement) => ({
  id: `w-${requirement.evidence_type}`, evidence_type: requirement.evidence_type, subject_type: 'worker', worker_id: workerId,
  review_status: 'verified', service_scopes: [service.key], approved_scope_ids: scopes,
  expires_date: requirement.expiry_required ? '2030-01-01T00:00:00Z' : undefined,
}));

test('flags-off blocks eligibility before provider claims are considered', () => {
  const service = PHASE1_SERVICE_MAP['cleaning.routine_domestic'];
  const result = evaluateServiceEligibility({ user: { account_standing: 'active' }, serviceKey: service.key, serviceDefinition: service });
  assert.equal(result.reason, ELIGIBILITY_REASON.SERVICE_NOT_RELEASED);
});

test('exact attending worker and exact configured evidence are required', () => {
  const service = released(PHASE1_SERVICE_MAP['electrical.licensed_services']);
  const scopes = ['fault-assessment'];
  const worker = { id: 'w1', provider_id: 'p1', active: true, identity_verified: true, relationship_verified: true, relationship_type: 'employee' };
  const base = { serviceKey: service.key, selectedScopeIds: scopes, providerId: 'p1', worker, serviceDate: '2026-08-30', substitutionDisclosed: true, serviceDefinition: service };
  assert.equal(evaluateWorkerEligibility({ ...base, workerEvidence: [{ evidence_type: 'profile_note', subject_type: 'worker', worker_id: 'w1', review_status: 'verified' }] }).reason, 'worker_credentials_missing');
  const exact = workerEvidence(service, scopes);
  assert.equal(evaluateWorkerEligibility({ ...base, workerEvidence: exact }).eligible, true);
  assert.equal(evaluateWorkerEligibility({ ...base, workerEvidence: exact.map((row) => row.evidence_type === 'victorian_electrical_licence' ? { ...row, expires_date: undefined } : row) }).reason, 'worker_credentials_expiry_unknown');
  assert.equal(evaluateWorkerEligibility({ ...base, worker: { ...worker, id: 'w2' }, workerEvidence: exact }).reason, 'worker_credentials_missing');
});

test('provider, worker disclosure, customer acknowledgement and hazard screen all gate booking', () => {
  const service = released(PHASE1_SERVICE_MAP['cleaning.routine_domestic']);
  const scopes = ['vacuum-mop-dust'];
  const offering = { service_key: service.key, review_status: 'approved', active: true, available: true, reverification_required: false, approved_scope: scopes, approved_delivery_pathway: service.pathway, approved_labour_mode: 'employees', availability_days: ['friday'], capacity_remaining: 1, minimum_units: 1, minimum_job_value: 0, minimum_notice_hours: 0, coverage_suburbs: ['ballarat'] };
  const providerEligibility = evaluateServiceEligibility({ user: { account_standing: 'active' }, serviceKey: service.key, serviceDefinition: service, offering, evidence: providerEvidence(service, scopes), selectedScopeIds: scopes, suburb: 'Ballarat', serviceDate: '2026-08-28T10:00:00+10:00', requestedUnits: 1, requestedValue: 10, now: '2026-08-20T00:00:00Z' });
  assert.equal(providerEligibility.eligible, true);
  const gate = { serviceKey: service.key, selectedScopeIds: scopes, providerEligibility: { ...providerEligibility, provider_id: 'p1' }, worker: { id: 'w1', provider_id: 'p1', active: true, identity_verified: true, relationship_verified: true }, workerEvidence: workerEvidence(service, scopes), hazardScreen: { status: 'passed', scope_decision: 'allowed' }, serviceDate: '2026-08-28', workerDisclosed: true, customerAcknowledged: true, serviceDefinition: service };
  assert.equal(evaluateBookingGate(gate).eligible, true);
  assert.equal(evaluateBookingGate({ ...gate, customerAcknowledged: false }).reason, 'worker_disclosure_not_acknowledged');
  assert.equal(evaluateBookingGate({ ...gate, hazardScreen: { status: 'manual_review', scope_decision: 'manual_review' } }).reason, 'hazard_screen_not_passed');
});
