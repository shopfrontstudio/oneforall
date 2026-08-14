import { PHASE1_SERVICES, PHASE1_SERVICE_MAP } from '../../base44/shared/phase1-catalogue.js';

export const CATEGORY_META = Object.freeze([
  { key: 'cleaning', name: 'Cleaning', summary: 'Routine domestic cleaning and reviewed deep-clean requests.' },
  { key: 'gardening', name: 'Gardening & Outdoor', summary: 'Ground-level garden maintenance and carefully scoped pruning.' },
  { key: 'beauty', name: 'Beauty', summary: 'Adults-only, low-risk mobile hair, makeup and nail services.' },
  { key: 'handyman', name: 'Handyman & General Maintenance', summary: 'Managed quotes for minor, non-licensed household tasks.' },
  { key: 'electrical', name: 'Electrical', summary: 'Managed requests for appropriately licensed electrical providers.' },
  { key: 'plumbing', name: 'Plumbing', summary: 'Managed plumbing requests matched to verified licence scope.' },
  { key: 'carpentry', name: 'Carpentry', summary: 'Scoped household carpentry, repairs and installations.' },
  { key: 'building-renovation', name: 'Building & Renovation', summary: 'Reviewed renovation and building requests with permit and registration checks.' },
  { key: 'painting', name: 'Painting', summary: 'Interior and suitable exterior painting through a managed quote.' },
  { key: 'rubbish-removal', name: 'Rubbish Removal', summary: 'Managed removal with lawful disposal requirements.' },
  { key: 'pest-control', name: 'Pest Control', summary: 'Licensed diagnostic assessment before any managed treatment.' },
  { key: 'not-sure', name: 'Not sure what I need?', summary: 'A guided request for customers who need help choosing the right service.' },
]);

export const CATEGORY_META_MAP = Object.freeze(Object.fromEntries(CATEGORY_META.map((item) => [item.key, item])));

export const PATHWAY_LABELS = Object.freeze({
  scheduled_or_recurring: 'Request a scheduled or recurring service',
  managed_quote: 'Request a managed quote',
  licensed_diagnostic: 'Arrange a licensed assessment',
});

export function groupedServices() {
  return CATEGORY_META.map((category) => ({ ...category, services: PHASE1_SERVICES.filter((service) => service.category === category.key) }));
}

export function serviceAvailability(service) {
  return service?.flags.public_release_enabled && service.flags.publicly_visible && service.flags.request_enabled ? 'available' : 'not_accepting_requests';
}

export function serviceAvailabilityMessage(service) {
  if (!service?.flags.publicly_visible) return 'This service is visible for planning only.';
  if (!service.flags.public_release_enabled) return 'This service has not passed its public release gate.';
  if (!service.flags.request_enabled) return 'Requests for this service are temporarily unavailable.';
  return 'Accepting requests.';
}

export { PHASE1_SERVICES, PHASE1_SERVICE_MAP };
