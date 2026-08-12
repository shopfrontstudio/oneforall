import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntakeDraft, evaluateIntakeDraft, loadSessionIntake, nextPreviewState, saveSessionIntake, INTAKE_STORAGE_KEY, INTAKE_TTL_MS } from '../src/lib/intake.js';
import { isPublicPath, LEGACY_REDIRECTS } from '../src/lib/routes.js';
import { readFile } from 'node:fs/promises';

const storage = () => { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), values }; };

test('scheduled/recurring intake validates schedule and can become ready', () => {
  const draft = { ...createIntakeDraft('cleaning.routine_domestic'), scope_description: 'Vacuum and mop the living areas', suburb: 'Ballarat', preferred_date: '2026-09-01', recurrence: 'fortnightly' };
  assert.equal(evaluateIntakeDraft(draft).state, 'ready');
});

test('managed quote intake requires expanded scope and routes review terms', () => {
  const short = { ...createIntakeDraft('handyman.minor_tasks'), scope_description: 'Hang shelf', suburb: 'Ballarat' };
  assert.equal(evaluateIntakeDraft(short).state, 'error');
  const review = { ...short, scope_description: 'Mount a heavy shelf with wall anchors', suburb: 'Ballarat' };
  assert.equal(evaluateIntakeDraft(review).state, 'manual_review');
});

test('licensed diagnostic intake needs pest observations and blocks direct treatment', () => {
  const draft = { ...createIntakeDraft('pest-control.diagnostic'), scope_description: 'Inspect signs in the kitchen only', suburb: 'Ballarat', reported_pest: 'Not sure', observed_signs: 'Small droppings by the pantry' };
  assert.equal(evaluateIntakeDraft(draft).state, 'ready');
  assert.equal(evaluateIntakeDraft({ ...draft, scope_description: 'Treat now without SDS' }).state, 'restricted');
});

test('beauty restricted terms fail closed', () => {
  const draft = { ...createIntakeDraft('beauty.adult_low_risk'), scope_description: 'Microneedling treatment requested', suburb: 'Ballarat', preferred_date: '2026-09-01' };
  assert.equal(evaluateIntakeDraft(draft).state, 'restricted');
});

test('session draft is bounded, service-scoped and expires', () => {
  const store = storage();
  const now = 100000;
  const draft = { ...createIntakeDraft('cleaning.routine_domestic', now), scope_description: 'Routine clean', photo_names: ['room.jpg'] };
  assert.equal(saveSessionIntake(draft, store, now), true);
  assert.ok(store.getItem(INTAKE_STORAGE_KEY));
  assert.equal(loadSessionIntake('gardening.basic_maintenance', store, now), null);
  assert.equal(loadSessionIntake('cleaning.routine_domestic', store, now + INTAKE_TTL_MS + 1), null);
  assert.deepEqual(loadSessionIntake('cleaning.routine_domestic', store, now).photo_names, ['room.jpg']);
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
  for (const path of paths) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /api\/base44Client|functions\.invoke|entities\./i);
  }
});

test('App declares public catalogue routes separately from protected customer routes', async () => {
  const source = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  for (const route of ['path="/"', 'path="/services"', 'path="/services/:serviceKey"', 'path="/request/:serviceKey"']) assert.match(source, new RegExp(route));
  for (const route of ['path="/bookings"', 'path="/messages"', 'path="/account"']) assert.match(source, new RegExp(route));
  assert.ok(source.indexOf('element={<PublicLayout />}') < source.indexOf('element={<ProtectedRoute'));
});

test('authentication stays lazy for anonymous visitors but resumes for an existing token', async () => {
  const source = await readFile(new URL('../src/lib/AuthContext.jsx', import.meta.url), 'utf8');
  assert.match(source, /if \(appParams\.token\) checkUserAuth\(\)/);
  assert.match(source, /await import\('@\/api\/base44Client'\)/);
  assert.doesNotMatch(source, /apps\/public|public-settings\/by-id/);
});
