// Auth failures surface raw messages from supabase-js, and a transport failure
// arrives as the browser's own TypeError ("Failed to fetch" / "Load failed" /
// "NetworkError when attempting to fetch resource"). Showing that verbatim is
// meaningless to a user on flaky mobile data — and it is the exact message the
// app shows when VITE_SUPABASE_URL is unset, so it is worth being clear about.
const NETWORK_ERROR_PATTERN = /failed to fetch|load failed|networkerror|network request failed/i;

const OFFLINE_MESSAGE =
  "Couldn't reach the server. Check your internet connection and try again.";

export function isNetworkError(err) {
  return NETWORK_ERROR_PATTERN.test(err?.message || '');
}

// Map an auth error to something worth showing a user.
export function toAuthErrorMessage(err, fallback) {
  if (isNetworkError(err)) return OFFLINE_MESSAGE;
  return err?.message || fallback;
}
