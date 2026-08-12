import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { cleanText, currentUser, displayName } from '../../shared/guards.js';
import { classifyServiceScope, getPhase1Service, PHASE1_POLICY_VERSION } from '../../shared/phase1-catalogue.js';

const allowedStatus = new Set(['draft', 'published']);

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return unauthorized();
    const payload = await req.json();
    const definition = getPhase1Service(payload?.service_key);
    if (!definition) return fail('Choose an approved Phase 1 service.');
    if (!allowedStatus.has(payload.status)) return fail('Unknown request state.');
    if (!payload.idempotency_key) return fail('An idempotency key is required.');

    const scope = classifyServiceScope(definition.key, `${payload.title || ''} ${payload.description || ''}`);
    if (scope.decision === 'blocked') return fail('This request includes work OneForAll cannot offer.', 422);
    if (payload.status === 'published') {
      if (!definition.flags.public_release_enabled || !definition.flags.request_enabled || !definition.flags.publicly_visible) {
        return fail('This service is not open for public requests.', 403);
      }
      if (scope.decision !== 'allowed') return fail('This request requires manual review before it can be published.', 422);
    }

    const prior = await base44.asServiceRole.entities.Job.filter({ request_idempotency_key: payload.idempotency_key });
    if (prior[0]) return ok({ job: prior[0], already_submitted: true });

    let existing = null;
    if (payload.job_id) {
      existing = await base44.asServiceRole.entities.Job.get(payload.job_id);
      if (!existing) return fail('That draft no longer exists.', 404);
      if (existing.customer_id !== user.id) return forbidden('You can only edit your own draft.');
      if (existing.status !== 'draft') return fail('Only a draft can be edited.');
    }

    const data = {
      customer_id: user.id,
      customer_name: displayName(user),
      customer_suburb: cleanText(payload.customer_suburb || payload.suburb, 100),
      title: cleanText(payload.title, 120),
      description: cleanText(payload.description, 5000),
      category_slug: definition.category,
      category_name: definition.category.replace(/(^|-)([a-z])/g, (_, separator, letter) => `${separator ? ' ' : ''}${letter.toUpperCase()}`),
      service_key: definition.key,
      service_pathway: definition.pathway,
      policy_version: PHASE1_POLICY_VERSION,
      request_idempotency_key: payload.idempotency_key,
      scope_decision: scope.decision,
      scope_reason: scope.reason,
      hazard_screen_status: scope.decision === 'allowed' ? 'passed' : 'manual_review',
      suburb: cleanText(payload.suburb, 100),
      state: 'VIC',
      urgency: ['flexible', 'this_week', 'urgent'].includes(payload.urgency) ? payload.urgency : 'flexible',
      access_notes: cleanText(payload.access_notes, 2000),
      parking: ['on_street', 'driveway', 'none'].includes(payload.parking) ? payload.parking : 'on_street',
      safety_info: cleanText(payload.safety_info, 2000),
      photos: Array.isArray(payload.photos) ? payload.photos.slice(0, 12) : [],
      recurrence_requested: Boolean(payload.recurrence_requested),
      recurrence_frequency: payload.recurrence_requested ? payload.recurrence_frequency : undefined,
      status: payload.status,
    };
    if (payload.preferred_date) data.preferred_date = String(payload.preferred_date);
    if (Number.isFinite(Number(payload.budget))) data.budget = Number(payload.budget);
    if (Number.isFinite(Number(payload.indicative_low))) data.indicative_low = Number(payload.indicative_low);
    if (Number.isFinite(Number(payload.indicative_high))) data.indicative_high = Number(payload.indicative_high);

    const job = existing
      ? await base44.asServiceRole.entities.Job.update(existing.id, data)
      : await base44.asServiceRole.entities.Job.create(data);
    return ok({ job });
  } catch (error) {
    return serverError(error);
  }
}
