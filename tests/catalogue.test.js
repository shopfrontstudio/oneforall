import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASE1_SERVICES, classifyServiceScope, collectAdditionalRiskText } from '../base44/shared/phase1-catalogue.js';
import { CATEGORY_META, groupedServices } from '../src/lib/catalogue.js';

test('all original and current service sections have request pathways', () => {
  const groups = groupedServices();
  assert.deepEqual(CATEGORY_META.map(({ name }) => name), ['Cleaning', 'Gardening & Outdoor', 'Beauty', 'Handyman & General Maintenance', 'Electrical', 'Plumbing', 'Carpentry', 'Building & Renovation', 'Painting', 'Rubbish Removal', 'Pest Control', 'Not sure what I need?']);
  assert.ok(groups.every((group) => group.services.length > 0));
});

test('catalogue services have positive scopes, structured evidence and every release flag false', () => {
  assert.deepEqual([...new Set(PHASE1_SERVICES.map((item) => item.category))].sort(), ['beauty', 'building-renovation', 'carpentry', 'cleaning', 'electrical', 'gardening', 'handyman', 'not-sure', 'painting', 'pest-control', 'plumbing', 'rubbish-removal']);
  for (const item of PHASE1_SERVICES) {
    assert.ok(item.scope_options.length && item.scope_options.every((option) => option.id && option.label && option.match_terms.length));
    assert.ok(item.evidence_requirements.length && item.evidence_requirements.every((requirement) => ['provider', 'worker'].includes(requirement.subject) && typeof requirement.expiry_required === 'boolean'));
    assert.ok(Object.values(item.flags).every((value) => value === false), `${item.key} contains an enabled flag`);
  }
});

test('allowed requires only configured selected scope and any extra context is reviewed', () => {
  assert.equal(classifyServiceScope('cleaning.routine_domestic', { selectedScopeIds: ['vacuum-mop-dust'] }).decision, 'allowed');
  assert.equal(classifyServiceScope('cleaning.routine_domestic', { selectedScopeIds: [] }).reason, 'scope_unknown');
  assert.equal(classifyServiceScope('cleaning.routine_domestic', { selectedScopeIds: ['made-up'] }).decision, 'manual_review');
  assert.equal(classifyServiceScope('cleaning.routine_domestic', { selectedScopeIds: ['vacuum-mop-dust'], notes: 'vacuum' }).decision, 'manual_review');
  assert.equal(classifyServiceScope('cleaning.routine_domestic', { selectedScopeIds: ['vacuum-mop-dust'], notes: 'clean the pool filter' }).decision, 'blocked');
  assert.equal(classifyServiceScope('cleaning.routine_domestic', { selectedScopeIds: ['vacuum-mop-dust'], notes: 'clean the garage too' }).decision, 'manual_review');
  assert.equal(classifyServiceScope('cleaning.routine_domestic', { selectedScopeIds: ['vacuum-mop-dust'], notes: 'vacuum and also kitchen' }).reason, 'additional_context_review_required');
  assert.equal(classifyServiceScope('cleaning.routine_domestic', { selectedScopeIds: ['vacuum-mop-dust'], additionalRiskText: 'Tuesday morning please' }).decision, 'manual_review');
});

test('every non-authoritative work and risk field can tighten but never grant scope', () => {
  const base = { selectedScopeIds: ['vacuum-mop-dust'] };
  for (const input of [
    { title: 'Commercial tenancy' },
    { access_notes: 'Use the ladder by the gate' },
    { safety_info: 'Safety info: asbestos' },
  ]) {
    const additionalRiskText = collectAdditionalRiskText(input);
    assert.equal(classifyServiceScope('cleaning.routine_domestic', { ...base, additionalRiskText }).decision, 'blocked', additionalRiskText);
  }
  assert.equal(classifyServiceScope('cleaning.routine_domestic', { ...base, additionalRiskText: collectAdditionalRiskText({ title: 'Routine Tuesday visit' }) }).decision, 'manual_review');
  assert.equal(classifyServiceScope('cleaning.routine_domestic', { selectedScopeIds: [], additionalRiskText: collectAdditionalRiskText({ title: 'Routine visit' }) }).decision, 'manual_review');
  const pathwayRisk = collectAdditionalRiskText({ pathway_answers: { treatment_requested: true } });
  assert.equal(classifyServiceScope('pest-control.diagnostic', { selectedScopeIds: ['accessible-inspection'], additionalRiskText: pathwayRisk }).decision, 'manual_review');
  const harmlessFalseValue = collectAdditionalRiskText({ pathway_answers: { apply_poison: false } });
  assert.equal(harmlessFalseValue, 'false');
  assert.equal(classifyServiceScope('pest-control.diagnostic', { selectedScopeIds: ['accessible-inspection'], additionalRiskText: harmlessFalseValue }).decision, 'manual_review');
});

test('pest treatment semantics block explicit dangerous requests and review harmless context', () => {
  const base = { selectedScopeIds: ['accessible-inspection'] };
  for (const text of ['Please exterminate them', 'Kill/remove nest', 'Apply poison near the pantry']) {
    assert.equal(classifyServiceScope('pest-control.diagnostic', { ...base, additionalRiskText: text }).decision, 'blocked', text);
  }
  assert.equal(classifyServiceScope('pest-control.diagnostic', { ...base, additionalRiskText: 'Droppings near pantry' }).decision, 'manual_review');
});

test('Trust bypass phrases fail closed before allowed matching', () => {
  const cases = [
    ['cleaning.routine_domestic', 'vacuum-mop-dust', 'pool and filter cleaning'],
    ['gardening.basic_maintenance', 'mowing', 'build a raised garden bed'],
    ['beauty.adult_low_risk', 'makeup-strip-lashes', 'eyelash extensions'],
    ['handyman.minor_tasks', 'flat-pack', 'garage door opener'],
    ['rubbish-removal.ordinary', 'household-furniture', 'dead animal carcass'],
    ['pest-control.diagnostic', 'accessible-inspection', 'pest spray treatment'],
  ];
  for (const [serviceKey, scopeId, notes] of cases) {
    assert.equal(classifyServiceScope(serviceKey, { selectedScopeIds: [scopeId], notes, adultConfirmed: true }).decision, 'blocked', notes);
  }
  assert.equal(classifyServiceScope('pest-control.diagnostic', { selectedScopeIds: [], notes: 'pest treatment' }).decision, 'blocked');
});

test('Beauty needs explicit adult confirmation plus a selected low-risk scope', () => {
  assert.equal(classifyServiceScope('beauty.adult_low_risk', { selectedScopeIds: ['makeup-strip-lashes'] }).reason, 'adult_confirmation_required');
  assert.equal(classifyServiceScope('beauty.adult_low_risk', { selectedScopeIds: ['makeup-strip-lashes'], adultConfirmed: true }).decision, 'allowed');
  assert.equal(classifyServiceScope('beauty.adult_low_risk', { selectedScopeIds: [], adultConfirmed: true }).decision, 'manual_review');
});

test('manual-review services never auto-allow', () => {
  assert.equal(classifyServiceScope('cleaning.ordinary_deep_clean', { selectedScopeIds: ['ordinary-deep-clean'] }).decision, 'manual_review');
  assert.equal(classifyServiceScope('pest-control.pesticide_treatment', { selectedScopeIds: ['post-diagnostic-treatment'] }).decision, 'manual_review');
});
