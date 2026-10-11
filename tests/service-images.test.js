import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { HOME_SERVICE_IMAGES, scopeImage, serviceImage } from '../src/lib/serviceImages.js';
import { PHASE1_SERVICES } from '../src/domain/catalogue.js';

const expectedPhotoCategories = [
  'beauty',
  'building-renovation',
  'carpentry',
  'cleaning',
  'electrical',
  'gardening',
  'handyman',
  'moving-packing',
  'painting',
  'pest-control',
  'plumbing',
  'rubbish-removal',
];

test('home service photography covers the approved categories only', () => {
  assert.deepEqual(Object.keys(HOME_SERVICE_IMAGES).sort(), expectedPhotoCategories);
  assert.equal(HOME_SERVICE_IMAGES['not-sure'], undefined);
});

test('home service photography is local, present and non-empty', () => {
  const filenames = Object.values(HOME_SERVICE_IMAGES).flatMap((media) => [media.primary, media.secondary].filter(Boolean));
  for (const filename of new Set(filenames)) {
    assert.match(filename, /^[a-z0-9-]+\.jpg$/);
    const path = fileURLToPath(new URL(`../public/service-images/${filename}`, import.meta.url));
    assert.equal(existsSync(path), true, `${filename} should exist`);
    assert.ok(statSync(path).size > 4_096, `${filename} should contain a real image`);
  }
});

test('every catalogue service and scope resolves to present photography', () => {
  const files = new Set();
  for (const service of PHASE1_SERVICES) {
    const serviceMedia = serviceImage(service);
    assert.ok(serviceMedia, `${service.key} should have a service image`);
    files.add(serviceMedia.primary);
    for (const scope of service.scope_options) {
      const scopeMedia = scopeImage(service, scope.id);
      assert.ok(scopeMedia, `${service.key}:${scope.id} should have a scope image`);
      files.add(scopeMedia.primary);
    }
  }
  for (const filename of files) {
    const path = fileURLToPath(new URL(`../public/service-images/${filename}`, import.meta.url));
    assert.equal(existsSync(path), true, `${filename} should exist`);
    assert.ok(statSync(path).size > 4_096, `${filename} should contain a real image`);
  }
});

test('regulated and low-risk pathways use accurate bounded imagery', () => {
  const byKey = Object.fromEntries(PHASE1_SERVICES.map((service) => [service.key, service]));
  assert.equal(serviceImage(byKey['pest-control.diagnostic']).primary, 'pest-diagnostic.jpg');
  assert.equal(serviceImage(byKey['pest-control.pesticide_treatment']).primary, 'pest-control.jpg');
  assert.equal(serviceImage(byKey['building-renovation.managed_quote']).primary, 'building-consultation.jpg');
  assert.equal(serviceImage(byKey['electrical.licensed_services']).primary, 'electrical-inspection.jpg');
  assert.equal(scopeImage(byKey['beauty.adult_low_risk'], 'makeup-strip-lashes').primary, 'beauty-makeup.jpg');
  assert.equal(scopeImage(byKey['beauty.adult_low_risk'], 'basic-nails-polish').primary, 'beauty-nails.jpg');
});
