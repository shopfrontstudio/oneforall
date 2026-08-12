import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { cleanText, currentUser, hasPaidPlan, parseQuote } from '../../shared/guards.js';
import { notifyUser } from '../../shared/notify.js';

// The invited tradie answers a direct invitation, either with a quote or a decline.
// A quote creates the matching InterestRequest so the job's normal accept flow
// applies — the customer should not have two different ways to hire someone.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();

    const payload = await req.json();
    const { invitation_id, action } = payload || {};
    if (!invitation_id) return fail('An invitation is required.');
    if (!['quote', 'decline'].includes(action)) return fail('Unknown action.');

    const invitation = await base44.asServiceRole.entities.Invitation.get(invitation_id);
    if (!invitation) return fail('That invitation no longer exists.', 404);
    if (invitation.tradie_id !== user.id) return forbidden('This invitation was not sent to you.');

    if (action === 'decline') {
      await base44.asServiceRole.entities.Invitation.update(invitation.id, { status: 'declined' });
      return ok({ status: 'declined' });
    }

    if (invitation.status !== 'pending') return fail('You have already responded to this invitation.');

    const quote = parseQuote(payload);
    if (quote.error) return fail(quote.error);

    if (!(await hasPaidPlan(base44, user.id))) {
      return fail('An active plan is required to send a quote.', 402);
    }

    const job = await base44.asServiceRole.entities.Job.get(invitation.job_id);
    if (!job) return fail('That job no longer exists.', 404);

    const message = cleanText(payload.message, 2000);

    const existing = await base44.asServiceRole.entities.InterestRequest.filter({
      job_id: invitation.job_id,
      tradie_id: user.id,
    });
    if (!existing.some((request) => request.status !== 'declined')) {
      const profiles = await base44.asServiceRole.entities.TradieProfile.filter({ user_id: user.id });
      await base44.asServiceRole.entities.InterestRequest.create({
        job_id: invitation.job_id,
        job_title: invitation.job_title,
        customer_id: invitation.customer_id,
        tradie_id: user.id,
        tradie_name: profiles[0]?.full_name || invitation.tradie_name,
        tradie_business: profiles[0]?.business_name,
        quote_low: quote.low,
        quote_high: quote.high,
        earliest_availability: quote.availability,
        message,
        status: 'pending',
        response_deadline: new Date(Date.now() + 12 * 3600e3).toISOString(),
      });
    }

    await base44.asServiceRole.entities.Invitation.update(invitation.id, {
      status: 'responded',
      quote_low: quote.low,
      quote_high: quote.high,
      earliest_availability: quote.availability,
      message,
    });

    await notifyUser(base44, invitation.customer_id, {
      type: 'invite_response',
      title: 'Invitation response',
      body: `${invitation.tradie_name} responded to your invitation`,
      link: `/job/${invitation.job_id}`,
    });

    return ok({ status: 'responded' });
  } catch (error) {
    return serverError(error);
  }
}
