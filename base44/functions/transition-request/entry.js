import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { currentUser } from '../../shared/guards.js';

const transitions = { draft: ['cancelled'], published: ['cancelled'] };

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();
    const { job_id, to_state, idempotency_key } = await req.json();
    if (!job_id || !to_state || !idempotency_key) return fail('A request, state and idempotency key are required.');
    const job = await base44.asServiceRole.entities.Job.get(job_id);
    if (!job) return fail('That request no longer exists.', 404);
    if (job.customer_id !== user.id) return forbidden('You can only change your own request.');
    if (job.status === to_state) return ok({ job, already_applied: true });
    if (!transitions[job.status]?.includes(to_state)) return fail('That request transition is not allowed.', 409);
    const updated = await base44.asServiceRole.entities.Job.update(job.id, { status: to_state });
    return ok({ job: updated });
  } catch (error) {
    return serverError(error);
  }
}
