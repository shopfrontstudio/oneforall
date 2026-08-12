import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { currentUser } from '../../shared/guards.js';
import { idempotencyScope, requestTransitionRepairPlan } from '../../shared/marketplace.js';
import { PHASE1_POLICY_VERSION } from '../../shared/phase1-catalogue.js';

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
    const scope = idempotencyScope.requestEvent({ key: idempotency_key, actorId: user.id, jobId: job.id });
    const prior = await base44.asServiceRole.entities.RequestEvent.filter(scope);
    if (prior[0]) {
      const plan = requestTransitionRepairPlan({ job, event: prior[0] });
      const repaired = plan.request_needs_update
        ? await base44.asServiceRole.entities.Job.update(job.id, { status: plan.effective_status })
        : job;
      return ok({ job: repaired, already_applied: true, repair_mode: plan.repair_mode });
    }
    if (job.status === to_state) {
      await base44.asServiceRole.entities.RequestEvent.create({
        job_id: job.id, customer_id: job.customer_id, actor_id: user.id, actor_role: 'customer',
        event_type: 'request_state_changed', from_state: job.status, to_state, idempotency_key, policy_version: PHASE1_POLICY_VERSION,
        metadata: { reconciled_existing_state: true },
      });
      return ok({ job, already_applied: true });
    }
    if (!transitions[job.status]?.includes(to_state)) return fail('That request transition is not allowed.', 409);
    const fromState = job.status;
    // Immutable intent is written before the mutable state. If the second write
    // is interrupted, an idempotent retry finds this event and repairs the request.
    await base44.asServiceRole.entities.RequestEvent.create({
      job_id: job.id, customer_id: job.customer_id, actor_id: user.id, actor_role: 'customer',
      event_type: 'request_state_changed', from_state: fromState, to_state, idempotency_key, policy_version: PHASE1_POLICY_VERSION,
    });
    const updated = await base44.asServiceRole.entities.Job.update(job.id, { status: to_state });
    return ok({ job: updated });
  } catch (error) {
    return serverError(error);
  }
}
