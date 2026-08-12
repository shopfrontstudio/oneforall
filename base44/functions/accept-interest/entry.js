import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { currentUser } from '../../shared/guards.js';
import { notifyUser } from '../../shared/notify.js';

// The customer accepts or declines an interest request.
//
// Accepting is what unlocks the private side of a job — it sets assigned_tradie_id,
// which field-level RLS uses to release access_notes and customer_name — so it must
// be the job owner doing it, and the conversation must be created here rather than
// by whoever asks for one.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();

    const { request_id, action } = await req.json();
    if (!request_id) return fail('A request is required.');
    if (!['accept', 'decline'].includes(action)) return fail('Unknown action.');

    const request = await base44.asServiceRole.entities.InterestRequest.get(request_id);
    if (!request) return fail('That request no longer exists.', 404);

    const job = await base44.asServiceRole.entities.Job.get(request.job_id);
    if (!job) return fail('That job no longer exists.', 404);
    if (job.customer_id !== user.id) return forbidden('Only the customer who posted this job can respond.');

    if (action === 'decline') {
      await base44.asServiceRole.entities.InterestRequest.update(request.id, { status: 'declined' });
      return ok({ status: 'declined' });
    }

    if (request.status === 'declined') return fail('That request was already declined.');

    const siblings = await base44.asServiceRole.entities.InterestRequest.filter({ job_id: job.id });
    await base44.asServiceRole.entities.InterestRequest.update(request.id, { status: 'accepted' });
    await Promise.all(
      siblings
        .filter((item) => item.id !== request.id && item.status === 'pending')
        .map((item) => base44.asServiceRole.entities.InterestRequest.update(item.id, { status: 'declined' })),
    );

    await base44.asServiceRole.entities.Job.update(job.id, {
      status: 'matched',
      assigned_tradie_id: request.tradie_id,
    });

    const existing = await base44.asServiceRole.entities.Conversation.filter({
      job_id: job.id,
      tradie_id: request.tradie_id,
    });
    const conversation =
      existing[0] ||
      (await base44.asServiceRole.entities.Conversation.create({
        job_id: job.id,
        job_title: job.title,
        customer_id: user.id,
        tradie_id: request.tradie_id,
        contact_unlocked: true,
      }));

    await notifyUser(base44, request.tradie_id, {
      type: 'accepted',
      title: 'Request accepted',
      body: `Your interest in "${job.title}" was accepted.`,
      link: '/messages',
    });

    return ok({ status: 'accepted', conversation_id: conversation.id });
  } catch (error) {
    return serverError(error);
  }
}
