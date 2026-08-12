import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bookingRepairPlan, canSelectProviderExperience, canTransitionBooking, chooseCanonicalBooking, idempotencyScope, requestTransitionRepairPlan, transitionRepairPlan } from '../base44/shared/marketplace.js';

test('canonical booking selection is deterministic and superseded rows cannot win', () => {
  const bookings = [{ id: 'b2', state: 'accepted', created_date: '2026-08-12T01:00:00Z' }, { id: 'b1', state: 'accepted', created_date: '2026-08-12T01:00:00Z' }, { id: 'b0', state: 'superseded', created_date: '2026-08-11T01:00:00Z' }];
  assert.equal(chooseCanonicalBooking(bookings).id, 'b1');
});

test('acceptance reconciliation repairs quote, siblings, job, event and conversation', () => {
  const booking = { id: 'b1', job_id: 'j1', quote_id: 'q1', provider_id: 'p1' };
  const plan = bookingRepairPlan({ booking, job: { id: 'j1', status: 'published' }, quotes: [{ id: 'q1', status: 'pending' }, { id: 'q2', status: 'pending' }], events: [], conversations: [], eventKey: 'accept:event' });
  assert.deepEqual(plan.quote_updates, [{ id: 'q1', status: 'accepted', booking_id: 'b1' }, { id: 'q2', status: 'declined' }]);
  assert.deepEqual(plan.job_update, { status: 'matched', booking_id: 'b1', accepted_quote_id: 'q1', assigned_tradie_id: 'p1' });
  assert.equal(plan.event_missing, true);
  assert.equal(plan.conversation_missing, true);
});

test('transition retry can repair canonical booking and job mapping', () => {
  const eventScope = idempotencyScope.event({ key: 'k', actorId: 'p1', bookingId: 'b1', jobId: 'j1' });
  const scheduledStart = '2026-08-20T00:00:00.000Z';
  const plan = transitionRepairPlan({ booking: { id: 'b1', state: 'accepted' }, job: { status: 'matched' }, events: [{ ...eventScope, from_state: 'accepted', to_state: 'scheduled', metadata: { scheduled_start: scheduledStart } }], toState: 'scheduled', eventScope });
  assert.equal(plan.event_missing, false);
  assert.equal(plan.booking_needs_update, true);
  assert.equal(plan.effective_state, 'scheduled');
  assert.equal(plan.effective_scheduled_start, scheduledStart);
  assert.equal(plan.scheduled_start_needs_update, true);
  assert.equal(plan.repair_mode, 'resume_interrupted_transition');
});

test('historic transition retry preserves a booking that already progressed and repairs Job forward', () => {
  const eventScope = idempotencyScope.event({ key: 'old', actorId: 'p1', bookingId: 'b1', jobId: 'j1' });
  const scheduledStart = '2026-08-20T00:00:00.000Z';
  const plan = transitionRepairPlan({ booking: { id: 'b1', state: 'in_progress', scheduled_start: scheduledStart }, job: { status: 'matched' }, events: [{ ...eventScope, from_state: 'accepted', to_state: 'scheduled', metadata: { scheduled_start: '2026-08-19T00:00:00.000Z' } }], toState: 'scheduled', eventScope });
  assert.equal(plan.event_missing, false);
  assert.equal(plan.booking_needs_update, false);
  assert.equal(plan.effective_state, 'in_progress');
  assert.equal(plan.job_needs_update, true);
  assert.equal(plan.repair_mode, 'preserve_current_state');
  assert.equal(plan.effective_scheduled_start, scheduledStart);
  assert.equal(plan.scheduled_start_needs_update, false);
});

