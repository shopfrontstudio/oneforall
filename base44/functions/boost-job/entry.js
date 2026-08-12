import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { fail, unauthorized, serverError } from '../../shared/http.js';
import { currentUser } from '../../shared/guards.js';

// Legacy endpoint retained only so old clients fail safely. Phase 1 has no boost
// product, quota or paid placement. Legacy Boost records and schema are untouched.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();
    return fail('Boosting is permanently unavailable in Phase 1.', 410);
  } catch (error) {
    return serverError(error);
  }
}
