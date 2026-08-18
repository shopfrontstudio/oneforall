// Full-page navigations (window.location) bypass the router, so they need the
// deploy base that BrowserRouter's basename normally adds. On GitHub Pages the
// app is served from /oneforall/ under a domain whose root is a different site
// entirely, so a bare '/login' leaves the app instead of navigating within it.
//
// BASE_URL is '/oneforall/' in production and '/' in dev, always with a
// trailing slash.
const BASE = import.meta.env.BASE_URL;

// Prefix a router path ('/login', '/messages?x=1') with the deploy base.
export function appPath(path = '/') {
  return BASE + (path.startsWith('/') ? path.slice(1) : path);
}

// Supabase email and OAuth redirects must be absolute while still respecting
// the deploy base (for example /oneforall/ on GitHub Pages).
export function absoluteAppUrl(path = '/') {
  return new URL(appPath(path), window.location.origin).toString();
}

// Strip the deploy base off a location path, giving a router-relative path.
export function stripBase(path) {
  if (BASE === '/') return path;
  if (path === BASE.slice(0, -1)) return '/';
  return path.startsWith(BASE) ? '/' + path.slice(BASE.length) : path;
}

// Full-page navigation to an in-app path.
export function assignAppPath(path = '/') {
  window.location.assign(appPath(path));
}
