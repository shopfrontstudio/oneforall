// datetime-local contains no timezone. Provider schedules always use Ballarat,
// even when the browser is travelling or configured for a different timezone.
export function melbourneInputToISO(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || '')) throw new Error('Choose a valid Ballarat date and time.');
  const [year, month, day, hour, minute] = value.split(/[-T:]/).map(Number);
  const wallTime = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const matches = [10, 11].map((offset) => new Date(wallTime - offset * 60 * 60 * 1000)).filter((candidate) => {
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` === value;
  });
  if (matches.length !== 1) throw new Error('This time is skipped or repeated when daylight saving changes. Please choose another time.');
  return matches[0].toISOString();
}

export function validateAvailabilityWindow(start, end, now = Date.now()) {
  const startsAt = melbourneInputToISO(start);
  const endsAt = melbourneInputToISO(end);
  const duration = Date.parse(endsAt) - Date.parse(startsAt);
  if (Date.parse(startsAt) <= now) throw new Error('Choose a future availability window.');
  if (duration < 15 * 60 * 1000 || duration > 12 * 60 * 60 * 1000) throw new Error('Availability must last between 15 minutes and 12 hours.');
  return { starts_at: startsAt, ends_at: endsAt };
}
