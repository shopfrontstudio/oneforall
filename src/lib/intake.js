import { classifyServiceScope, getPhase1Service, PHASE1_POLICY_VERSION } from '../../base44/shared/phase1-catalogue.js';

export const INTAKE_STORAGE_KEY = 'oneforall.phase1.intake';
export const INTAKE_TTL_MS = 30 * 60 * 1000;
export const INTAKE_MAX_BYTES = 16 * 1024;

export function createIntakeDraft(serviceKey, now = Date.now()) {
  const service = getPhase1Service(serviceKey);
  if (!service) return null;
  return {
    version: 1,
    policy_version: PHASE1_POLICY_VERSION,
    service_key: service.key,
    pathway: service.pathway,
    scope_description: '',
    suburb: '',
    preferred_date: '',
    recurrence: 'once',
    photo_names: [],
    reported_pest: '',
    observed_signs: '',
    safety_considerations: 'none_declared',
    saved_at: now,
  };
}

const bounded = (value, max) => String(value || '').trim().slice(0, max);

export function sanitiseIntakeDraft(input) {
  const service = getPhase1Service(input?.service_key);
  if (!service) return null;
  return {
    ...createIntakeDraft(service.key, Number(input.saved_at) || Date.now()),
    scope_description: bounded(input.scope_description, 3000),
    suburb: bounded(input.suburb, 100),
    preferred_date: bounded(input.preferred_date, 20),
    recurrence: ['once', 'weekly', 'fortnightly', 'monthly'].includes(input.recurrence) ? input.recurrence : 'once',
    photo_names: Array.isArray(input.photo_names) ? input.photo_names.map((name) => bounded(name, 120)).filter(Boolean).slice(0, 8) : [],
    reported_pest: bounded(input.reported_pest, 120),
    observed_signs: bounded(input.observed_signs, 2000),
    safety_considerations: ['none_declared', 'considerations_present', 'prefer_not_to_say'].includes(input.safety_considerations) ? input.safety_considerations : 'none_declared',
    saved_at: Number(input.saved_at) || Date.now(),
  };
}

export function evaluateIntakeDraft(draft) {
  const service = getPhase1Service(draft?.service_key);
  if (!service) return { state: 'empty', errors: { service: 'Choose a service.' } };
  const scope = classifyServiceScope(service.key, draft.scope_description);
  if (scope.decision === 'blocked') return { state: 'restricted', scope, errors: { scope_description: 'This request includes work OneForAll does not offer.' } };
  const errors = {};
  if (bounded(draft.scope_description, 3000).length < 12) errors.scope_description = 'Describe what you need in at least 12 characters.';
  if (!bounded(draft.suburb, 100)) errors.suburb = 'Enter the service suburb.';
  if (service.pathway === 'scheduled_or_recurring' && !draft.preferred_date) errors.preferred_date = 'Choose a preferred date.';
  if (service.pathway === 'managed_quote' && bounded(draft.scope_description, 3000).length < 24) errors.scope_description = 'Managed quotes need a little more detail (at least 24 characters).';
  if (service.pathway === 'licensed_diagnostic') {
    if (!bounded(draft.reported_pest, 120)) errors.reported_pest = 'Tell us which pest you suspect, or choose “Not sure”.';
    if (bounded(draft.observed_signs, 2000).length < 8) errors.observed_signs = 'Briefly describe the signs you have observed.';
  }
  if (Object.keys(errors).length) return { state: 'error', scope, errors };
  if (scope.decision === 'manual_review') return { state: 'manual_review', scope, errors: {} };
  return { state: 'ready', scope, errors: {} };
}

export function saveSessionIntake(draft, storage = globalThis.sessionStorage, now = Date.now()) {
  const safe = sanitiseIntakeDraft({ ...draft, saved_at: now });
  if (!safe || !storage) return false;
  const serialized = JSON.stringify(safe);
  if (new TextEncoder().encode(serialized).length > INTAKE_MAX_BYTES) return false;
  storage.setItem(INTAKE_STORAGE_KEY, serialized);
  return true;
}

export function loadSessionIntake(serviceKey, storage = globalThis.sessionStorage, now = Date.now()) {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(INTAKE_STORAGE_KEY) || 'null');
    if (!parsed || parsed.service_key !== serviceKey || now - Number(parsed.saved_at) > INTAKE_TTL_MS) return null;
    return sanitiseIntakeDraft(parsed);
  } catch {
    return null;
  }
}

export function clearSessionIntake(storage = globalThis.sessionStorage) {
  storage?.removeItem(INTAKE_STORAGE_KEY);
}

export function nextPreviewState(previousPreviewCount) {
  return Number(previousPreviewCount) > 0 ? 'duplicate' : 'preview_complete';
}
