import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { cleanText, currentUser, displayName } from '../../shared/guards.js';
import { notifyUser } from '../../shared/notify.js';

// Leaves a review, and recomputes the tradie's aggregate rating.
//
// Two things RLS could not enforce: that the reviewer actually had this job done by
// this tradie, and that rating_avg / rating_count reflect real reviews. Both live
// here — the aggregates are written with the service role because their field-level
// rules are admin-only, which is what stops a tradie awarding themselves five stars.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();

    const { job_id, rating, body } = await req.json();
    if (!job_id) return fail('A job is required.');

    const score = Number(rating);
    if (!Number.isInteger(score) || score < 1 || score > 5) return fail('Choose a rating from 1 to 5.');

    const job = await base44.asServiceRole.entities.Job.get(job_id);
    if (!job) return fail('That job no longer exists.', 404);
    if (job.customer_id !== user.id) return forbidden('Only the customer who posted this job can review it.');
    if (job.status !== 'completed') return fail('You can review once the job is marked complete.');

    let revieweeId = job.assigned_tradie_id;
    if (!revieweeId) {
      const requests = await base44.asServiceRole.entities.InterestRequest.filter({
        job_id: job.id,
        status: 'accepted',
      });
      revieweeId = requests[0]?.tradie_id;
    }
    if (!revieweeId) return fail('This job has no matched tradie to review.');

    const mine = await base44.asServiceRole.entities.Review.filter({ job_id: job.id, reviewer_id: user.id });
    if (mine.length) return fail('You have already reviewed this job.', 409);

    const review = await base44.asServiceRole.entities.Review.create({
      job_id: job.id,
      reviewer_id: user.id,
      reviewer_name: displayName(user),
      reviewee_id: revieweeId,
      rating: score,
      body: cleanText(body, 2000),
      role: 'customer_to_tradie',
    });

    // Recompute from the full set rather than nudging a running average, so a
    // deleted or corrected review cannot leave the aggregate drifting.
    const all = await base44.asServiceRole.entities.Review.filter({ reviewee_id: revieweeId });
    const profiles = await base44.asServiceRole.entities.TradieProfile.filter({ user_id: revieweeId });
    if (profiles[0] && all.length) {
      const total = all.reduce((sum, item) => sum + Number(item.rating || 0), 0);
      await base44.asServiceRole.entities.TradieProfile.update(profiles[0].id, {
        rating_avg: Math.round((total / all.length) * 100) / 100,
        rating_count: all.length,
      });
    }

    await notifyUser(base44, revieweeId, {
      type: 'review',
      title: 'You received a review',
      body: `${displayName(user)} rated your work on "${job.title}" ${score}/5.`,
      link: '/tradie-profile',
    });

    return ok({ review });
  } catch (error) {
    return serverError(error);
  }
}
