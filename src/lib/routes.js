export const PUBLIC_PATHS = Object.freeze({
  home: '/',
  services: '/services',
  category: (categoryKey) => `/services/category/${encodeURIComponent(categoryKey)}`,
  service: (serviceKey) => `/services/${encodeURIComponent(serviceKey)}`,
  intake: (serviceKey) => `/request/${encodeURIComponent(serviceKey)}`,
  serviceGuideResults: '/service-guide/results',
});

export const CUSTOMER_PATHS = Object.freeze({
  bookings: '/bookings',
  messages: '/messages',
  account: '/account',
});

export function isPublicPath(pathname) {
  return pathname === '/' || pathname === '/services' || pathname.startsWith('/services/') || pathname.startsWith('/request/') || pathname.startsWith('/service-guide/') || ['/login', '/register', '/forgot-password', '/reset-password'].includes(pathname);
}

export const LEGACY_REDIRECTS = Object.freeze({
  '/post-job': '/services',
  '/my-jobs': '/bookings',
  '/profile': '/account',
  '/discover': '/provider/requests',
  '/invites': '/provider/jobs',
  '/tradie-profile': '/provider/more',
});

export const PROVIDER_PATHS = Object.freeze({
  today: '/provider/today', requests: '/provider/requests', jobs: '/provider/jobs', calendar: '/provider/calendar', more: '/provider/more',
});
