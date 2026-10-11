const photo = (primary, primaryPosition, secondary = null, secondaryPosition = '50% 50%') => Object.freeze({
  primary,
  primaryPosition,
  secondary,
  secondaryPosition,
});

// Home-only category photography. The guided pathway retains its simple
// catalogue symbol so it remains visually distinct from bookable categories.
export const HOME_SERVICE_IMAGES = Object.freeze({
  cleaning: photo('cleaning.jpg', '24% 66%', 'cleaning-broom.jpg', '58% 70%'),
  gardening: photo('gardening.jpg', '50% 52%'),
  beauty: photo('beauty-styling.jpg', '50% 48%'),
  handyman: photo('handyman.jpg', '55% 50%'),
  electrical: photo('electrical-inspection.jpg', '50% 42%'),
  plumbing: photo('plumbing.jpg', '59% 52%', 'plumbing-wrench.jpg', '18% 34%'),
  carpentry: photo('carpentry.jpg', '48% 52%'),
  'building-renovation': photo('building-consultation.jpg', '50% 48%'),
  painting: photo('painting.jpg', '50% 15%'),
  'rubbish-removal': photo('rubbish-removal.jpg', '50% 43%'),
  'pest-control': photo('pest-diagnostic.jpg', '50% 48%'),
  'moving-packing': photo('moving-packing.jpg', '50% 63%'),
});

const SERVICE_IMAGE_OVERRIDES = Object.freeze({
  'general.guided_request': photo('building-consultation.jpg', '50% 48%'),
  'pest-control.pesticide_treatment': photo('pest-control.jpg', '26% 50%'),
});

const SCOPE_IMAGE_OVERRIDES = Object.freeze({
  'beauty.adult_low_risk:dry-hair-styling': photo('beauty-styling.jpg', '50% 48%'),
  'beauty.adult_low_risk:makeup-strip-lashes': photo('beauty-makeup.jpg', '50% 42%'),
  'beauty.adult_low_risk:basic-nails-polish': photo('beauty-nails.jpg', '50% 50%'),
  'cleaning.routine_domestic:kitchen-bathroom': photo('cleaning-broom.jpg', '58% 70%'),
  'handyman.minor_tasks:flat-pack': photo('carpentry.jpg', '48% 52%'),
  'handyman.minor_tasks:minor-furniture': photo('carpentry.jpg', '48% 52%'),
  'plumbing.licensed_services:tap-toilet-repair': photo('plumbing-wrench.jpg', '18% 34%'),
  'pest-control.pesticide_treatment:post-diagnostic-treatment': photo('pest-control.jpg', '26% 50%'),
});

export function serviceImage(service) {
  if (!service) return null;
  return SERVICE_IMAGE_OVERRIDES[service.key] || HOME_SERVICE_IMAGES[service.category] || null;
}

export function scopeImage(service, scopeId) {
  if (!service || !scopeId) return serviceImage(service);
  return SCOPE_IMAGE_OVERRIDES[`${service.key}:${scopeId}`] || serviceImage(service);
}

export function serviceImageUrl(media, baseUrl = '/') {
  if (!media?.primary) return '';
  const root = String(baseUrl || '/').endsWith('/') ? String(baseUrl || '/') : `${baseUrl}/`;
  return `${root}service-images/${media.primary}`;
}
