const DEMO_VERSION = 3;
const DEMO_KEY_PREFIX = 'oneforall:provider-demo:';
const memoryStore = new Map();

export const DEMO_PROVIDER_WORKER_ID = 'demo-worker-alex-morgan';

const clone = (value) => JSON.parse(JSON.stringify(value));
const isoAfterHours = (now, hours) => new Date(new Date(now).getTime() + hours * 60 * 60 * 1000).toISOString();
const dateAfterDays = (now, days) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(new Date(now).getTime() + days * 24 * 60 * 60 * 1000));

const browserStorage = () => {
  try { return typeof window === 'undefined' ? null : window.localStorage; }
  catch { return null; }
};

const keyFor = (userId) => `${DEMO_KEY_PREFIX}${userId}`;

function readStored(userId, storage) {
  const key = keyFor(userId);
  try {
    const raw = storage?.getItem(key) ?? memoryStore.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeStored(userId, value, storage) {
  const key = keyFor(userId);
  const raw = JSON.stringify(value);
  try {
    if (storage) storage.setItem(key, raw);
    else memoryStore.set(key, raw);
  } catch { memoryStore.set(key, raw); }
  return clone(value);
}

function createDemoProviderState(userId, now = new Date()) {
  const owner = { id: DEMO_PROVIDER_WORKER_ID, provider_id: userId, display_name: 'Alex Morgan (Demo)', relationship_type: 'owner', review_status: 'verified', active: true };
  const serviceKey = 'plumbing.licensed_services';
  const created = new Date(now).toISOString();
  const scheduledToday = isoAfterHours(now, 2);
  const completedAt = isoAfterHours(now, -24 * 5);
  return {
    version: DEMO_VERSION,
    seeded_at: created,
    invitations: [{
      id: 'demo-match-leaking-tap', service_key: serviceKey, selected_scope_ids: ['tap-toilet-repair', 'leak-assessment'],
      status: 'pending', expires_at: isoAfterHours(now, 11), job_title: 'Kitchen tap leaking', service_area: 'Ballarat Central',
      preferred_date: dateAfterDays(now, 2), indicative_price_low: 120, indicative_price_high: 190,
      safe_access_factors: ['Ground-floor access', 'Water isolation accessible'], safe_safety_summary: 'No immediate flooding or exposed electrical risk reported.',
      scope_summary: 'Customer reports a steady drip from the kitchen mixer tap and would like the fixture checked and repaired.', safe_photo_paths: [],
      created_date: created,
    }],
    bookings: [
      {
        id: 'demo-booking-accepted', job_id: 'demo-job-accepted', quote_id: 'demo-quote-accepted', provider_id: userId,
        service_key: serviceKey, selected_scope_ids: ['drain-assessment'], state: 'accepted', scheduled_start: null,
        attending_worker_id: owner.id, attending_worker_display_name: owner.display_name, version: 1,
        confirmed_service_address: '24 Sample Street, Ballarat VIC (Demo)', confirmed_customer_contact: 'Jamie Lee · 0400 000 111 (Demo)',
        confirmed_access_details: 'Demo customer will meet the provider at the front door.', created_date: isoAfterHours(now, -4),
      },
      {
        id: 'demo-booking-today', job_id: 'demo-job-today', quote_id: 'demo-quote-today', provider_id: userId,
        service_key: serviceKey, selected_scope_ids: ['tap-toilet-repair'], state: 'scheduled', scheduled_start: scheduledToday,
        attending_worker_id: owner.id, attending_worker_display_name: owner.display_name, version: 1,
        confirmed_service_address: '8 Example Avenue, Alfredton VIC (Demo)', confirmed_customer_contact: 'Taylor Singh · 0400 000 222 (Demo)',
        confirmed_access_details: 'Side gate will be unlocked. Small dog is secured indoors.', created_date: isoAfterHours(now, -26),
      },
      {
        id: 'demo-booking-completed', job_id: 'demo-job-completed', quote_id: 'demo-quote-completed', provider_id: userId,
        service_key: serviceKey, selected_scope_ids: ['leak-assessment'], state: 'completed', scheduled_start: completedAt,
        attending_worker_id: owner.id, attending_worker_display_name: owner.display_name, version: 3,
        confirmed_service_address: '15 Practice Road, Wendouree VIC (Demo)', confirmed_customer_contact: 'Morgan Chen · 0400 000 333 (Demo)',
        confirmed_access_details: 'Completed sample booking.', created_date: isoAfterHours(now, -24 * 7),
      },
    ],
    jobs: [
      { id: 'demo-job-accepted', service_address: '24 Sample Street, Ballarat VIC (Demo)' },
      { id: 'demo-job-today', service_address: '8 Example Avenue, Alfredton VIC (Demo)' },
      { id: 'demo-job-completed', service_address: '15 Practice Road, Wendouree VIC (Demo)' },
    ],
    quotes: [
      { id: 'demo-quote-accepted', quote_low: 160, quote_high: 240 },
      { id: 'demo-quote-today', quote_low: 130, quote_high: 180 },
      { id: 'demo-quote-completed', quote_low: 145, quote_high: 210 },
    ],
    workers: [owner],
    messages: [
      { id: 'demo-message-1', booking_id: 'demo-booking-today', sender: 'customer', sender_name: 'Taylor Singh (Demo)', body: 'The tap is in the downstairs bathroom. See you this afternoon.', created_date: isoAfterHours(now, -3) },
      { id: 'demo-message-2', booking_id: 'demo-booking-today', sender: 'provider', sender_name: owner.display_name, body: 'Thanks, I have the details and will message when I am on the way.', created_date: isoAfterHours(now, -2.5) },
    ],
    payments: [],
    recurringSeries: [],
  };
}

export function isDemoProvider(user) {
  return Boolean(user?.demo_mode);
}

export function loadDemoProviderState(userId, now = new Date(), storage = browserStorage()) {
  const current = readStored(userId, storage);
  if (current?.version === DEMO_VERSION) return clone(current);
  return writeStored(userId, createDemoProviderState(userId, now), storage);
}

export function resetDemoProviderState(userId, now = new Date(), storage = browserStorage()) {
  const key = keyFor(userId);
  try {
    storage?.removeItem(key);
    memoryStore.delete(key);
  } catch { memoryStore.delete(key); }
  return writeStored(userId, createDemoProviderState(userId, now), storage);
}

export function respondToDemoInvitation(userId, invitationId, response, now = new Date(), storage = browserStorage()) {
  const state = loadDemoProviderState(userId, now, storage);
  const index = state.invitations.findIndex((row) => row.id === invitationId);
  if (index < 0) throw new Error('The demo match is unavailable.');
  const invitation = state.invitations[index];
  if (invitation.status !== 'pending' || new Date(invitation.expires_at).getTime() <= new Date(now).getTime()) throw new Error('This demo match is no longer open.');
  if (!['available', 'decline'].includes(response?.action)) throw new Error('Choose an available or decline response.');
  invitation.status = response.action === 'available' ? 'responded' : 'declined';
  invitation.responded_at = new Date(now).toISOString();
  if (response.action === 'available') {
    const quoteId = `demo-quote-${invitation.id}`;
    const bookingId = `demo-booking-${invitation.id}`;
    const custom = response.pricing_mode === 'custom';
    state.quotes.push({ id: quoteId, quote_low: custom ? Number(response.quote_low) : invitation.indicative_price_low, quote_high: custom ? Number(response.quote_high) : invitation.indicative_price_high });
    state.jobs.push({ id: `demo-job-${invitation.id}`, service_address: '31 Demo Lane, Ballarat Central VIC (Demo)' });
    state.bookings.push({
      id: bookingId, job_id: `demo-job-${invitation.id}`, quote_id: quoteId, provider_id: userId,
      service_key: invitation.service_key, selected_scope_ids: invitation.selected_scope_ids, state: 'accepted', scheduled_start: null,
      attending_worker_id: response.attending_worker_id || DEMO_PROVIDER_WORKER_ID,
      attending_worker_display_name: 'Alex Morgan (Demo)', version: 1,
      confirmed_service_address: '31 Demo Lane, Ballarat Central VIC (Demo)', confirmed_customer_contact: 'Sam Wilson · 0400 000 444 (Demo)',
      confirmed_access_details: 'This booking was automatically confirmed inside the demo so the next steps can be explored.', created_date: new Date(now).toISOString(),
    });
  }
  return writeStored(userId, state, storage);
}

export function transitionDemoBooking(userId, bookingId, toState, scheduledStart, now = new Date(), storage = browserStorage()) {
  const state = loadDemoProviderState(userId, now, storage);
  const booking = state.bookings.find((row) => row.id === bookingId);
  if (!booking) throw new Error('The demo booking is unavailable.');
  const expected = { accepted: 'scheduled', scheduled: 'in_progress', in_progress: 'completed' }[booking.state];
  if (expected !== toState) throw new Error('That demo booking step is not available yet.');
  if (toState === 'scheduled' && !scheduledStart) throw new Error('Choose the confirmed date and time.');
  booking.state = toState;
  if (toState === 'scheduled') booking.scheduled_start = new Date(scheduledStart).toISOString();
  if (toState === 'completed') booking.completed_at = new Date(now).toISOString();
  booking.version = Number(booking.version || 0) + 1;
  return writeStored(userId, state, storage);
}

export function sendDemoProviderMessage(userId, bookingId, body, now = new Date(), storage = browserStorage()) {
  const message = String(body || '').trim();
  if (!message) throw new Error('Write a message first.');
  const state = loadDemoProviderState(userId, now, storage);
  if (!state.bookings.some((row) => row.id === bookingId)) throw new Error('The demo booking is unavailable.');
  state.messages.push({ id: `demo-message-${Date.now()}`, booking_id: bookingId, sender: 'provider', sender_name: 'Alex Morgan (Demo)', body: message.slice(0, 1000), created_date: new Date(now).toISOString() });
  return writeStored(userId, state, storage);
}

export function recordDemoExternalPayment(userId, bookingId, amount, now = new Date(), storage = browserStorage()) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0 || value > 1000000) throw new Error('Enter a valid payment amount.');
  const state = loadDemoProviderState(userId, now, storage);
  const booking = state.bookings.find((row) => row.id === bookingId);
  if (!booking || booking.state !== 'completed') throw new Error('Only a completed demo booking can record payment.');
  if (state.payments.some((row) => row.booking_id === bookingId && row.participant_role === 'provider')) return clone(state);
  state.payments.push({
    id: `demo-payment-${bookingId}`, booking_id: bookingId, participant_role: 'provider',
    amount: value, currency: 'AUD', payment_method: 'bank_transfer', status: 'confirmed',
    paid_at: new Date(now).toISOString(), created_date: new Date(now).toISOString(),
  });
  return writeStored(userId, state, storage);
}

