import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASE1_SERVICE_MAP } from '../src/domain/catalogue.js';
import { CATEGORY_META, getCategoryServices } from '../src/lib/catalogue.js';
import { createIntakeDraftFromGuide } from '../src/lib/intake.js';
import {
  clearServiceGuideHandoff,
  findServiceProblem,
  loadServiceGuideHandoff,
  loadServiceGuideResult,
  saveServiceGuideResult,
  selectServiceGuideSuggestion,
  SERVICE_GUIDE_TTL_MS,
} from '../src/lib/serviceGuide.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

test('every focused category contains only its own configured services', () => {
  assert.equal(CATEGORY_META.length, 12);
  for (const category of CATEGORY_META) {
    const focused = getCategoryServices(category.key);
    assert.equal(focused.key, category.key);
    assert.ok(focused.services.length > 0);
    assert.ok(focused.services.every((service) => service.category === category.key));
  }
  assert.equal(getCategoryServices('unknown-category'), null);
});

test('service guide finds exact cleaning, plumbing and painting sub-options', () => {
  const cleaning = findServiceProblem('Please clean my bathroom and kitchen');
  assert.equal(cleaning.state, 'matched');
  assert.deepEqual(cleaning.suggestions[0].scope_ids, ['kitchen-bathroom']);

  const plumbing = findServiceProblem('My tap is leaking and dripping');
  assert.equal(plumbing.suggestions[0].service_key, 'plumbing.licensed_services');
  assert.ok(plumbing.suggestions[0].scope_ids.includes('tap-toilet-repair'));
  assert.ok(plumbing.suggestions[0].scope_ids.includes('leak-assessment'));

  const painting = findServiceProblem('I need someone to paint the interior wall and ceiling');
  assert.equal(painting.suggestions[0].service_key, 'painting.residential');
  assert.deepEqual(painting.suggestions[0].scope_ids, ['interior-walls-ceilings']);
});

test('mixed problems return no more than three ranked, valid catalogue suggestions', () => {
  const result = findServiceProblem('The bathroom needs cleaning, the tap is leaking and I need to paint the wall');
  assert.equal(result.state, 'matched');
  assert.equal(result.suggestions.length, 3);
  assert.deepEqual(result.suggestions.map((item) => item.service_key).sort(), [
    'cleaning.routine_domestic',
    'painting.residential',
    'plumbing.licensed_services',
  ]);
  for (const suggestion of result.suggestions) {
    const service = PHASE1_SERVICE_MAP[suggestion.service_key];
    const validScopes = new Set(service.scope_options.map((scope) => scope.id));
    assert.ok(suggestion.scope_ids.every((scopeId) => validScopes.has(scopeId)));
    assert.ok(suggestion.reason.split(/\s+/).length <= 6);
    for (const match of suggestion.scope_matches) {
      assert.ok(validScopes.has(match.scope_id));
      assert.ok(match.reason.split(/\s+/).length <= 6);
    }
  }
});

test('emergency wording overrides matching and unclear wording fails to guided review', () => {
  for (const problem of ['I can smell gas', 'The switchboard is arcing', 'A burst pipe is flooding the house']) {
    const result = findServiceProblem(problem);
    assert.equal(result.state, 'emergency');
    assert.deepEqual(result.suggestions, []);
  }
  const uncertain = findServiceProblem('Something feels off but I cannot explain it');
  assert.equal(uncertain.state, 'uncertain');
  assert.deepEqual(uncertain.suggestions, []);
});

test('guide handoff stays session-only, expires and prefills only valid editable intake fields', () => {
  const storage = new MemoryStorage();
  const now = 10_000;
  const result = findServiceProblem('My tap is leaking');
  assert.equal(saveServiceGuideResult(result, storage, now), true);
  assert.equal(selectServiceGuideSuggestion('plumbing.licensed_services', storage, now), true);

  const handoff = loadServiceGuideHandoff('plumbing.licensed_services', storage, now);
  assert.deepEqual(handoff.scope_ids, ['tap-toilet-repair', 'leak-assessment']);
  assert.equal(handoff.problem, 'My tap is leaking');

  const draft = createIntakeDraftFromGuide('plumbing.licensed_services', { ...handoff, scope_ids: [...handoff.scope_ids, 'not-real'] }, now);
  assert.deepEqual(draft.selected_scope_ids, ['tap-toilet-repair', 'leak-assessment']);
  assert.equal(draft.scope_description, 'My tap is leaking');
  draft.selected_scope_ids = [];
  assert.deepEqual(draft.selected_scope_ids, []);

  assert.equal(clearServiceGuideHandoff('plumbing.licensed_services', storage, now), true);
  assert.equal(loadServiceGuideHandoff('plumbing.licensed_services', storage, now), null);
  assert.ok(loadServiceGuideResult(storage, now));
  assert.equal(loadServiceGuideResult(storage, now + SERVICE_GUIDE_TTL_MS + 1), null);
});

test('uncertain results can hand off only to the private guided service', () => {
  const storage = new MemoryStorage();
  const now = 20_000;
  assert.equal(saveServiceGuideResult(findServiceProblem('Something unusual is happening'), storage, now), true);
  assert.equal(selectServiceGuideSuggestion('cleaning.routine_domestic', storage, now), false);
  assert.equal(selectServiceGuideSuggestion('general.guided_request', storage, now), true);
  const handoff = loadServiceGuideHandoff('general.guided_request', storage, now);
  assert.deepEqual(handoff.scope_ids, ['guided-triage']);
});
