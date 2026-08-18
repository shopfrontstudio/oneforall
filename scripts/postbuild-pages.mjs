// GitHub Pages has no rewrite support, so:
// 1. 404.html serves the SPA for any unknown deep link (e.g. /job/123).
// 2. Key public routes are pre-created as real files so they return HTTP 200 —
//    Play Store reviewers fetch /privacy, and password-reset emails link to
//    /reset-password; neither should see a 404 status.
import { copyFileSync, mkdirSync } from 'node:fs';
import { PHASE1_SERVICES } from '../src/domain/catalogue.js';

const DIST = new URL('../dist/', import.meta.url);
const index = new URL('index.html', DIST);

copyFileSync(index, new URL('404.html', DIST));

const fixedRoutes = [
  'services', 'post-job', 'privacy', 'login', 'register', 'forgot-password',
  'reset-password', 'onboarding', 'bookings', 'messages', 'account', 'my-jobs',
  'profile', 'provider/today', 'provider/requests', 'provider/jobs',
  'provider/calendar', 'provider/more',
];
const catalogueRoutes = PHASE1_SERVICES.flatMap(({ key }) => [
  `services/${key}`,
  `request/${key}`,
]);

for (const route of [...fixedRoutes, ...catalogueRoutes]) {
  const dir = new URL(`${route}/`, DIST);
  mkdirSync(dir, { recursive: true });
  copyFileSync(index, new URL('index.html', dir));
}

console.log(`Pages postbuild: 404.html + ${fixedRoutes.length + catalogueRoutes.length} route copies created`);
