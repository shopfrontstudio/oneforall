import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntakeDraft, evaluateIntakeDraft, loadSessionIntake, nextPreviewState, saveSessionIntake, INTAKE_STORAGE_KEY, INTAKE_TTL_MS } from '../src/lib/intake.js';
import { isPublicPath, LEGACY_REDIRECTS } from '../src/lib/routes.js';
import { readFile } from 'node:fs/promises';

const storage = () => { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), values }; };

test('scheduled intake requires a configured selection and schedule', () => {
  const empty = { ...createIntakeDraft('cleaning.routine_domestic'), suburb: 'Ballarat', preferred_date: '2026-09-01' };
  assert.equal(evaluateIntakeDraft(empty).state, 'error');
  const draft = { ...empty, selected_scope_ids: ['vacuum-mop-dust'], recurrence: 'fortnightly' };
  assert.equal(evaluateIntakeDraft(draft).state, 'ready');
});

test('optional notes may tighten but never widen selected scope', () => {
  const base = { ...createIntakeDraft('handyman.minor_tasks'), selected_scope_ids: ['flat-pack'], suburb: 'Ballarat' };
  assert.equal(evaluateIntakeDraft(base).state, 'ready');
  assert.equal(evaluateIntakeDraft({ ...base, scope_description: 'garage door opener' }).state, 'restricted');
  assert.equal(evaluateIntakeDraft({ ...base, scope_description: 'something else entirely' }).state, 'manual_review');
});

test('licensed diagnostic blocks all treatment wording', () => {
  const base = { ...createIntakeDraft('pest-control.diagnostic'), selected_scope_ids: ['accessible-inspection'], suburb: 'Ballarat', reported_pest: 'Not sure', observed_signs: 'Small droppings by the pantry' };
  assert.equal(evaluateIntakeDraft(base).state, 'manual_review');
  for (const notes of ['pest treatment', 'spray for ants', 'treat the infestation']) assert.equal(evaluateIntakeDraft({ ...base, scope_description: notes }).state, 'restricted');
  assert.equal(evaluateIntakeDraft({ ...base, observed_signs: 'Please spray and treat the entire house' }).state, 'restricted');
  assert.equal(evaluateIntakeDraft({ ...base, reported_pest: 'Need treatment for ants' }).state, 'restricted');
  assert.equal(evaluateIntakeDraft({ ...base, safety_considerations: 'considerations_present' }).state, 'manual_review');
  assert.equal(evaluateIntakeDraft({ ...base, safety_considerations: 'prefer_not_to_say' }).state, 'manual_review');
});

test('beauty requires adult confirmation and low-risk selected scope', () => {
  const base = { ...createIntakeDraft('beauty.adult_low_risk'), selected_scope_ids: ['makeup-strip-lashes'], suburb: 'Ballarat', preferred_date: '2026-09-01' };
  assert.equal(evaluateIntakeDraft(base).state, 'restricted');
  assert.equal(evaluateIntakeDraft({ ...base, adult_scope_confirmed: true }).state, 'ready');
  assert.equal(evaluateIntakeDraft({ ...base, adult_scope_confirmed: true, scope_description: 'eyelash extensions' }).state, 'restricted');
});

test('session draft is bounded, service-scoped and expires', () => {
  const store = storage();
  const now = 100000;
  const draft = { ...createIntakeDraft('cleaning.routine_domestic', now), selected_scope_ids: ['vacuum-mop-dust'], photo_names: ['room.jpg'] };
  assert.equal(saveSessionIntake(draft, store, now), true);
  assert.ok(store.getItem(INTAKE_STORAGE_KEY));
  assert.equal(loadSessionIntake('gardening.basic_maintenance', store, now), null);
  assert.equal(loadSessionIntake('cleaning.routine_domestic', store, now + INTAKE_TTL_MS + 1), null);
  assert.deepEqual(loadSessionIntake('cleaning.routine_domestic', store, now).selected_scope_ids, ['vacuum-mop-dust']);
});

test('storage failure is non-throwing and reports unsaved', () => {
  const failing = { setItem() { throw new Error('denied'); } };
  assert.equal(saveSessionIntake(createIntakeDraft('cleaning.routine_domestic'), failing), false);
});

test('public routes and legacy redirects preserve the auth boundary', () => {
  for (const path of ['/', '/services', '/services/cleaning.routine_domestic', '/request/cleaning.routine_domestic', '/login']) assert.equal(isPublicPath(path), true);
  for (const path of ['/bookings', '/messages', '/account']) assert.equal(isPublicPath(path), false);
  assert.equal(LEGACY_REDIRECTS['/post-job'], '/services');
  assert.equal(LEGACY_REDIRECTS['/my-jobs'], '/bookings');
});

test('local preview reports duplicate submissions without creating another action', () => {
  assert.equal(nextPreviewState(0), 'preview_complete');
  assert.equal(nextPreviewState(1), 'duplicate');
});

test('public catalogue and intake pages contain no Base44 data/function access', async () => {
  const paths = ['../src/pages/public/Home.jsx', '../src/pages/public/Services.jsx', '../src/pages/public/ServiceDetail.jsx', '../src/pages/public/Intake.jsx'];
  for (const path of paths) assert.doesNotMatch(await readFile(new URL(path, import.meta.url), 'utf8'), /api\/base44Client|functions\.invoke|entities\./i);
});

test('service detail does not expose a false aria-disabled link', async () => {
  const source = await readFile(new URL('../src/pages/public/ServiceDetail.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /aria-disabled/);
  assert.match(source, /serviceAvailabilityMessage/);
});

test('adult and scope groups expose errors and ignore bubbled internal blur', async () => {
  const source = await readFile(new URL('../src/pages/public/Intake.jsx', import.meta.url), 'utf8');
  assert.match(source, /event\.currentTarget\.contains\(event\.relatedTarget\)/);
  assert.match(source, /markGroupTouched\('adult_scope_confirmed'\)/);
  assert.match(source, /markGroupTouched\('selected_scope_ids'\)/);
  assert.match(source, /aria-invalid=\{Boolean\(error\('adult_scope_confirmed'\)\)\}/);
  assert.match(source, /aria-describedby=\{error\('selected_scope_ids'\)/);
});

test('invalid submit focuses the first invalid control after errors render', async () => {
  const source = await readFile(new URL('../src/pages/public/Intake.jsx', import.meta.url), 'utf8');
  assert.match(source, /useRef\(null\)/);
  assert.match(source, /<form ref=\{formRef\}/);
  assert.match(source, /if \(next\.state === 'error' && Object\.keys\(next\.errors \|\| \{\}\)\.length\)/);
  assert.match(source, /querySelector\('\[aria-invalid="true"\]'\)/);
  assert.match(source, /invalidElement\?\.querySelector\(FOCUSABLE_CONTROL\)/);
  assert.match(source, /focusTarget\?\.focus\(\)/);
  assert.doesNotMatch(source, /next\.state === 'restricted'[\s\S]*setInvalidFocusRequest/);
});
