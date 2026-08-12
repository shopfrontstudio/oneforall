// Shared validation used by the write-path functions.
//
// The rule these all serve: never trust an id, name or entitlement that arrived in
// the request body. Resolve the caller from their session, then read the related
// records with the service role and derive everything else from those.

// Resolves the caller from the request's auth context, or null if unauthenticated.
export async function currentUser(base44) {
  try {
    const user = await base44.auth.me();
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

// The name we are willing to attach to records the caller authors.
export function displayName(user) {
  return user.full_name || user.email;
}

// Quote ranges arrive as strings from number inputs.
export function parseQuote({ quote_low, quote_high, earliest_availability }) {
  const low = Number(quote_low);
  const high = Number(quote_high);
  if (!Number.isFinite(low) || low <= 0) return { error: 'Enter a valid lower quote.' };
  if (!Number.isFinite(high) || high < low) return { error: 'The upper quote must be at least the lower quote.' };
  if (!earliest_availability) return { error: 'Add an availability date.' };
  const availability = normaliseISODate(earliest_availability);
  if (!availability) return { error: 'Choose a valid availability date.' };
  return { low, high, availability };
}

const DIRECT_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const DIRECT_PHONE = /(?:\+?61[\s().-]*|\b0)[23478](?:[\s().-]*\d){8}\b/;
const DIRECT_URL = /(?:https?:\/\/|www\.)\S+|\b(?:[a-z0-9-]+\.)+(?:com|net|org|au|co|io|app|biz|info)\b/i;

// Quote text is customer-visible before contact unlock. Reject rather than
// silently truncate contact details so providers know what must be removed.
export function validateLockedQuoteMessage(value, maxLength = 1000) {
  if (value === undefined || value === null || value === '') return { message: '' };
  if (typeof value !== 'string') return { error: 'Enter a valid quote message.' };
  const message = value.trim();
  if (message.length > maxLength) return { error: `Keep the quote message under ${maxLength} characters.` };
  if (DIRECT_EMAIL.test(message) || DIRECT_PHONE.test(message) || DIRECT_URL.test(message)) {
    return { error: 'Contact details and links stay locked until the booking is confirmed.' };
  }
  return { message };
}

// Free-text that ends up stored and shown to another person.
export function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function normaliseISODate(value) {
  const candidate = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate ? candidate : null;
}

export function normaliseISODateTime(value) {
  const candidate = String(value || '').trim();
  // Require an explicit timezone so the backend never guesses what a local
  // wall-clock value means for a Ballarat booking.
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(candidate)) return null;
  const parsed = new Date(candidate);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function normaliseFutureDateTime(value, now = new Date()) {
  const scheduledStart = normaliseISODateTime(value);
  const reference = new Date(now);
  if (!scheduledStart || !Number.isFinite(reference.getTime()) || new Date(scheduledStart).getTime() <= reference.getTime()) return null;
  return scheduledStart;
}

export function bookingTransitionEligibilityInstant({ booking, toState, scheduledStart, now = new Date() }) {
  if (toState === 'scheduled') {
    const serviceDate = normaliseISODateTime(scheduledStart);
    return serviceDate ? { serviceDate } : { error: 'confirmed_schedule_missing' };
  }
  if (toState === 'in_progress') {
    // An interrupted historic scheduling retry may carry the immutable schedule
    // intent before the Booking row was repaired; otherwise the Booking value is
    // the canonical source.
    const confirmedStart = normaliseISODateTime(booking?.scheduled_start || scheduledStart);
    const current = new Date(now);
    if (!confirmedStart) return { error: 'confirmed_schedule_missing' };
    if (!Number.isFinite(current.getTime())) return { error: 'current_time_invalid' };
    if (new Date(confirmedStart).getTime() > current.getTime()) return { error: 'scheduled_start_not_reached' };
    return { serviceDate: current.toISOString() };
  }
  return { error: 'eligibility_date_missing' };
}

const MELBOURNE_TIME_ZONE = 'Australia/Melbourne';
const MELBOURNE_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: MELBOURNE_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const melbourneWallClock = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(MELBOURNE_PARTS.formatToParts(date).map((part) => [part.type, part.value]));
  return parts.year && parts.month && parts.day && parts.hour && parts.minute
    ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
    : null;
};

// A datetime-local control has no timezone. Interpret its exact wall-clock value
// as Ballarat time, independent of the provider device timezone. Testing every
// plausible Australian UTC offset and requiring exactly one round-trip match
// rejects DST gaps and duplicated/ambiguous local instants.
export function melbourneLocalDateTimeToISO(value) {
  const wallClock = String(value || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(wallClock);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const nominalUTC = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (!Number.isFinite(nominalUTC)) return null;
  const candidates = [10, 11]
    .map((offsetHours) => new Date(nominalUTC - offsetHours * 3600000))
    .filter((candidate) => melbourneWallClock(candidate) === wallClock);
  return candidates.length === 1 ? candidates[0].toISOString() : null;
}

export function melbourneDateTimeLocalValue(value = new Date()) {
  return melbourneWallClock(value) || '';
}

export function latestServiceDate(...values) {
  return values.map(normaliseISODate).filter(Boolean).sort().at(-1) || null;
}

export const operatingDateKey = (value) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return byType.year && byType.month && byType.day ? `${byType.year}-${byType.month}-${byType.day}` : null;
};

export function serviceDateHasPassed(serviceDate, now = new Date()) {
  const requestedDay = normaliseISODate(serviceDate);
  const currentDay = operatingDateKey(now);
  return !requestedDay || !currentDay || requestedDay < currentDay;
}

export function serviceDateIsFuture(serviceDate, now = new Date()) {
  const requestedDay = normaliseISODate(serviceDate);
  const currentDay = operatingDateKey(now);
  return Boolean(requestedDay && currentDay && requestedDay > currentDay);
}
