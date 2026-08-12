import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAssertionCurrent, latestPublicAssertionForService, latestPublicAssertionForServicePeriod, providerAssertionLabels, publicAssertionForService } from '../base44/shared/public-assertions.js';

const assertion = {
  id: 'a1',
  provider_id: 'p1',
  display_name: 'Ballarat Home Care',
  approved_service_ids: ['cleaning.routine_domestic'],
  credential_scope: ['vacuum-mop-dust', 'unknown-private-id'],
  evidence_checked_date: '2026-08-01',
  valid_through: '2026-08-31',
};

test('expired and service-mismatched assertions are suppressed', () => {
  assert.equal(isPublicAssertionCurrent(assertion, new Date('2026-08-31T10:00:00Z')), true);
  assert.equal(isPublicAssertionCurrent(assertion, new Date('2026-08-31T14:01:00Z')), false);
  assert.equal(isPublicAssertionCurrent(assertion, new Date('2026-09-01T00:00:00Z')), false);
  assert.equal(publicAssertionForService(assertion, 'gardening.basic_maintenance', new Date('2026-08-15T00:00:00Z')), null);
  assert.equal(latestPublicAssertionForService([assertion], 'cleaning.routine_domestic', new Date('2026-08-15T00:00:00Z'))?.id, 'a1');
  assert.equal(isPublicAssertionCurrent({ ...assertion, valid_through: undefined }, new Date('2026-08-15T00:00:00Z')), false);
  assert.equal(isPublicAssertionCurrent({ ...assertion, valid_through: 'not-a-date' }, new Date('2026-08-15T00:00:00Z')), false);
});

test('public assertion labels map configured ids and suppress raw unknown ids', () => {
  const labels = providerAssertionLabels(assertion, 'cleaning.routine_domestic');
  assert.deepEqual(labels.serviceLabels, ['Routine domestic cleaning']);
  assert.deepEqual(labels.credentialScopeLabels, ['Vacuuming, mopping and dusting']);
  assert.equal(JSON.stringify(labels).includes('unknown-private-id'), false);
});

test('quote snapshots require an assertion current now and through the service date', () => {
  assert.equal(latestPublicAssertionForServicePeriod([assertion], 'cleaning.routine_domestic', new Date('2026-08-30T00:00:00Z'), new Date('2026-08-12T00:00:00Z'))?.id, 'a1');
  assert.equal(latestPublicAssertionForServicePeriod([assertion], 'cleaning.routine_domestic', new Date('2026-09-01T00:00:00Z'), new Date('2026-08-12T00:00:00Z')), null);
  assert.equal(latestPublicAssertionForServicePeriod([assertion], 'cleaning.routine_domestic', new Date('2026-08-30T00:00:00Z'), new Date('2026-09-01T00:00:00Z')), null);
});
