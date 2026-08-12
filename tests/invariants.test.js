import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chooseCanonicalBooking, canTransitionBooking, idempotencyScope } from '../base44/shared/marketplace.js';

const matches = (row, scope) => Object.entries(scope).every(([key, value]) => row[key] === value);

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

test('idempotency scopes reject cross-user and cross-parent collisions', () => {
  const foreignJob = { request_idempotency_key: 'same', customer_id: 'customer-b', service_key: 'cleaning.routine_domestic' };
  assert.equal(matches(foreignJob, idempotencyScope.job({ key: 'same', customerId: 'customer-a', serviceKey: 'cleaning.routine_domestic' })), false);

  const foreignQuote = { idempotency_key: 'same', tradie_id: 'provider-a', job_id: 'job-b' };
  assert.equal(matches(foreignQuote, idempotencyScope.quote({ key: 'same', providerId: 'provider-a', jobId: 'job-a' })), false);

  const foreignBooking = { idempotency_key: 'same', customer_id: 'customer-b', job_id: 'job-a' };
  assert.equal(matches(foreignBooking, idempotencyScope.booking({ key: 'same', customerId: 'customer-a', jobId: 'job-a' })), false);

  const foreignEvent = { idempotency_key: 'same', actor_id: 'actor-a', booking_id: 'booking-b', job_id: 'job-a' };
  assert.equal(matches(foreignEvent, idempotencyScope.event({ key: 'same', actorId: 'actor-a', bookingId: 'booking-a', jobId: 'job-a' })), false);
});

test('ServiceDefinition schema represents catalogue policy without category branches', async () => {
  const schema = await readFile(new URL('../base44/entities/ServiceDefinition.jsonc', import.meta.url), 'utf8');
  for (const field of ['review_scope', 'blocked_scope', 'manual_review_required', 'adults_only', 'block_terms', 'review_terms', 'trigger_configuration']) {
    assert.match(schema, new RegExp(`"${field}"`));
  }
});

test('worker disclosure is provider-supplied and customer-acknowledged', async () => {
  const [send, respond, accept] = await Promise.all([
    readFile(new URL('../base44/functions/send-interest/entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../base44/functions/respond-invitation/entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../base44/functions/accept-interest/entry.js', import.meta.url), 'utf8'),
  ]);
  assert.match(send, /payload\.substitution_disclosed !== true/);
  assert.match(respond, /payload\.substitution_disclosed !== true/);
  assert.doesNotMatch(`${send}\n${respond}`, /substitution_disclosed:\s*true/);
  assert.match(accept, /worker_acknowledged === true/);
  assert.match(accept, /attending_worker_display_name/);
});

test('boost backend is a permanent non-writing tombstone', async () => {
  const source = await readFile(new URL('../base44/functions/boost-job/entry.js', import.meta.url), 'utf8');
  assert.match(source, /permanently unavailable/);
  assert.match(source, /410/);
  assert.doesNotMatch(source, /entities\.(Boost|Job)\.(create|update|delete)/);
});
