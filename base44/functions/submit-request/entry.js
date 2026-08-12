import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { ok, fail, forbidden, unauthorized, serverError } from '../../shared/http.js';
import { cleanText, currentUser, displayName, normaliseISODate, serviceDateHasPassed, serviceDateIsFuture } from '../../shared/guards.js';
import { classifyServiceScope, collectAdditionalRiskText, getPhase1Service, PHASE1_POLICY_VERSION } from '../../shared/phase1-catalogue.js';
import { idempotencyScope } from '../../shared/marketplace.js';

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

    const recurrenceRequested = payload.recurrence_requested === true;
    const recurrenceFrequency = payload.recurrence_frequency;
    if (recurrenceRequested && definition.pathway !== 'scheduled_or_recurring') {
      return fail('Recurring service is not available for this request pathway.', 422);
    }
    if (recurrenceRequested && definition.flags.recurrence_enabled !== true) {
      return fail('Recurring service is not currently available.', 403);
    }
    if (recurrenceRequested && !['weekly', 'fortnightly', 'monthly', 'custom'].includes(recurrenceFrequency)) {
      return fail('Choose a valid recurrence frequency.', 422);
    }

    const selectedScopeIds = Array.isArray(payload.selected_scope_ids) ? [...new Set(payload.selected_scope_ids.filter(Boolean))] : [];
    const title = cleanText(payload.title, 120);
    const description = cleanText(payload.description, 5000);
    const accessNotes = cleanText(payload.access_notes, 2000);
    const safetyInfo = cleanText(payload.safety_info, 2000);
    const reportedPest = cleanText(payload.reported_pest, 120);
    const observedSigns = cleanText(payload.observed_signs, 2000);
    const safetyConsiderations = ['none_declared', 'considerations_present', 'prefer_not_to_say'].includes(payload.safety_considerations)
      ? payload.safety_considerations
      : 'none_declared';
    const photoNames = Array.isArray(payload.photo_names) ? payload.photo_names.map((name) => cleanText(name, 120)).filter(Boolean).slice(0, 8) : [];
    let preferredDate;
    if (payload.preferred_date) {
      preferredDate = normaliseISODate(payload.preferred_date);
      if (!preferredDate) return fail('Choose a valid preferred date.', 422);
      if (serviceDateHasPassed(preferredDate)) return fail('Choose a preferred date that has not passed.', 422);
    }
    if (payload.status === 'published' && definition.pathway === 'scheduled_or_recurring' && !serviceDateIsFuture(preferredDate)) {
      return fail('Published scheduled services need a future preferred date.', 422);
    }
    const scope = classifyServiceScope(definition.key, {
      selectedScopeIds,
      // Only configured scope IDs can allow work. Description may narrow the
      // selected scope; every other work/risk field may only review or block it.
      scopeNotes: description,
      additionalRiskText: collectAdditionalRiskText({
        title,
        access_notes: accessNotes,
        safety_info: safetyInfo,
        reported_pest: reportedPest,
        observed_signs: observedSigns,
        safety_considerations: safetyConsiderations,
        photo_names: photoNames,
        photos: payload.photos,
        pathway_fields: payload.pathway_fields,
        pathway_answers: payload.pathway_answers,
        pathway_data: payload.pathway_data,
      }),
      adultConfirmed: payload.adult_scope_confirmed === true,
    });
    if (scope.decision === 'blocked') return fail('This request includes work OneForAll cannot offer.', 422);
    if (payload.status === 'published') {
      if (!definition.flags.public_release_enabled || !definition.flags.request_enabled || !definition.flags.publicly_visible) {
        return fail('This service is not open for public requests.', 403);
      }
      if (scope.decision !== 'allowed') return fail('This request requires manual review before it can be published.', 422);
    }

    const prior = await base44.asServiceRole.entities.Job.filter(idempotencyScope.job({ key: payload.idempotency_key, customerId: user.id, serviceKey: definition.key }));
    const priorForParent = payload.job_id ? prior.find((item) => item.id === payload.job_id) : prior[0];
    if (priorForParent) return ok({ job: priorForParent, already_submitted: true });

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
      // Display titles are configuration-owned. The submitted title is screened
      // above but never becomes an authoritative or public service description.
      title: definition.name,
      description,
      category_slug: definition.category,
      category_name: definition.category.replace(/(^|-)([a-z])/g, (_, separator, letter) => `${separator ? ' ' : ''}${letter.toUpperCase()}`),
      service_key: definition.key,
      selected_scope_ids: scope.selected_scope_ids,
      adult_scope_confirmed: definition.adults_only ? payload.adult_scope_confirmed === true : false,
      service_pathway: definition.pathway,
      policy_version: PHASE1_POLICY_VERSION,
      request_idempotency_key: payload.idempotency_key,
      scope_decision: scope.decision,
      scope_reason: scope.reason,
      hazard_screen_status: scope.decision === 'allowed' ? 'passed' : 'manual_review',
      suburb: cleanText(payload.suburb, 100),
      state: 'VIC',
      urgency: ['flexible', 'this_week', 'urgent'].includes(payload.urgency) ? payload.urgency : 'flexible',
      access_notes: accessNotes,
      parking: ['on_street', 'driveway', 'none'].includes(payload.parking) ? payload.parking : 'on_street',
      safety_info: safetyInfo,
      reported_pest: reportedPest,
      observed_signs: observedSigns,
      safety_considerations: safetyConsiderations,
      photos: Array.isArray(payload.photos) ? payload.photos.slice(0, 12) : [],
      recurrence_requested: recurrenceRequested,
      recurrence_frequency: recurrenceRequested ? recurrenceFrequency : undefined,
      status: payload.status,
    };
    if (preferredDate) data.preferred_date = preferredDate;
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
