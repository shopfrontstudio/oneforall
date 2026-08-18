import { getPhase1Service, PHASE1_SERVICES } from './catalogue.js';

const isoDate = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
};

export function isPublicAssertionCurrent(assertion, now = new Date()) {
  if (!assertion || (assertion.status && assertion.status !== 'active') || assertion.superseded_by_assertion_id) return false;
  const validThrough = isoDate(assertion.valid_through);
  const today = isoDate(now);
  return Boolean(validThrough && today && validThrough >= today);
}

export function publicAssertionForService(assertion, serviceKey, now = new Date(), serviceDefinition = null) {
  const service = serviceDefinition || getPhase1Service(serviceKey);
  if (!serviceKey || !service || service.key !== serviceKey || !service.flags.publicly_visible || !service.flags.public_release_enabled) return null;
  if (!isPublicAssertionCurrent(assertion, now) || !(assertion.approved_service_ids || []).includes(serviceKey)) return null;
  return assertion;
}

export function latestPublicAssertionForService(assertions = [], serviceKey, now = new Date(), serviceDefinition = null) {
  return [...assertions]
    .filter((assertion) => publicAssertionForService(assertion, serviceKey, now, serviceDefinition))
    .sort((a, b) => String(b.evidence_checked_date || '').localeCompare(String(a.evidence_checked_date || '')) || String(b.id || '').localeCompare(String(a.id || '')))[0] || null;
}

export function latestPublicAssertionForServicePeriod(assertions = [], serviceKey, throughDate, now = new Date(), serviceDefinition = null) {
  return latestPublicAssertionForService(
    assertions.filter((assertion) => publicAssertionForService(assertion, serviceKey, now, serviceDefinition)),
    serviceKey,
    throughDate || now,
    serviceDefinition,
  );
}

export function providerAssertionLabels(assertion, serviceKey) {
  const serviceLabels = (assertion?.approved_service_ids || []).map((key) => getPhase1Service(key)?.name).filter(Boolean);
  const relevant = serviceKey ? [getPhase1Service(serviceKey)].filter(Boolean) : PHASE1_SERVICES.filter((service) => (assertion?.approved_service_ids || []).includes(service.key));
  const scopeLabels = new Map(relevant.flatMap((service) => service.scope_options.map((scope) => [scope.id, scope.label])));
  const credentialScopeLabels = [...new Set((assertion?.credential_scope || []).flatMap((scopeId) => {
    if (scopeId === '*') return relevant.length === 1 ? [`All configured scopes for ${relevant[0].name}`] : ['All configured approved scopes'];
    return [getPhase1Service(scopeId)?.name || scopeLabels.get(scopeId)].filter(Boolean);
  }))];
  return { serviceLabels, credentialScopeLabels };
}