export function updateDemoRecurringSchedule(userId, bookingId, input = {}, now = new Date(), storage = browserStorage()) {
  const state = loadDemoProviderState(userId, now, storage);
  const booking = state.bookings.find((row) => row.id === bookingId);
  if (!booking || booking.state !== 'completed') throw new Error('Complete the demo booking before proposing recurring work.');
  const existing = state.recurringSeries.find((row) => row.source_booking_id === bookingId && row.state !== 'cancelled');
  if (existing) {
    if (existing.state !== 'proposed') throw new Error('This demo schedule is already active.');
    existing.state = 'active';
    existing.customer_confirmed_at = new Date(now).toISOString();
    existing.version += 1;
  } else {
    if (!['weekly', 'fortnightly', 'monthly'].includes(input.frequency)) throw new Error('Choose a recurrence frequency.');
    const weekday = Number(input.preferred_weekday);
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7 || !/^\d{2}:\d{2}$/.test(String(input.preferred_time || ''))) throw new Error('Choose a valid recurring day and time.');
    state.recurringSeries.push({
      id: `demo-series-${bookingId}`, source_booking_id: bookingId, state: 'proposed',
      frequency: input.frequency, preferred_weekday: weekday, preferred_time: input.preferred_time,
      proposed_by: userId, provider_confirmed_at: new Date(now).toISOString(), customer_confirmed_at: null, version: 1,
    });
  }
  return writeStored(userId, state, storage);
}
