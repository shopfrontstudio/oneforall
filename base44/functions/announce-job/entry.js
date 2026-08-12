import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { currentUser } from '../../shared/guards.js';
import { notifyMatchingTradies } from '../../shared/notify.js';
import { getPhase1Service } from '../../shared/phase1-catalogue.js';

// Announces a freshly published job to matching tradies.
//
// submit-request owns the request write. This separate authorised fan-out creates
// participant-scoped Invitation snapshots before notifying eligible providers.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();

    const { job_id } = await req.json();
    if (!job_id) return fail('A job is required.');

    const job = await base44.asServiceRole.entities.Job.get(job_id);
    if (!job) return fail('That job no longer exists.', 404);
    if (job.customer_id !== user.id) return forbidden('You can only announce your own jobs.');
    if (job.status !== 'published') return fail('Only published jobs are announced.');
    const definition = getPhase1Service(job.service_key);
    if (!definition?.flags.public_release_enabled || !definition.flags.request_enabled) {
      return fail('This service is not released.', 403);
    }

    const notified = await notifyMatchingTradies(base44, job, {
      type: 'job_match',
      title: `New managed ${definition.name} request`,
      body: `A reviewed request is available in ${job.suburb}.`,
      link: '/provider/discover',
    });

    return ok({ notified });
  } catch (error) {
    return serverError(error);
  }
}