test('historic scheduling retry can fill a missing canonical time without state regression', () => {
  const eventScope = idempotencyScope.event({ key: 'old', actorId: 'p1', bookingId: 'b1', jobId: 'j1' });
  const scheduledStart = '2026-08-20T00:00:00.000Z';
  const plan = transitionRepairPlan({ booking: { id: 'b1', state: 'in_progress' }, job: { status: 'in_progress' }, events: [{ ...eventScope, from_state: 'accepted', to_state: 'scheduled', metadata: { scheduled_start: scheduledStart } }], toState: 'scheduled', eventScope });
  assert.equal(plan.effective_state, 'in_progress');
  assert.equal(plan.booking_needs_update, false);
  assert.equal(plan.effective_scheduled_start, scheduledStart);
  assert.equal(plan.scheduled_start_needs_update, true);
});

test('scheduled-state retry that fills missing canonical time remains eligibility-sensitive', () => {
  const eventScope = idempotencyScope.event({ key: 'repair', actorId: 'p1', bookingId: 'b1', jobId: 'j1' });
  const plan = transitionRepairPlan({
    booking: { id: 'b1', state: 'scheduled' },
    job: { status: 'matched' },
    events: [{ ...eventScope, from_state: 'accepted', to_state: 'scheduled', metadata: { scheduled_start: '2026-08-20T00:00:00.000Z' } }],
    toState: 'scheduled',
    eventScope,
  });
  assert.equal(plan.booking_needs_update, false);
  assert.equal(plan.effective_state, 'scheduled');
  assert.equal(plan.scheduled_start_needs_update, true);
});

test('request transition retry advances only its observed state and never regresses later work', () => {
  const event = { from_state: 'draft', to_state: 'cancelled' };
  assert.deepEqual(requestTransitionRepairPlan({ job: { status: 'draft' }, event }), {
    effective_status: 'cancelled', request_needs_update: true, repair_mode: 'resume_interrupted_transition',
  });
  assert.deepEqual(requestTransitionRepairPlan({ job: { status: 'published' }, event }), {
    effective_status: 'published', request_needs_update: false, repair_mode: 'preserve_current_state',
  });
});

test('booking transition permissions separate customer, provider and admin authority', () => {
  assert.equal(canTransitionBooking('accepted', 'scheduled', 'provider'), true);
  assert.equal(canTransitionBooking('accepted', 'completed', 'provider'), false);
  assert.equal(canTransitionBooking('in_progress', 'completed', 'provider'), true);
});

test('closed onboarding blocks only net-new provider experience selection', () => {
  assert.equal(canSelectProviderExperience({ currentAccountType: 'customer', onboardingOpen: false, hasProfile: false, hasApprovedOffering: false }), false);
  assert.equal(canSelectProviderExperience({ currentAccountType: 'customer', onboardingOpen: false, hasProfile: true, hasApprovedOffering: false }), true);
  assert.equal(canSelectProviderExperience({ currentAccountType: 'customer', onboardingOpen: false, hasProfile: false, hasApprovedOffering: true }), true);
  assert.equal(canSelectProviderExperience({ currentAccountType: 'customer', onboardingOpen: true, hasProfile: false, hasApprovedOffering: false }), true);
});

test('private evidence and immutable booking/request events are closed to client writes', async () => {
  const [evidence, bookingEvent, requestEvent] = await Promise.all([
    readFile(new URL('../base44/entities/ProviderEvidence.jsonc', import.meta.url), 'utf8'),
    readFile(new URL('../base44/entities/BookingEvent.jsonc', import.meta.url), 'utf8'),
    readFile(new URL('../base44/entities/request-event.jsonc', import.meta.url), 'utf8'),
  ]);
  assert.match(evidence, /"subject_type"/);
  assert.match(evidence, /"supersedes_evidence_id"/);
  assert.match(evidence, /"superseded_by_evidence_id"/);
  for (const source of [bookingEvent, requestEvent]) { assert.match(source, /"update": false/); assert.match(source, /"delete": false/); }
  assert.match(requestEvent, /"data\.customer_id": "\{\{user\.id\}\}"/);
  assert.match(requestEvent, /"data\.provider_id": "\{\{user\.id\}\}"/);
});

