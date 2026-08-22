import { classifyServiceScope, collectAdditionalRiskText, getPhase1Service, PHASE1_POLICY_VERSION } from '../domain/catalogue.js';

export const INTAKE_STORAGE_KEY = 'oneforall.phase1.intake';
export const INTAKE_TTL_MS = 30 * 60 * 1000;
export const INTAKE_MAX_BYTES = 16 * 1024;

const bounded = (value, max) => String(value || '').trim().slice(0, max);
const createIdempotencyKey = (now = Date.now()) => globalThis.crypto?.randomUUID?.()
  || `request-${now}-${Math.random().toString(36).slice(2)}`;

export function createIntakeDraft(serviceKey, now = Date.now()) {
  const service = getPhase1Service(serviceKey);
  if (!service) return null;
  return {
    version: 2,
    idempotency_key: createIdempotencyKey(now),
    policy_version: PHASE1_POLICY_VERSION,
    service_key: service.key,
    pathway: service.pathway,
    selected_scope_ids: [],
    adult_scope_confirmed: false,
    scope_description: '',
    suburb: '',
    preferred_date: '',
    recurrence: 'once',
    urgency: 'flexible',
    photo_names: [],
    reported_pest: '',
    observed_signs: '',
    safety_considerations: 'none_declared',
    painting_property_era: '',
    painting_surface_hazard: '',
    painting_access_height: '',
    saved_at: now,
  };
}

export function createIntakeDraftFromGuide(serviceKey, handoff, now = Date.now()) {
  const draft = createIntakeDraft(serviceKey, now);
  if (!draft || handoff?.service_key !== serviceKey) return draft;
  const service = getPhase1Service(serviceKey);
  const validScopeIds = new Set(service.scope_options.map((item) => item.id));
  return {
    ...draft,
    selected_scope_ids: Array.isArray(handoff.scope_ids) ? [...new Set(handoff.scope_ids.filter((id) => validScopeIds.has(id)))] : [],
    scope_description: bounded(handoff.problem, 3000),
  };
}

export function sanitiseIntakeDraft(input) {
  const service = getPhase1Service(input?.service_key);
  if (!service) return null;
  const validScopeIds = new Set(service.scope_options.map((item) => item.id));
  return {
    ...createIntakeDraft(service.key, Number(input.saved_at) || Date.now()),
    idempotency_key: bounded(input.idempotency_key, 120).length >= 8
      ? bounded(input.idempotency_key, 120)
      : createIdempotencyKey(Number(input.saved_at) || Date.now()),
    selected_scope_ids: Array.isArray(input.selected_scope_ids) ? [...new Set(input.selected_scope_ids.filter((id) => validScopeIds.has(id)))] : [],
    adult_scope_confirmed: input.adult_scope_confirmed === true,
    scope_description: bounded(input.scope_description, 3000),
    suburb: bounded(input.suburb, 100),
    preferred_date: bounded(input.preferred_date, 20),
    recurrence: ['once', 'weekly', 'fortnightly', 'monthly'].includes(input.recurrence) ? input.recurrence : 'once',
    urgency: ['flexible', 'this_week', 'urgent'].includes(input.urgency) ? input.urgency : 'flexible',
    photo_names: Array.isArray(input.photo_names) ? input.photo_names.map((name) => bounded(name, 120)).filter(Boolean).slice(0, 8) : [],
    reported_pest: bounded(input.reported_pest, 120),
    observed_signs: bounded(input.observed_signs, 2000),
    safety_considerations: ['none_declared', 'considerations_present', 'prefer_not_to_say'].includes(input.safety_considerations) ? input.safety_considerations : 'none_declared',
    painting_property_era: ['pre_1970', '1970_or_later', 'unknown'].includes(input.painting_property_era) ? input.painting_property_era : '',
    painting_surface_hazard: ['none_known', 'lead_or_asbestos', 'unsure'].includes(input.painting_surface_hazard) ? input.painting_surface_hazard : '',
    painting_access_height: ['ground_level', 'ladder_or_height', 'roof'].includes(input.painting_access_height) ? input.painting_access_height : '',
    saved_at: Number(input.saved_at) || Date.now(),
  };
}

