export const PUBLIC_PATHS = Object.freeze({
  home: '/',
  services: '/services',
  service: (serviceKey) => `/services/${encodeURIComponent(serviceKey)}`,
  intake: (serviceKey) => `/request/${encodeURIComponent(serviceKey)}`,
});

export const CUSTOMER_PATHS = Object.freeze({
  bookings: '/bookings',
  messages: '/messages',
  account: '/account',
});

export function isPublicPath(pathname) {
  return pathname === '/' || pathname === '/services' || pathname.startsWith('/services/') || pathname.startsWith('/request/') || ['/login', '/register', '/forgot-password', '/reset-password'].includes(pathname);
}

export const LEGACY_REDIRECTS = Object.freeze({
  '/post-job': '/services',
  '/my-jobs': '/bookings',
  '/profile': '/account',
  '/discover': '/provider/discover',
  '/invites': '/provider/invites',
  '/tradie-profile': '/provider/account',
});
