import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, unauthorized, serverError } from '../../shared/http.js';
import { currentUser } from '../../shared/guards.js';
import { loadServiceEligibility } from '../../shared/marketplace.js';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();
    const { service_key, suburb } = await req.json();
    if (!service_key || !suburb) return fail('A service and suburb are required.');
    return ok(await loadServiceEligibility(base44, { providerId: user.id, serviceKey: service_key, suburb }));
  } catch (error) {
    return serverError(error);
  }
}
