import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chooseCanonicalBooking, canTransitionBooking } from '../base44/shared/marketplace.js';

test('canonical booking selection is deterministic and superseded rows cannot win', () => {
  const bookings = [
    { id: 'b2', state: 'accepted', created_date: '2026-08-12T01:00:00Z' },
    { id: 'b1', state: 'accepted', created_date: '2026-08-12T01:00:00Z' },
    { id: 'b0', state: 'superseded', created_date: '2026-08-11T01:00:00Z' },
  ];
  assert.equal(chooseCanonicalBooking(bookings).id, 'b1');
});

test('booking transition permissions separate customer, provider and admin authority', () => {
  assert.equal(canTransitionBooking('accepted', 'scheduled', 'provider'), true);
  assert.equal(canTransitionBooking('accepted', 'completed', 'provider'), false);
  assert.equal(canTransitionBooking('scheduled', 'in_progress', 'customer'), false);
  assert.equal(canTransitionBooking('in_progress', 'completed', 'provider'), true);
  assert.equal(canTransitionBooking('disputed', 'completed', 'admin'), true);
});

test('private evidence and immutable events are closed to direct client writes', async () => {
  const [evidence, event, job] = await Promise.all([
    readFile(new URL('../base44/entities/ProviderEvidence.jsonc', import.meta.url), 'utf8'),
    readFile(new URL('../base44/entities/BookingEvent.jsonc', import.meta.url), 'utf8'),
    readFile(new URL('../base44/entities/Job.jsonc', import.meta.url), 'utf8'),
  ]);
  assert.match(evidence, /"create": \{ "user_condition": \{ "role": "admin" \} \}/);
  assert.match(evidence, /"data\.provider_id": "\{\{user\.id\}\}"/);
  assert.match(event, /"update": false/);
  assert.match(event, /"delete": false/);
  assert.match(job, /"create": \{ "user_condition": \{ "role": "admin" \} \}/);
});

test('operational code contains no Subscription entity access', async () => {
  const paths = [
    '../base44/shared/guards.js', '../base44/shared/marketplace.js',
    '../base44/functions/send-interest/entry.js', '../base44/functions/respond-invitation/entry.js',
    '../base44/functions/accept-interest/entry.js', '../src/lib/oneforall.js',
  ];
  for (const path of paths) assert.doesNotMatch(await readFile(new URL(path, import.meta.url), 'utf8'), /entities\.Subscription/);
});
