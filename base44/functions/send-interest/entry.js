import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { cleanText, currentUser, displayName, hasPaidPlan, parseQuote } from '../../shared/guards.js';
import { notifyUser } from '../../shared/notify.js';

// A tradie expresses interest in a published job.
//
// Everything identifying is derived here: the session gives tradie_id, the job
// record gives customer_id. The browser only chooses the quote and the message.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();

    const payload = await req.json();
    if (!payload?.job_id) return fail('A job is required.');

    const quote = parseQuote(payload);
    if (quote.error) return fail(quote.error);

    const job = await base44.asServiceRole.entities.Job.get(payload.job_id);
    if (!job) return fail('That job no longer exists.', 404);
    if (job.status !== 'published') return fail('That job is no longer open for quotes.');
    if (job.customer_id === user.id) return forbidden('You cannot quote on your own job.');

    const profiles = await base44.asServiceRole.entities.TradieProfile.filter({ user_id: user.id });
    const profile = profiles[0];
    if (!profile) return fail('Complete your tradie profile first.');

    if (!(await hasPaidPlan(base44, user.id))) {
      return fail('An active plan is required to send interest requests.', 402);
    }

    // Re-check server-side rather than trusting the browser's `sent` map.
    const existing = await base44.asServiceRole.entities.InterestRequest.filter({
      job_id: job.id,
      tradie_id: user.id,
    });
    const live = existing.find((request) => request.status !== 'declined');
    if (live) return ok({ request: live, already_sent: true });

    const request = await base44.asServiceRole.entities.InterestRequest.create({
      job_id: job.id,
      job_title: job.title,
      customer_id: job.customer_id,
      tradie_id: user.id,
      tradie_name: profile.full_name,
      tradie_business: profile.business_name,
      quote_low: quote.low,
      quote_high: quote.high,
      earliest_availability: quote.availability,
      message: cleanText(payload.message, 2000),
      status: 'pending',
      response_deadline: new Date(Date.now() + 12 * 3600e3).toISOString(),
    });

    await notifyUser(base44, job.customer_id, {
      type: 'interest',
      title: 'New interest request',
      body: `${profile.business_name || profile.full_name || displayName(user)} is interested in "${job.title}"`,
      link: `/job/${job.id}`,
    });

    return ok({ request });
  } catch (error) {
    return serverError(error);
  }
}