export function evaluateIntakeDraft(draft) {
  const service = getPhase1Service(draft?.service_key);
  if (!service) return { state: 'empty', errors: { service: 'Choose a service.' } };
  const errors = {};
  if (!Array.isArray(draft.selected_scope_ids) || !draft.selected_scope_ids.length) errors.selected_scope_ids = 'Choose at least one listed service option.';
  if (service.adults_only && draft.adult_scope_confirmed !== true) errors.adult_scope_confirmed = 'Confirm the person receiving this service is an adult.';
  const scope = classifyServiceScope(service.key, {
    selectedScopeIds: draft.selected_scope_ids,
    scopeNotes: draft.scope_description,
    additionalRiskText: collectAdditionalRiskText(draft),
    adultConfirmed: draft.adult_scope_confirmed,
  });
  if (scope.decision === 'blocked') return { state: 'restricted', scope, errors: { ...errors, scope_description: 'This request includes work OneForAll does not offer.' } };
  if (!bounded(draft.suburb, 100)) errors.suburb = 'Enter the service suburb.';
  if (service.pathway === 'scheduled_or_recurring' && !draft.preferred_date) errors.preferred_date = 'Choose a preferred date.';
  if (service.pathway === 'licensed_diagnostic') {
    if (!bounded(draft.reported_pest, 120)) errors.reported_pest = 'Tell us which pest you suspect, or choose “Not sure”.';
    if (bounded(draft.observed_signs, 2000).length < 8) errors.observed_signs = 'Briefly describe the signs you have observed.';
  }
  if (service.key === 'general.guided_request' && bounded(draft.scope_description, 3000).length < 8) {
    errors.scope_description = 'Briefly describe the help you need so operations can triage it privately.';
  }
  if (service.key === 'painting.residential') {
    if (!draft.painting_property_era) errors.painting_property_era = 'Choose the property or coating age.';
    if (!draft.painting_surface_hazard) errors.painting_surface_hazard = 'Choose the known surface-hazard status.';
    if (!draft.painting_access_height) errors.painting_access_height = 'Choose the access height.';
  }
  if (Object.keys(errors).length) return { state: 'error', scope, errors };
  if (service.key === 'painting.residential') {
    if (draft.painting_surface_hazard === 'lead_or_asbestos' || draft.painting_access_height === 'roof') {
      return { state: 'restricted', scope: { ...scope, decision: 'blocked', reason: 'painting_hazard_blocked' }, errors: { scope_description: 'Lead, asbestos and roof work are not offered through this pathway.' } };
    }
    if (['pre_1970','unknown'].includes(draft.painting_property_era)
      || draft.painting_surface_hazard === 'unsure'
      || draft.painting_access_height === 'ladder_or_height') {
      return { state: 'manual_review', scope: { ...scope, decision: 'manual_review', reason: 'painting_hazard_review' }, errors: {} };
    }
  }
  if (scope.decision === 'manual_review') return { state: 'manual_review', scope, errors: {} };
  return { state: 'ready', scope, errors: {} };
}

export function saveSessionIntake(draft, storage = globalThis.sessionStorage, now = Date.now()) {
  const safe = sanitiseIntakeDraft({ ...draft, saved_at: now });
  if (!safe || !storage) return false;
  const serialized = JSON.stringify(safe);
  if (new TextEncoder().encode(serialized).length > INTAKE_MAX_BYTES) return false;
  try {
    storage.setItem(INTAKE_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
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
  try { storage?.removeItem(INTAKE_STORAGE_KEY); } catch { /* In-memory form remains usable. */ }
}

export function nextPreviewState(previousPreviewCount) {
  return Number(previousPreviewCount) > 0 ? 'duplicate' : 'preview_complete';
}
