export function melbourneDate(value = new Date()) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function displayDate(value) {
  if (!value) return 'Not set';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+10:00` : value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', dateStyle: 'medium' }).format(date) : 'Not set';
}

export function activeAssertions(assertions = [], serviceKey, now = new Date()) {
  const today = melbourneDate(now);
  return assertions.filter((row) => row.status === 'active' && !row.superseded_by_assertion_id
    && row.evidence_checked_date <= today && row.valid_through >= today
    && Array.isArray(row.approved_service_ids) && row.approved_service_ids.includes(serviceKey));
}

// Compare only actionable revisions. Never treat a rejected/expired quote as the cheapest offer.
export function comparableQuotes(quotes = [], now = new Date()) {
  const timestamp = new Date(now).getTime();
  const latest = new Map();
  quotes.filter((row) => row.status === 'pending' && !row.superseded_by_quote_id
    && (!row.response_deadline || new Date(row.response_deadline).getTime() > timestamp))
    .forEach((row) => {
      const key = row.tradie_id || row.provider_id || row.id;
      const previous = latest.get(key);
      if (!previous || Number(row.revision_number || 1) > Number(previous.revision_number || 1)
        || (Number(row.revision_number || 1) === Number(previous.revision_number || 1) && String(row.created_date) > String(previous.created_date))) latest.set(key, row);
    });
  return [...latest.values()].sort((a, b) => String(a.created_date || '').localeCompare(String(b.created_date || '')));
}

export function journeySteps(job, booking) {
  const steps = [
    { key: 'received', label: 'Request received', detail: 'Your details are saved.' },
    { key: 'accepted', label: 'Quote approved', detail: 'You have approved a provider and price.' },
    { key: 'scheduled', label: 'Time confirmed', detail: 'Your appointment is scheduled.' },
    { key: 'in_progress', label: 'Work started', detail: 'The provider has recorded starting work.' },
    { key: 'completed', label: 'Work completed', detail: 'The provider has recorded completion.' },
  ];
  const state = booking?.state;
  const special = ['cancelled', 'disputed', 'superseded'].includes(state) || job?.status === 'cancelled';
  const current = state ? steps.findIndex((step) => step.key === state) : job?.status && job.status !== 'draft' ? 0 : -1;
  return { steps, current, special, status: special ? (state || job.status).replaceAll('_', ' ') : steps[current]?.label || 'Draft request' };
}

export function validateAnnotation(point) {
  return point && Number.isFinite(point.x) && point.x >= 0 && point.x <= 1
    && Number.isFinite(point.y) && point.y >= 0 && point.y <= 1
    && typeof point.note === 'string' && point.note.trim().length > 0 && point.note.length <= 300;
}

export function reminderIsDue(reminder, now = new Date()) {
  return Boolean(reminder.enabled && /^\d{4}-\d{2}-\d{2}$/.test(reminder.due_date || '') && reminder.due_date <= melbourneDate(now));
}

export function estimatePrice(guide, quantity, now = new Date()) {
  const units = Number(quantity);
  if (!guide || !/^\d{4}-\d{2}-\d{2}$/.test(guide.valid_through || '') || guide.valid_through < melbourneDate(now) || !Number.isFinite(units) || units <= 0 || units > 10000) return null;
  const low = Number(guide.low_per_unit), high = Number(guide.high_per_unit), callout = Number(guide.callout);
  if (![low, high, callout].every(Number.isFinite) || low <= 0 || high < low || callout < 0) return null;
  return { low: Math.round((units * low + callout) * 100) / 100, high: Math.round((units * high + callout) * 100) / 100 };
}

export function contextualHelp(pathname) {
  if (pathname.startsWith('/request/')) return { title: 'What should I include?', text: 'Choose the work you need, add a short description and optional photos. Keep contact details out of the description. Your preferred date is a request, not a confirmed appointment.' };
  if (pathname.startsWith('/booking/')) return { title: 'How does my booking work?', text: 'Review the provider’s quote before approving. A confirmed booking unlocks the agreed contact details. Changes to price or work need your approval. Payments are arranged directly with the provider.' };
  if (pathname.startsWith('/my-home')) return { title: 'Your home, your information', text: 'Save only details you want to reuse. Reminders use the dates you choose—not an inspection or safety assessment. You can edit or remove them at any time.' };
  if (pathname.startsWith('/service-list')) return { title: 'Several jobs, one list', text: 'Your list keeps tasks together. Each service still needs its own scope review, provider and confirmed quote; adding a task does not book or charge you.' };
  return { title: 'Need a hand choosing?', text: 'Choose a service photo or describe what needs doing. Guided questions help narrow the options. Photos are reviewed by people, not analysed by AI.' };
}
