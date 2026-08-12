// Small response helpers so every function answers in the same shape:
// success => { success: true, ... }, failure => { error: "..." } with a status.

export function ok(data = {}) {
  return Response.json({ success: true, ...data });
}

export function fail(message, status = 400) {
  return Response.json({ error: message }, { status });
}

export function unauthorized() {
  return fail('You must be signed in.', 401);
}

export function forbidden(message = 'You do not have access to this record.') {
  return fail(message, 403);
}

// Functions are the only writer for several entities now, so an unexpected throw
// must not leak internals to the browser. Log it, return something generic.
export function serverError(error) {
  console.error('function failed:', error?.stack || error?.message || error);
  return fail('Something went wrong. Please try again.', 500);
}
