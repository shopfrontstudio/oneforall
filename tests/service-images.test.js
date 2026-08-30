import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { HOME_SERVICE_IMAGES } from '../src/lib/serviceImages.js';

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
  assert.equal(new Set(filenames).size, filenames.length);

  for (const filename of filenames) {
    assert.match(filename, /^[a-z0-9-]+\.jpg$/);
    const path = fileURLToPath(new URL(`../public/service-images/${filename}`, import.meta.url));
    assert.equal(existsSync(path), true, `${filename} should exist`);
    assert.ok(statSync(path).size > 4_096, `${filename} should contain a real image`);
  }
});
