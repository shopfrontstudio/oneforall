import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { currentUser, displayName } from '../../shared/guards.js';
import { notifyUser } from '../../shared/notify.js';

// A customer invites a specific tradie to quote on one of their own jobs.
//
// customer_name is deliberately disclosed to the invited tradie — but only because
// the customer chose this tradie, so the invite has to be proven to come from the
// job's owner before that name is attached.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();

    const { job_id, tradie_profile_id } = await req.json();
    if (!job_id || !tradie_profile_id) return fail('A job and a tradie are required.');

    const job = await base44.asServiceRole.entities.Job.get(job_id);
    if (!job) return fail('That job no longer exists.', 404);
    if (job.customer_id !== user.id) return forbidden('You can only invite tradies to your own jobs.');
    if (job.status !== 'published') return fail('Publish the job before inviting tradies.');

    const profile = await base44.asServiceRole.entities.TradieProfile.get(tradie_profile_id);
    if (!profile?.user_id) return fail('That tradie profile no longer exists.', 404);
    if (profile.user_id === user.id) return forbidden('You cannot invite yourself.');

    const existing = await base44.asServiceRole.entities.Invitation.filter({
      job_id: job.id,
      tradie_id: profile.user_id,
    });
    if (existing.some((item) => item.status !== 'declined')) {
      return ok({ already_invited: true });
    }

    const invitation = await base44.asServiceRole.entities.Invitation.create({
      job_id: job.id,
      job_title: job.title,
      customer_id: user.id,
      customer_name: displayName(user),
      tradie_id: profile.user_id,
      tradie_name: profile.business_name || profile.full_name,
      status: 'pending',
    });

    await notifyUser(base44, profile.user_id, {
      type: 'invitation',
      title: 'Direct job invitation',
      body: `${displayName(user)} invited you to "${job.title}"`,
      link: '/invites',
    });

    return ok({ invitation });
  } catch (error) {
    return serverError(error);
  }
}
