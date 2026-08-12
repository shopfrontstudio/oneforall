import { getPhase1Service, PHASE1_SERVICES } from './phase1-catalogue.js';
import { normaliseISODate, operatingDateKey } from './guards.js';

const dayStamp = (value) => {
  const dateOnly = normaliseISODate(value);
  return dateOnly || operatingDateKey(value);
};

export function isPublicAssertionCurrent(assertion, now = new Date()) {
  if (!assertion) return false;
  if (!normaliseISODate(assertion.valid_through)) return false;
  const today = dayStamp(now);
  const validThrough = dayStamp(assertion.valid_through);
  return Boolean(today && validThrough && validThrough >= today);
}

export function publicAssertionForService(assertion, serviceKey, now = new Date()) {
  if (!isPublicAssertionCurrent(assertion, now)) return null;
  if (serviceKey && !(assertion.approved_service_ids || []).includes(serviceKey)) return null;
  return assertion;
}

export function latestPublicAssertionForService(assertions = [], serviceKey, now = new Date()) {
  return [...assertions]
    .filter((assertion) => publicAssertionForService(assertion, serviceKey, now))
    .sort((a, b) => String(b.evidence_checked_date || '').localeCompare(String(a.evidence_checked_date || '')) || String(b.id || '').localeCompare(String(a.id || '')))[0] || null;
}

export function latestPublicAssertionForServicePeriod(assertions = [], serviceKey, throughDate, now = new Date()) {
  const currentCandidates = assertions.filter((assertion) => publicAssertionForService(assertion, serviceKey, now));
  return latestPublicAssertionForService(currentCandidates, serviceKey, throughDate || now);
}

export function providerAssertionLabels(assertion, serviceKey) {
  const serviceLabels = (assertion?.approved_service_ids || [])
    .map((key) => getPhase1Service(key)?.name)
    .filter(Boolean);
  const relevantServices = serviceKey
    ? [getPhase1Service(serviceKey)].filter(Boolean)
    : PHASE1_SERVICES.filter((service) => (assertion?.approved_service_ids || []).includes(service.key));
  const scopeLabelsById = new Map(relevantServices.flatMap((service) => service.scope_options.map((scope) => [scope.id, scope.label])));
  const credentialScopeLabels = [...new Set((assertion?.credential_scope || []).flatMap((scopeId) => {
    if (scopeId === '*') return relevantServices.length === 1 ? [`All configured scopes for ${relevantServices[0].name}`] : ['All configured approved scopes'];
    const service = getPhase1Service(scopeId);
    if (service) return [service.name];
    const scope = scopeLabelsById.get(scopeId);
    return scope ? [scope] : [];
  }))];
  return { serviceLabels, credentialScopeLabels };
}
