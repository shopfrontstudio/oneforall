import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { currentUser } from '../../shared/guards.js';
import { matchingTradies, notifyUser } from '../../shared/notify.js';
import { getPhase1Service } from '../../shared/phase1-catalogue.js';

const FREE_BOOSTS_PER_MONTH = 5;
const COOLDOWN_MS = 12 * 3600e3;

// Boosting re-notifies every matching tradie, so it is both a quota'd benefit and a
// fan-out that can be abused. The monthly allowance and the 12-hour per-job cooldown
// were previously enforced only in the browser.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();

    const { job_id } = await req.json();
    if (!job_id) return fail('A job is required.');

    const job = await base44.asServiceRole.entities.Job.get(job_id);
    if (!job) return fail('That job no longer exists.', 404);
    if (job.customer_id !== user.id) return forbidden('You can only boost your own jobs.');
    if (job.status !== 'published') return fail('Only open jobs can be boosted.');
    const definition = getPhase1Service(job.service_key);
    if (!definition?.flags.public_release_enabled || !definition.flags.request_enabled) return fail('This service is not released.', 403);

    const boosts = await base44.asServiceRole.entities.Boost.filter({ customer_id: user.id });

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const usedThisMonth = boosts.filter((boost) => new Date(boost.created_date) >= monthStart).length;
    if (usedThisMonth >= FREE_BOOSTS_PER_MONTH) {
      return fail('No free boosts left this month.', 429);
    }

    const lastForJob = boosts
      .filter((boost) => boost.job_id === job.id)
      .sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())[0];
    if (lastForJob && Date.now() - new Date(lastForJob.created_date).getTime() < COOLDOWN_MS) {
      return fail('One boost per job every 12 hours.', 429);
    }

    // Don't consume the allowance if the boost would reach nobody.
    const eligible = await matchingTradies(base44, job);
    if (!eligible.length) {
      return fail('No eligible tradies to reach right now. Your boost was not used.');
    }

    await base44.asServiceRole.entities.Boost.create({ job_id: job.id, customer_id: user.id, type: 'free' });
    await base44.asServiceRole.entities.Job.update(job.id, { boosted: true });

    await Promise.allSettled(
      eligible.map((tradie) =>
        notifyUser(base44, tradie.user_id, {
          type: 'boosted_job',
          title: 'Boosted job near you',
          body: `${job.title} · ${job.suburb}`,
          link: `/job/${job.id}`,
        }),
      ),
    );

    return ok({
      notified: eligible.length,
      remaining: FREE_BOOSTS_PER_MONTH - usedThisMonth - 1,
    });
  } catch (error) {
    return serverError(error);
  }
}
