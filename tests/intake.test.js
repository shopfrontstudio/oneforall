import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyServiceScope } from '../src/domain/catalogue.js';
import { createIntakeDraft, evaluateIntakeDraft, sanitiseIntakeDraft } from '../src/lib/intake.js';

test('emergency and prohibited wording always fails closed', () => {
  const base = { selectedScopeIds: ['flat-pack'] };
  assert.deepEqual(classifyServiceScope('handyman.minor_tasks', { ...base, scopeNotes: 'There is immediate danger, call 000' }).decision, 'blocked');
  assert.deepEqual(classifyServiceScope('handyman.minor_tasks', { ...base, scopeNotes: 'Please fix electrical wiring' }).decision, 'blocked');
  for (const emergency of ['I can smell gas', 'The switchboard is arcing', 'A burst pipe is flooding the house', 'There is a structural collapse risk']) {
    const result = classifyServiceScope('handyman.minor_tasks', { ...base, scopeNotes: emergency });
    assert.equal(result.decision, 'blocked');
    assert.equal(result.reason, 'emergency_redirect');
  }
});

test('guided Not Sure requires description and suburb, then stays private manual review', () => {
  const draft = { ...createIntakeDraft('general.guided_request'), selected_scope_ids: ['guided-triage'], suburb: 'Ballarat' };
  assert.equal(evaluateIntakeDraft(draft).state, 'error');
  const reviewed = evaluateIntakeDraft({ ...draft, scope_description: 'I hear a noise inside the wall and need help choosing.' });
  assert.equal(reviewed.state, 'manual_review');
  assert.equal(reviewed.scope.decision, 'manual_review');
});

test('Painting structured hazards block or review and safe ground-level answers do not widen scope', () => {
  const base = {
    ...createIntakeDraft('painting.residential'),
    selected_scope_ids: ['interior-walls-ceilings'],
    suburb: 'Ballarat',
    painting_property_era: '1970_or_later',
    painting_surface_hazard: 'none_known',
    painting_access_height: 'ground_level',
  };
  assert.equal(evaluateIntakeDraft(base).state, 'ready');
  assert.equal(evaluateIntakeDraft({ ...base, painting_surface_hazard: 'lead_or_asbestos' }).state, 'restricted');
  assert.equal(evaluateIntakeDraft({ ...base, painting_access_height: 'roof' }).state, 'restricted');
  assert.equal(evaluateIntakeDraft({ ...base, painting_property_era: 'unknown' }).state, 'manual_review');
  assert.equal(evaluateIntakeDraft({ ...base, painting_access_height: 'ladder_or_height' }).state, 'manual_review');
});

test('Building intake cannot select execution work and remains manual review', () => {
  const base = { ...createIntakeDraft('building-renovation.managed_quote'), selected_scope_ids: ['renovation-consultation'], suburb: 'Ballarat' };
  assert.equal(evaluateIntakeDraft(base).state, 'manual_review');
  const staleDraft = sanitiseIntakeDraft({ ...base, selected_scope_ids: ['building-repairs'] });
  assert.deepEqual(staleDraft.selected_scope_ids, []);
  assert.equal(evaluateIntakeDraft(staleDraft).state, 'error');
});

test('pest diagnostic rejects treatment requests and treatment pathway requires review', () => {
  const diagnostic = { ...createIntakeDraft('pest-control.diagnostic'), selected_scope_ids: ['accessible-inspection'], suburb: 'Ballarat', reported_pest: 'Ants', observed_signs: 'Ant trails near the pantry' };
  assert.equal(evaluateIntakeDraft({ ...diagnostic, scope_description: 'Please spray and treat them' }).state, 'restricted');
  const treatment = { ...createIntakeDraft('pest-control.pesticide_treatment'), selected_scope_ids: ['post-diagnostic-treatment'], suburb: 'Ballarat', reported_pest: 'Ants', observed_signs: 'Diagnostic already completed' };
  assert.equal(evaluateIntakeDraft(treatment).state, 'manual_review');
});
