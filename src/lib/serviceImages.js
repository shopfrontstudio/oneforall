const photo = (primary, primaryPosition, secondary = null, secondaryPosition = '50% 50%') => Object.freeze({
  primary,
  primaryPosition,
  secondary,
  secondaryPosition,
});

// Home-only category photography. Gardening and the guided pathway retain
// their simple catalogue symbols so the image set follows the approved brief.
export const HOME_SERVICE_IMAGES = Object.freeze({
  cleaning: photo('cleaning.jpg', '24% 66%', 'cleaning-broom.jpg', '58% 70%'),
  beauty: photo('beauty.jpg', '62% 50%'),
  handyman: photo('handyman.jpg', '55% 50%'),
  electrical: photo('electrical.jpg', '67% 50%'),
  plumbing: photo('plumbing.jpg', '59% 52%', 'plumbing-wrench.jpg', '18% 34%'),
  carpentry: photo('carpentry.jpg', '48% 52%'),
  'building-renovation': photo('building-renovation.jpg', '43% 50%'),
  painting: photo('painting.jpg', '50% 15%'),
  'rubbish-removal': photo('rubbish-removal.jpg', '50% 43%'),
  'pest-control': photo('pest-control.jpg', '26% 50%'),
  'moving-packing': photo('moving-packing.jpg', '50% 63%'),
});
