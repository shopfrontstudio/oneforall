import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASE1_SERVICES, classifyServiceScope } from '../base44/shared/phase1-catalogue.js';

test('catalogue covers exactly the six Phase 1 categories and every release flag is false', () => {
  assert.deepEqual([...new Set(PHASE1_SERVICES.map((item) => item.category))].sort(), ['beauty', 'cleaning', 'gardening', 'handyman', 'pest-control', 'rubbish-removal']);
  for (const item of PHASE1_SERVICES) {
    assert.ok(['scheduled_or_recurring', 'managed_quote', 'licensed_diagnostic'].includes(item.pathway));
    assert.ok(item.allowed_scope.length && item.blocked_scope.length && item.required_evidence.length);
    assert.ok(Object.values(item.flags).every((value) => value === false), `${item.key} contains an enabled flag`);
  }
});

test('highest-value prohibited scopes fail closed', () => {
  assert.equal(classifyServiceScope('cleaning.routine_domestic', 'Trauma and body fluid cleanup').decision, 'blocked');
  assert.equal(classifyServiceScope('gardening.small_shrub_pruning', 'Use a chainsaw and ladder').decision, 'blocked');
  assert.equal(classifyServiceScope('beauty.adult_low_risk', 'Microneedling for a minor').decision, 'blocked');
  assert.equal(classifyServiceScope('handyman.minor_tasks', 'Move a power point').decision, 'blocked');
  assert.equal(classifyServiceScope('rubbish-removal.ordinary', 'Collect asbestos').decision, 'blocked');
  assert.equal(classifyServiceScope('pest-control.diagnostic', 'Treat now without SDS').decision, 'blocked');
  assert.equal(classifyServiceScope('cleaning.routine_domestic', '').decision, 'manual_review');
  assert.equal(classifyServiceScope('not.real', 'anything').decision, 'blocked');
});

test('deep cleaning and pesticide treatment always route to review or block', () => {
  assert.equal(classifyServiceScope('cleaning.ordinary_deep_clean', 'ordinary deep clean').decision, 'manual_review');
  assert.equal(classifyServiceScope('cleaning.ordinary_deep_clean', 'biohazard deep clean').decision, 'blocked');
  assert.equal(classifyServiceScope('pest-control.pesticide_treatment', 'treatment after diagnostic').decision, 'manual_review');
  assert.equal(classifyServiceScope('pest-control.pesticide_treatment', 'direct public treatment').decision, 'blocked');
});