test('transition-request records the scoped immutable RequestEvent', async () => {
  const [source, schema] = await Promise.all([
    readFile(new URL('../base44/functions/transition-request/entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../base44/entities/request-event.jsonc', import.meta.url), 'utf8'),
  ]);
  assert.match(source, /entities\.RequestEvent\.filter\(scope\)/);
  assert.match(source, /entities\.RequestEvent\.create\(/);
  assert.match(source, /idempotencyScope\.requestEvent/);
  assert.match(source, /requestTransitionRepairPlan/);
  assert.match(schema, /"name": "RequestEvent"/);
  assert.match(schema, /"update": false/);
  assert.match(schema, /"delete": false/);
});

test('transition-booking requires expected_version and canonical lookup', async () => {
  const source = await readFile(new URL('../base44/functions/transition-booking/entry.js', import.meta.url), 'utf8');
  assert.match(source, /Number\.isInteger\(expected_version\)/);
  assert.match(source, /chooseCanonicalBooking\(matches\)/);
  assert.match(source, /repairTransition/);
  assert.match(source, /idempotencyScope\.event\(\{ key: eventKey, actorId, bookingId: booking\.id, jobId: booking\.job_id \}\)/);
  assert.match(source, /Best-effort post-event re-read/);
  assert.match(source, /Base44 does not expose a transaction or[\s\S]*compare-and-swap/);
  assert.match(source, /normaliseFutureDateTime\(scheduled_start\)/);
  assert.match(source, /metadata = \{ scheduled_start: scheduledStart \}/);
  assert.match(source, /update\.scheduled_start = plan\.effective_scheduled_start/);
  assert.match(source, /loadExactBookingEligibility/);
  assert.match(source, /\['scheduled', 'in_progress'\]\.includes\(to_state\)/);
  assert.match(source, /booking\.state === prior\.from_state/);
  assert.match(source, /bookingTransitionEligibilityInstant/);
  assert.match(source, /plan\.booking_needs_update \|\| plan\.scheduled_start_needs_update/);
});

test('existing canonical acceptance runs reconciliation before returning', async () => {
  const source = await readFile(new URL('../base44/functions/accept-interest/entry.js', import.meta.url), 'utf8');
  assert.match(source, /if \(existingWinner\)[\s\S]*reconcileAcceptedBooking/);
  assert.match(source, /no transaction or unique constraint/i);
  assert.match(source, /latestServiceDate\(job\.preferred_date, request\.earliest_availability\)/);
  assert.match(source, /to_state: 'accepted'/);
  assert.match(source, /historic_acceptance_repair/);
  assert.match(source, /observed_booking_state: booking\.state/);
  assert.match(source, /request\.provider_assertion_id/);
  assert.match(source, /latestPublicAssertionForServicePeriod/);
});

test('routed customer provider view uses assertions only', async () => {
  const source = await readFile(new URL('../src/pages/tradie/TradieProfileView.jsx', import.meta.url), 'utf8');
  assert.match(source, /ProviderPublicAssertion/);
  assert.doesNotMatch(source, /TradieProfile|pseudoDistance|\.bio|licence_number|insurance_provider|public_liability/);
});

test('public assertions require a bounded validity date in schema and routing', async () => {
  const [schema, notify] = await Promise.all([
    readFile(new URL('../base44/entities/ProviderPublicAssertion.jsonc', import.meta.url), 'utf8'),
    readFile(new URL('../base44/shared/notify.js', import.meta.url), 'utf8'),
  ]);
  assert.match(schema, /"required": \[[^\]]*"valid_through"/);
  assert.match(notify, /if \(!assertion\) return null/);
});

test('request rows are not an authenticated open feed', async () => {
  const schema = await readFile(new URL('../base44/entities/Job.jsonc', import.meta.url), 'utf8');
  assert.doesNotMatch(schema, /\{ "data\.status": "published" \}/);
});

test('private provider drafts are owner/admin only and customer surfaces never read them', async () => {
  const [schema, customerHome, providerView, jobDetail] = await Promise.all([
    readFile(new URL('../base44/entities/TradieProfile.jsonc', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/customer/Home.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/tradie/TradieProfileView.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/JobDetail.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(schema, /"data\.user_id": "\{\{user\.id\}\}"/);
  assert.match(schema, /"create": \{ "user_condition": \{ "role": "admin" \} \}/);
  assert.match(schema, /"user_id"[\s\S]*Server-pinned owner identifier[\s\S]*"write": \{ "user_condition": \{ "role": "admin" \} \}/);
  for (const source of [customerHome, providerView, jobDetail]) assert.doesNotMatch(source, /entities\.TradieProfile/);
});

test('managed routing uses safe invitation snapshots and never exposes the private Job feed', async () => {
  const [schema, invite, notify, providerRequests, sendInterest] = await Promise.all([
    readFile(new URL('../base44/entities/Invitation.jsonc', import.meta.url), 'utf8'),
    readFile(new URL('../base44/functions/invite-tradie/entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../base44/shared/notify.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/tradie/Discover.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../base44/functions/send-interest/entry.js', import.meta.url), 'utf8'),
  ]);
  for (const field of ['service_key', 'selected_scope_ids', 'selected_scope_labels', 'service_area', 'preferred_date', 'indicative_low', 'indicative_high']) assert.match(schema, new RegExp(`"${field}"`));
  assert.match(schema, /Deprecated private field/);
  assert.match(invite, /provider_assertion_id/);
  assert.doesNotMatch(invite, /TradieProfile|customer_name:/);
  assert.match(notify, /selectedScopeIds: job\.selected_scope_ids/);
  assert.doesNotMatch(notify, /TradieProfile/);
  assert.match(providerRequests, /entities\.Invitation\.filter/);
  assert.doesNotMatch(providerRequests, /entities\.Job/);
  assert.match(sendInterest, /payload\?\.invitation_id/);
  assert.match(sendInterest, /invitation\.tradie_id !== user\.id/);
  assert.match(sendInterest, /payload\.job_id && payload\.job_id !== invitation\.job_id/);
});

test('quote paths perform exact quote-time worker checks and assertion-only public snapshots', async () => {
  for (const path of ['../base44/functions/send-interest/entry.js', '../base44/functions/respond-invitation/entry.js']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /evaluateWorkerEligibility/);
    assert.match(source, /ProviderEvidence\.filter\(\{ provider_id: user\.id, worker_id: payload\.attending_worker_id \}\)/);
    assert.match(source, /latestServiceDate\(job\.preferred_date, quote\.availability\)/);
    assert.match(source, /serviceDateHasPassed\(serviceDate\)/);
    assert.match(source, /ProviderPublicAssertion/);
    assert.match(source, /if \(!assertion\)/);
    assert.match(source, /validateLockedQuoteMessage/);
    assert.doesNotMatch(source, /TradieProfile/);
  }
});

test('provider onboarding and account switching are gated server-side while flags are off', async () => {
  const [userSchema, tradieSchema, backend, client, onboarding] = await Promise.all([
    readFile(new URL('../base44/entities/User.jsonc', import.meta.url), 'utf8'),
    readFile(new URL('../base44/entities/TradieProfile.jsonc', import.meta.url), 'utf8'),
    readFile(new URL('../base44/functions/set-account-type/entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/oneforall.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/pages/Onboarding.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(userSchema, /"account_type"[\s\S]*"write": \{ "user_condition": \{ "role": "admin" \} \}/);
  assert.match(tradieSchema, /"create": \{ "user_condition": \{ "role": "admin" \} \}/);
  assert.match(backend, /provider_onboarding_enabled/);
  assert.match(backend, /Provider onboarding is not currently available/);
  assert.match(backend, /TradieProfile\.filter\(\{ user_id: user\.id \}\)/);
  assert.match(backend, /ProviderOffering\.filter\(\{ provider_id: user\.id, review_status: 'approved' \}\)/);
  assert.match(client, /callFunction\('set-account-type'/);
  assert.doesNotMatch(client, /TradieProfile\.create/);
  assert.match(onboarding, /!PROVIDER_ONBOARDING_OPEN/);
});

test('customer profile exposes only an established-provider switch-back attempt', async () => {
  const source = await readFile(new URL('../src/pages/customer/Profile.jsx', import.meta.url), 'utf8');
  assert.match(source, /TradieProfile\.filter\(\{ user_id: user\.id \}\)/);
  assert.match(source, /ProviderOffering\.filter\(\{ provider_id: user\.id, review_status: 'approved' \}\)/);
  assert.match(source, /!PROVIDER_ONBOARDING_OPEN && !establishedProvider/);
  assert.match(source, /Return to my provider account/);
  assert.match(source, /setAccountType\(next\)/);
  assert.match(source, /backend[\s\S]*authoritative/i);
  assert.match(source, /New provider onboarding remains closed/);
  assert.doesNotMatch(source, /TradieProfile\.create|ProviderOffering\.create/);
});

test('provider booking actions follow canonical booking states in order', async () => {
  const source = await readFile(new URL('../src/pages/JobDetail.jsx', import.meta.url), 'utf8');
  assert.match(source, /booking\?\.state === 'accepted'[\s\S]*transition\('scheduled'\)/);
  assert.match(source, /booking\?\.state === 'scheduled'[\s\S]*transition\('in_progress'\)/);
  assert.match(source, /booking\?\.state === 'in_progress'[\s\S]*transition\('completed'\)/);
  assert.match(source, /expected_version: Number\(booking\.version \|\| 1\)/);
  assert.match(source, /type="datetime-local"/);
  assert.match(source, /scheduled_start: scheduledStartISO/);
  assert.match(source, /Confirmed schedule/);
  assert.match(source, /preferred[\s\S]*not confirmed/i);
  assert.match(source, /latestServiceDate\(nextJob\.preferred_date, quote\.earliest_availability\)/);
  assert.match(source, /assertions\[quote\.id\]/);
  assert.match(source, /melbourneLocalDateTimeToISO\(scheduledStart\)/);
  assert.match(source, /Ballarat time/);
  assert.match(source, /Australia\/Melbourne timezone/);
});

test('request submission screens every risk field, snapshots pest context and blocks disabled recurrence', async () => {
  const [source, schema] = await Promise.all([
    readFile(new URL('../base44/functions/submit-request/entry.js', import.meta.url), 'utf8'),
    readFile(new URL('../base44/entities/Job.jsonc', import.meta.url), 'utf8'),
  ]);
  for (const field of ['title', 'access_notes', 'safety_info', 'reported_pest', 'observed_signs', 'safety_considerations', 'pathway_fields', 'pathway_answers', 'pathway_data']) assert.match(source, new RegExp(field));
  assert.match(source, /definition\.flags\.recurrence_enabled !== true/);
  assert.match(source, /serviceDateHasPassed\(preferredDate\)/);
  assert.match(source, /serviceDateIsFuture\(preferredDate\)/);
  assert.match(source, /title: definition\.name/);
  for (const field of ['reported_pest', 'observed_signs', 'safety_considerations']) assert.match(schema, new RegExp(`"${field}"`));
});

test('idempotency scopes include actor and parent boundaries', () => {
  assert.deepEqual(idempotencyScope.requestEvent({ key: 'same', actorId: 'a', jobId: 'j' }), { idempotency_key: 'same', actor_id: 'a', job_id: 'j' });
  assert.deepEqual(idempotencyScope.booking({ key: 'same', customerId: 'c', jobId: 'j' }), { idempotency_key: 'same', customer_id: 'c', job_id: 'j' });
});
