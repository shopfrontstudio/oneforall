-- OneForAll independent-review correction pass.
-- This migration keeps every release flag off and tightens privacy,
-- idempotency, emergency handling and exact operational eligibility.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Protected state needed for exact-intent replay and provider standing.
-- ---------------------------------------------------------------------------
alter table public.tradie_profiles add column if not exists provider_standing text not null default 'inactive'
  check (provider_standing in ('inactive','active','suspended'));
alter table public.request_events add column if not exists intent_fingerprint text;
alter table public.invitation_events add column if not exists intent_fingerprint text;
alter table public.invitations add column if not exists intent_fingerprint text;
alter table public.bookings add column if not exists intent_fingerprint text;
alter table public.booking_events add column if not exists intent_fingerprint text;
alter table public.provider_review_events add column if not exists intent_fingerprint text;
alter table public.founder_approval_decisions add column if not exists intent_fingerprint text;

revoke insert, update, delete on
  public.tradie_profiles, public.request_events, public.invitation_events,
  public.invitations, public.bookings, public.booking_events,
  public.provider_review_events, public.founder_approval_decisions
from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Raw invitations are customer/admin-only. Providers receive a deliberately
-- bounded snapshot with no customer id, name, access note or raw safety data.
-- ---------------------------------------------------------------------------
drop policy if exists "inv read participants" on public.invitations;
drop policy if exists "inv raw customer admin read" on public.invitations;
create policy "inv raw customer admin read" on public.invitations for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());

-- Raw pre-booking audit rows contain stable customer/actor identifiers,
-- idempotency keys, fingerprints and unrestricted metadata. Providers use the
-- bounded invitation snapshot instead; only the customer and admins may read
-- these raw event tables.
drop policy if exists "request events participant read" on public.request_events;
drop policy if exists "request events customer admin read" on public.request_events;
create policy "request events customer admin read" on public.request_events for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());

drop policy if exists "invitation events participant read" on public.invitation_events;
drop policy if exists "invitation events customer admin read" on public.invitation_events;
create policy "invitation events customer admin read" on public.invitation_events for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());

create or replace function public.oneforall_provider_invitation_snapshots(p_payload jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', invitation.id,
    'job_title', invitation.job_title,
    'status', case when invitation.status = 'pending' and invitation.expires_at <= now() then 'expired' else invitation.status end,
    'service_key', invitation.service_key,
    'selected_scope_ids', invitation.selected_scope_ids,
    'selected_scope_labels', invitation.selected_scope_labels,
    'service_area', invitation.service_area,
    'preferred_date', invitation.preferred_date,
    'provider_assertion_id', invitation.provider_assertion_id,
    'expires_at', invitation.expires_at,
    'created_date', invitation.created_date
  ) order by invitation.created_date desc), '[]'::jsonb)
  from public.invitations invitation
  where auth.uid() is not null
    and invitation.tradie_id = auth.uid()
    and (nullif(p_payload->>'invitation_id','') is null
      or invitation.id = (p_payload->>'invitation_id')::uuid);
$$;

create or replace function public.oneforall_review_provider_evidence(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_evidence public.provider_evidence%rowtype;
  v_event public.provider_review_events%rowtype;
  v_decision text := p_payload->>'decision';
  v_reason text := btrim(coalesce(p_payload->>'decision_reason',''));
  v_key text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_fingerprint text := public.oneforall_intent_fingerprint(p_payload);
  v_required_expiry boolean;
  v_requirement_count integer;
begin
  if v_actor is null or not public.is_admin() then raise exception 'Admin review required'; end if;
  if v_decision not in ('verified','rejected') or char_length(v_reason) < 10 or char_length(v_key) < 8 then
    raise exception 'Complete evidence decision required';
  end if;
  select * into v_event from public.provider_review_events
    where reviewer_id = v_actor and resource_type = 'evidence'
      and resource_id = (p_payload->>'evidence_id')::uuid and idempotency_key = v_key;
  if found then
    if v_event.intent_fingerprint is distinct from v_fingerprint then raise exception 'Evidence review idempotency conflict'; end if;
    return jsonb_build_object('evidence_id',v_event.resource_id,'status',v_event.to_status,'idempotent',true);
  end if;
  select * into v_evidence from public.provider_evidence
    where id = (p_payload->>'evidence_id')::uuid for update;
  if not found or v_evidence.provider_id = v_actor then raise exception 'Independent evidence review required'; end if;
  if v_evidence.submission_status not in ('submitted','under_review')
    or v_evidence.superseded_by_evidence_id is not null then raise exception 'Evidence is not reviewable'; end if;
  select count(*), coalesce(bool_or((requirement->>'expiry_required')::boolean),false)
  into v_requirement_count, v_required_expiry
  from public.service_definitions service,
    lateral jsonb_array_elements(service.evidence_requirements) requirement
  where service.service_key = v_evidence.submitted_service_key
    and requirement->>'evidence_type' = v_evidence.evidence_type
    and requirement->>'subject' = v_evidence.subject_type;
  if v_decision = 'verified' and (
    v_requirement_count <> 1
    or v_evidence.submitted_service_key is null
    or cardinality(v_evidence.submitted_scope_ids) = 0
    or (v_required_expiry and (v_evidence.expires_date is null or v_evidence.expires_date <= now()))
    or (v_evidence.evidence_type = 'abn_entity_match' and v_evidence.abn_entity_match is not true)
  ) then raise exception 'Evidence does not meet exact configured requirements'; end if;
  insert into public.provider_review_events (
    provider_id,resource_type,resource_id,from_status,to_status,reviewer_id,
    decision_reason,idempotency_key,intent_fingerprint
  ) values (
    v_evidence.provider_id,'evidence',v_evidence.id,v_evidence.review_status,
    v_decision,v_actor,v_reason,v_key,v_fingerprint
  );
  update public.provider_evidence set review_status = v_decision,
    submission_status = case when v_decision = 'rejected' then 'changes_required' else 'under_review' end,
    service_scopes = case when v_decision = 'verified' then array[v_evidence.submitted_service_key] else service_scopes end,
    approved_scope_ids = case when v_decision = 'verified' then v_evidence.submitted_scope_ids else approved_scope_ids end,
    version = version + 1 where id = v_evidence.id;
  return jsonb_build_object('evidence_id',v_evidence.id,'status',v_decision);
end;
$$;

-- New helpers are not client operations. The provider snapshot is the only
-- newly exposed RPC; corrected existing RPCs retain authenticated-only grants
-- from the preceding migration.
revoke execute on function public.oneforall_provider_invitation_snapshots(jsonb) from public, anon, authenticated;
grant execute on function public.oneforall_provider_invitation_snapshots(jsonb) to authenticated;

comment on function public.oneforall_review_request(jsonb) is
  'Only guided requests may be reclassified to classifier-allowed, non-regulated configured scope. Founder-decision consumption for manual/regulated targets remains unavailable.';
comment on column public.tradie_profiles.provider_standing is
  'Protected operational standing. No provider standing or approval client mutation is exposed in this checkpoint.';

create or replace function public.oneforall_transition_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_event public.booking_events%rowtype;
  v_job public.jobs%rowtype;
  v_quote public.interest_requests%rowtype;
  v_to text := p_payload->>'to_state';
  v_key text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_fingerprint text := public.oneforall_intent_fingerprint(p_payload);
  v_expected integer := (p_payload->>'expected_version')::integer;
  v_role text;
  v_scheduled timestamptz;
  v_service_instant timestamptz;
  v_enforce_notice boolean;
  v_job_status text;
  v_reason text := btrim(coalesce(p_payload->>'reason',''));
begin
  if v_actor is null or char_length(v_key) < 8 then raise exception 'Authentication and idempotency key required'; end if;
  select * into v_booking from public.bookings where id = (p_payload->>'booking_id')::uuid for update;
  if not found then raise exception 'Booking unavailable'; end if;
  select * into v_event from public.booking_events
    where booking_id = v_booking.id and actor_id = v_actor and idempotency_key = v_key;
  if found then
    if v_event.intent_fingerprint is distinct from v_fingerprint then raise exception 'Booking transition idempotency conflict'; end if;
    return jsonb_build_object('booking_id',v_booking.id,'state',v_event.to_state,'idempotent',true);
  end if;
  if public.is_admin() then v_role := 'admin';
  elsif v_actor = v_booking.customer_id then v_role := 'customer';
  elsif v_actor = v_booking.provider_id then v_role := 'provider';
  else raise exception 'Booking unavailable'; end if;
  if v_expected is distinct from v_booking.version then raise exception 'Booking changed; reload before retrying'; end if;
  if not public.oneforall_release_open(v_booking.service_key,'booking') then raise exception 'Booking actions are not released'; end if;
  if v_to in ('cancelled','disputed') and char_length(v_reason) < 10 then
    raise exception 'A meaningful cancellation or dispute reason is required';
  end if;
  if not (
    (v_booking.state = 'accepted' and ((v_role = 'provider' and v_to in ('scheduled','cancelled')) or (v_role = 'customer' and v_to = 'cancelled') or (v_role = 'admin' and v_to in ('scheduled','cancelled','disputed'))))
    or (v_booking.state = 'scheduled' and ((v_role = 'provider' and v_to in ('in_progress','cancelled')) or (v_role = 'customer' and v_to in ('cancelled','disputed')) or (v_role = 'admin' and v_to in ('in_progress','cancelled','disputed'))))
    or (v_booking.state = 'in_progress' and ((v_role = 'provider' and v_to = 'completed') or (v_role = 'customer' and v_to = 'disputed') or (v_role = 'admin' and v_to in ('completed','cancelled','disputed'))))
    or (v_booking.state = 'completed' and v_to = 'disputed' and v_role in ('customer','admin'))
    or (v_booking.state = 'disputed' and v_role = 'admin' and v_to in ('completed','cancelled'))
  ) then raise exception 'Booking transition is not permitted'; end if;

  if v_to = 'scheduled' then
    if nullif(btrim(p_payload->>'scheduled_start'),'') is null then raise exception 'A valid confirmed schedule is required'; end if;
    begin
      v_scheduled := (p_payload->>'scheduled_start')::timestamptz;
    exception when others then
      raise exception 'A valid confirmed schedule is required';
    end;
    if v_scheduled is null or v_scheduled <= now() then raise exception 'Confirmed schedule must be in the future'; end if;
  else
    v_scheduled := v_booking.scheduled_start;
  end if;
  if v_to = 'in_progress' and (v_booking.scheduled_start is null or now() < v_booking.scheduled_start) then
    raise exception 'Work cannot start before the confirmed schedule';
  end if;

  if v_to in ('scheduled','in_progress') then
    select * into v_job from public.jobs where id = v_booking.job_id;
    select * into v_quote from public.interest_requests where id = v_booking.quote_id;
    if v_job.id is null or v_quote.id is null
      or v_quote.job_id <> v_job.id or v_quote.tradie_id <> v_booking.provider_id
      or v_quote.attending_worker_id <> v_booking.attending_worker_id
      or v_quote.provider_assertion_id is null then raise exception 'Canonical quote or assertion is unavailable'; end if;
    if v_to = 'in_progress' then
      v_service_instant := now();
      v_enforce_notice := false;
    else
      v_service_instant := v_scheduled;
      v_enforce_notice := true;
    end if;
    if not public.oneforall_exact_worker_eligible_v2(
      v_booking.provider_id,v_booking.attending_worker_id,v_booking.service_key,
      v_booking.selected_scope_ids,v_service_instant,v_job.suburb,
      v_job.requested_units,v_job.requested_value,v_quote.provider_assertion_id,
      true,v_enforce_notice
    ) then raise exception 'Exact worker, evidence, offering, capacity or assertion gate failed'; end if;
  end if;

  insert into public.booking_events (
    booking_id,job_id,customer_id,provider_id,actor_id,from_state,to_state,
    idempotency_key,intent_fingerprint,metadata
  ) values (
    v_booking.id,v_booking.job_id,v_booking.customer_id,v_booking.provider_id,
    v_actor,v_booking.state,v_to,v_key,v_fingerprint,
    case when v_to = 'scheduled' then jsonb_build_object('scheduled_start',v_scheduled)
      when v_to in ('cancelled','disputed') then jsonb_build_object('reason',v_reason)
      else '{}'::jsonb end
  );
  update public.bookings set state = v_to,scheduled_start = v_scheduled,
    version = version + 1 where id = v_booking.id;
  v_job_status := case v_to when 'in_progress' then 'in_progress'
    when 'disputed' then 'in_progress' when 'completed' then 'completed'
    when 'cancelled' then 'cancelled' else 'matched' end;
  update public.jobs set status = v_job_status,version = version + 1 where id = v_booking.job_id;
  return jsonb_build_object('booking_id',v_booking.id,'state',v_to,'version',v_booking.version + 1);
end;
$$;


-- Manual review can only reclassify a guided request into an exact configured
-- low-risk scope. Original free text remains on the request and is screened
-- for emergency/prohibited terms before structured scope can authorise it.
create or replace function public.oneforall_review_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs%rowtype;
  v_target public.service_definitions%rowtype;
  v_action text := p_payload->>'decision';
  v_reason text := btrim(coalesce(p_payload->>'decision_reason',''));
  v_key text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_fingerprint text := public.oneforall_intent_fingerprint(p_payload);
  v_scopes text[];
  v_original_classification text;
  v_original_reason text;
  v_structured_classification text;
  v_structured_reason text;
  v_event public.request_events%rowtype;
  v_original_screen jsonb;
  v_structured_screen jsonb;
  v_original_intake_fingerprint text;
begin
  if v_actor is null or not public.is_admin() then raise exception 'Admin review required'; end if;
  if v_action not in ('reclassify','restrict') or char_length(v_reason) < 10 or char_length(v_key) < 8 then
    raise exception 'Complete review decision required';
  end if;
  select * into v_event from public.request_events
    where actor_id = v_actor and job_id = (p_payload->>'job_id')::uuid and idempotency_key = v_key;
  if found then
    if v_event.intent_fingerprint is distinct from v_fingerprint then raise exception 'Request review idempotency conflict'; end if;
    return jsonb_build_object('job_id', v_event.job_id, 'status', v_event.to_state, 'idempotent', true);
  end if;
  select * into v_job from public.jobs where id = (p_payload->>'job_id')::uuid for update;
  if not found or v_job.status <> 'manual_review' then raise exception 'Manual-review request unavailable'; end if;

  if v_action = 'restrict' then
    insert into public.request_events (
      job_id, customer_id, actor_id, from_state, to_state, idempotency_key,
      intent_fingerprint, metadata
    ) values (
      v_job.id, v_job.customer_id, v_actor, 'manual_review', 'cancelled', v_key,
      v_fingerprint, jsonb_build_object('decision','restricted','reason',v_reason)
    );
    update public.jobs set status = 'cancelled', scope_decision = 'blocked',
      hazard_screen_status = 'blocked', private_review_reason = v_reason,
      version = version + 1 where id = v_job.id;
    return jsonb_build_object('job_id', v_job.id, 'status', 'cancelled');
  end if;

  if v_job.service_key <> 'general.guided_request' then
    raise exception 'Only guided requests can be reclassified without exact founder-decision consumption';
  end if;
  select * into v_target from public.service_definitions where service_key = p_payload->>'target_service_key';
  if not found or v_target.service_key = 'general.guided_request'
    or v_target.manual_review_required or v_target.pathway = 'licensed_diagnostic' then
    raise exception 'Regulated or manual-review targets require exact founder-decision consumption';
  end if;
  if not public.oneforall_release_open(v_target.service_key, 'request') then
    raise exception 'Target request pathway is not released';
  end if;
  select coalesce(array_agg(value), '{}'::text[]) into v_scopes
  from jsonb_array_elements_text(coalesce(p_payload->'selected_scope_ids', '[]'::jsonb));

  v_original_screen := jsonb_build_object(
    'selected_scope_ids', to_jsonb(v_scopes),
    'scope_description', concat_ws(' ', v_job.description, v_job.access_notes, v_job.safety_info),
    'suburb', v_job.suburb,
    'adult_scope_confirmed', coalesce((p_payload->>'adult_scope_confirmed')::boolean, false),
    'painting_property_era', p_payload->>'painting_property_era',
    'painting_surface_hazard', p_payload->>'painting_surface_hazard',
    'painting_access_height', p_payload->>'painting_access_height'
  );
  select classified.decision, classified.reason into v_original_classification, v_original_reason
  from public.oneforall_classify_request(v_target.service_key, v_original_screen) classified;
  if v_original_classification = 'blocked' then
    raise exception 'Original guided intake contains emergency or prohibited scope';
  end if;

  v_structured_screen := jsonb_build_object(
    'selected_scope_ids', to_jsonb(v_scopes), 'scope_description', '',
    'suburb', v_job.suburb, 'safety_considerations', 'none_declared',
    'adult_scope_confirmed', coalesce((p_payload->>'adult_scope_confirmed')::boolean, false),
    'painting_property_era', p_payload->>'painting_property_era',
    'painting_surface_hazard', p_payload->>'painting_surface_hazard',
    'painting_access_height', p_payload->>'painting_access_height'
  );
  select classified.decision, classified.reason into v_structured_classification, v_structured_reason
  from public.oneforall_classify_request(v_target.service_key, v_structured_screen) classified;
  if v_structured_classification <> 'allowed' then
    raise exception 'Reviewed structured scope is not an allowed low-risk target';
  end if;

  v_original_intake_fingerprint := encode(digest(jsonb_build_object(
    'service_key',v_job.service_key, 'description',v_job.description,
    'access_notes',v_job.access_notes, 'safety_info',v_job.safety_info,
    'selected_scope_ids',v_job.selected_scope_ids, 'policy_version',v_job.policy_version
  )::text, 'sha256'), 'hex');
  update public.jobs set service_key = v_target.service_key,
    category_slug = v_target.category_slug, category_name = v_target.name,
    pathway = v_target.pathway, selected_scope_ids = v_scopes,
    scope_decision = 'allowed', hazard_screen_status = 'passed',
    status = 'submitted', private_review_reason = v_reason,
    policy_version = v_target.policy_version, version = version + 1
  where id = v_job.id;
  insert into public.request_events (
    job_id, customer_id, actor_id, from_state, to_state, idempotency_key,
    intent_fingerprint, metadata
  ) values (
    v_job.id, v_job.customer_id, v_actor, 'manual_review', 'submitted', v_key,
    v_fingerprint, jsonb_build_object(
      'decision','guided_reclassification','reason',v_reason,
      'from_service',v_job.service_key,'to_service',v_target.service_key,
      'original_screen_reason',v_original_reason,
      'structured_screen_reason',v_structured_reason,
      'original_intake_fingerprint',v_original_intake_fingerprint
    )
  );
  return jsonb_build_object('job_id',v_job.id,'status','submitted','service_key',v_target.service_key);
end;
$$;

create or replace function public.oneforall_invite_provider(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs%rowtype;
  v_provider uuid := (p_payload->>'provider_id')::uuid;
  v_assertion_id uuid := (p_payload->>'provider_assertion_id')::uuid;
  v_key text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_fingerprint text := public.oneforall_intent_fingerprint(p_payload);
  v_existing public.invitations%rowtype;
  v_invitation public.invitations%rowtype;
  v_hours integer := least(greatest(coalesce((p_payload->>'expiry_hours')::integer, 48), 1), 72);
begin
  if v_actor is null or not public.is_admin() then raise exception 'Admin review required'; end if;
  if char_length(v_key) < 8 or v_provider is null or v_assertion_id is null then raise exception 'Bounded invitation intent required'; end if;
  select * into v_existing from public.invitations
    where job_id = (p_payload->>'job_id')::uuid and tradie_id = v_provider and idempotency_key = v_key;
  if found then
    if v_existing.intent_fingerprint is distinct from v_fingerprint then raise exception 'Invitation idempotency conflict'; end if;
    return jsonb_build_object('invitation_id',v_existing.id,'idempotent',true);
  end if;
  select * into v_job from public.jobs where id = (p_payload->>'job_id')::uuid for update;
  if not found or v_job.status <> 'submitted' or v_job.scope_decision <> 'allowed'
    or v_job.hazard_screen_status <> 'passed' then raise exception 'Request is not approved for routing'; end if;
  if not public.oneforall_release_open(v_job.service_key, 'quote') then raise exception 'Quote routing is not released'; end if;
  if not exists (
    select 1 from public.provider_public_assertions assertion
    join public.tradie_profiles profile on profile.user_id = assertion.provider_id
    where assertion.id = v_assertion_id and assertion.provider_id = v_provider
      and profile.provider_standing = 'active'
      and assertion.status = 'active' and assertion.superseded_by_assertion_id is null
      and assertion.valid_through >= coalesce(v_job.preferred_date, (now() at time zone 'Australia/Melbourne')::date)
      and assertion.approved_service_ids @> array[v_job.service_key]
      and (assertion.credential_scope @> v_job.selected_scope_ids or assertion.credential_scope @> array['*'])
  ) then raise exception 'Exact provider assertion is not current for this request'; end if;
  insert into public.invitations (
    job_id, job_title, customer_id, customer_name, tradie_id, tradie_name,
    status, service_key, selected_scope_ids, selected_scope_labels,
    service_area, preferred_date, provider_assertion_id, expires_at,
    idempotency_key, intent_fingerprint, created_by
  ) values (
    v_job.id, v_job.category_name, v_job.customer_id, null, v_provider, null,
    'pending', v_job.service_key, v_job.selected_scope_ids, '{}'::text[],
    v_job.suburb, v_job.preferred_date, v_assertion_id,
    now() + make_interval(hours => v_hours), v_key, v_fingerprint, v_actor
  ) returning * into v_invitation;
  insert into public.invitation_events (
    invitation_id, job_id, customer_id, provider_id, actor_id,
    from_status, to_status, idempotency_key, intent_fingerprint
  ) values (
    v_invitation.id,v_job.id,v_job.customer_id,v_provider,v_actor,
    'none','pending',v_key,v_fingerprint
  );
  insert into public.request_events (
    job_id,customer_id,provider_id,actor_id,from_state,to_state,
    idempotency_key,intent_fingerprint,metadata
  ) values (
    v_job.id,v_job.customer_id,v_provider,v_actor,'submitted','published',
    v_key,v_fingerprint,jsonb_build_object('invitation_id',v_invitation.id)
  );
  update public.jobs set status = 'published', version = version + 1 where id = v_job.id;
  return jsonb_build_object('invitation_id',v_invitation.id,'expires_at',v_invitation.expires_at);
end;
$$;

create or replace function public.oneforall_respond_invitation(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_invitation public.invitations%rowtype;
  v_job public.jobs%rowtype;
  v_action text := p_payload->>'action';
  v_key text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_fingerprint text := public.oneforall_intent_fingerprint(p_payload);
  v_event public.invitation_events%rowtype;
  v_worker public.provider_workers%rowtype;
  v_quote public.interest_requests%rowtype;
  v_low numeric;
  v_high numeric;
  v_service_date date;
  v_service_instant timestamptz;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if v_action not in ('quote','decline') or char_length(v_key) < 8 then raise exception 'Invalid invitation response'; end if;
  select * into v_event from public.invitation_events
    where invitation_id = (p_payload->>'invitation_id')::uuid and actor_id = v_actor and idempotency_key = v_key;
  if found then
    if v_event.intent_fingerprint is distinct from v_fingerprint then raise exception 'Invitation response idempotency conflict'; end if;
    return jsonb_build_object('invitation_id',v_event.invitation_id,'status',v_event.to_status,'idempotent',true);
  end if;
  select * into v_invitation from public.invitations where id = (p_payload->>'invitation_id')::uuid for update;
  if not found or v_invitation.tradie_id <> v_actor then raise exception 'Invitation unavailable'; end if;
  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then raise exception 'Invitation expired or closed'; end if;
  if not public.oneforall_release_open(v_invitation.service_key, 'quote') then raise exception 'Quote actions are not released'; end if;
  if v_action = 'decline' then
    insert into public.invitation_events (
      invitation_id,job_id,customer_id,provider_id,actor_id,from_status,to_status,
      idempotency_key,intent_fingerprint
    ) values (
      v_invitation.id,v_invitation.job_id,v_invitation.customer_id,v_actor,v_actor,
      'pending','declined',v_key,v_fingerprint
    );
    update public.invitations set status = 'declined' where id = v_invitation.id;
    return jsonb_build_object('invitation_id',v_invitation.id,'status','declined');
  end if;
  if coalesce((p_payload->>'substitution_disclosed')::boolean,false) is not true then
    raise exception 'Exact attending worker disclosure is required';
  end if;
  v_low := (p_payload->>'quote_low')::numeric;
  v_high := (p_payload->>'quote_high')::numeric;
  if v_low is null or v_high is null or v_low < 0 or v_high < v_low then raise exception 'Invalid quote range'; end if;
  if nullif(p_payload->>'earliest_availability','') is null then raise exception 'Earliest availability is required'; end if;
  v_service_date := greatest(
    coalesce(v_invitation.preferred_date,(now() at time zone 'Australia/Melbourne')::date),
    (p_payload->>'earliest_availability')::date
  );
  v_service_instant := ((v_service_date::timestamp + time '12:00') at time zone 'Australia/Melbourne');
  select * into v_job from public.jobs where id = v_invitation.job_id;
  if not found or v_job.status <> 'published' then raise exception 'Canonical request unavailable'; end if;
  select * into v_worker from public.provider_workers
    where id = (p_payload->>'attending_worker_id')::uuid and provider_id = v_actor;
  if not found or not public.oneforall_exact_worker_eligible_v2(
    v_actor,v_worker.id,v_invitation.service_key,v_invitation.selected_scope_ids,
    v_service_instant,v_job.suburb,v_job.requested_units,v_job.requested_value,
    v_invitation.provider_assertion_id,false,true
  ) then raise exception 'Exact worker, evidence, offering, capacity or assertion gate failed'; end if;
  insert into public.interest_requests (
    job_id,job_title,customer_id,tradie_id,quote_low,quote_high,
    earliest_availability,message,status,response_deadline,service_key,
    selected_scope_ids,attending_worker_id,attending_worker_display_name,
    substitution_disclosed,provider_assertion_id,invitation_id,
    idempotency_key,created_by
  ) values (
    v_invitation.job_id,v_invitation.job_title,v_invitation.customer_id,v_actor,
    v_low,v_high,(p_payload->>'earliest_availability')::date,
    left(btrim(coalesce(p_payload->>'message','')),1000),'pending',
    least(v_invitation.expires_at,now() + interval '48 hours'),
    v_invitation.service_key,v_invitation.selected_scope_ids,
    v_worker.id,v_worker.display_name,true,v_invitation.provider_assertion_id,
    v_invitation.id,v_key,v_actor
  ) returning * into v_quote;
  insert into public.invitation_events (
    invitation_id,job_id,customer_id,provider_id,actor_id,from_status,to_status,
    idempotency_key,intent_fingerprint,metadata
  ) values (
    v_invitation.id,v_invitation.job_id,v_invitation.customer_id,v_actor,v_actor,
    'pending','responded',v_key,v_fingerprint,jsonb_build_object('quote_id',v_quote.id)
  );
  update public.invitations set status = 'responded' where id = v_invitation.id;
  insert into public.notifications (user_id,type,title,body,link,created_by)
  values (v_invitation.customer_id,'managed_quote','A managed quote is ready',v_invitation.job_title,'/bookings',v_actor);
  return jsonb_build_object('quote_id',v_quote.id,'status','pending');
end;
$$;

create or replace function public.oneforall_accept_quote(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_quote public.interest_requests%rowtype;
  v_job public.jobs%rowtype;
  v_worker public.provider_workers%rowtype;
  v_booking public.bookings%rowtype;
  v_key text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_fingerprint text := public.oneforall_intent_fingerprint(p_payload);
  v_service_date date;
  v_service_instant timestamptz;
begin
  if v_actor is null or char_length(v_key) < 8
    or coalesce((p_payload->>'worker_acknowledged')::boolean,false) is not true then
    raise exception 'Idempotency key and worker acknowledgement are required';
  end if;
  select * into v_booking from public.bookings
    where customer_id = v_actor and job_id = (p_payload->>'job_id')::uuid and idempotency_key = v_key;
  if found then
    if v_booking.intent_fingerprint is distinct from v_fingerprint then raise exception 'Quote acceptance idempotency conflict'; end if;
    return jsonb_build_object('booking_id',v_booking.id,'idempotent',true);
  end if;
  select * into v_job from public.jobs where id = (p_payload->>'job_id')::uuid for update;
  select * into v_quote from public.interest_requests where id = (p_payload->>'quote_id')::uuid for update;
  if v_job.id is null or v_quote.id is null or v_job.customer_id <> v_actor
    or v_quote.customer_id <> v_actor or v_quote.job_id <> v_job.id
    or v_quote.status <> 'pending' or v_quote.response_deadline <= now()
    or v_job.status <> 'published' or v_job.scope_decision <> 'allowed'
    or v_job.hazard_screen_status <> 'passed' or v_quote.provider_assertion_id is null then
    raise exception 'Quote cannot be accepted';
  end if;
  if not public.oneforall_release_open(v_job.service_key,'booking') then raise exception 'Booking is not released'; end if;
  if not v_quote.substitution_disclosed or v_quote.attending_worker_id is null then raise exception 'Exact attending worker is not disclosed'; end if;
  v_service_date := greatest(
    coalesce(v_job.preferred_date,(now() at time zone 'Australia/Melbourne')::date),
    coalesce(v_quote.earliest_availability,(now() at time zone 'Australia/Melbourne')::date)
  );
  v_service_instant := ((v_service_date::timestamp + time '12:00') at time zone 'Australia/Melbourne');
  if not public.oneforall_exact_worker_eligible_v2(
    v_quote.tradie_id,v_quote.attending_worker_id,v_job.service_key,v_job.selected_scope_ids,
    v_service_instant,v_job.suburb,v_job.requested_units,v_job.requested_value,
    v_quote.provider_assertion_id,true,true
  ) then raise exception 'Exact worker, evidence, offering, capacity or assertion gate failed'; end if;
  select * into v_worker from public.provider_workers where id = v_quote.attending_worker_id;
  insert into public.bookings (
    job_id,quote_id,customer_id,provider_id,service_key,selected_scope_ids,
    attending_worker_id,attending_worker_display_name,substitution_disclosed,
    customer_worker_acknowledged,scope_decision,hazard_screen_status,
    state,idempotency_key,intent_fingerprint
  ) values (
    v_job.id,v_quote.id,v_actor,v_quote.tradie_id,v_job.service_key,v_job.selected_scope_ids,
    v_worker.id,v_worker.display_name,true,true,v_job.scope_decision,v_job.hazard_screen_status,
    'accepted',v_key,v_fingerprint
  ) returning * into v_booking;
  update public.interest_requests set status = case when id = v_quote.id then 'accepted' else 'declined' end,
    booking_id = case when id = v_quote.id then v_booking.id else booking_id end
    where job_id = v_job.id and status = 'pending';
  update public.invitations set status = 'expired' where job_id = v_job.id and status in ('pending','responded');
  update public.jobs set status = 'matched',booking_id = v_booking.id,
    accepted_quote_id = v_quote.id,assigned_tradie_id = v_quote.tradie_id,
    version = version + 1 where id = v_job.id;
  insert into public.booking_events (
    booking_id,job_id,customer_id,provider_id,actor_id,from_state,to_state,
    idempotency_key,intent_fingerprint
  ) values (
    v_booking.id,v_job.id,v_actor,v_quote.tradie_id,v_actor,'none','accepted',
    v_key,v_fingerprint
  );
  insert into public.conversations (job_id,job_title,customer_id,tradie_id,contact_unlocked,created_by)
  select v_job.id,v_job.category_name,v_actor,v_quote.tradie_id,true,v_actor
  where not exists (select 1 from public.conversations where job_id = v_job.id and tradie_id = v_quote.tradie_id);
  insert into public.notifications (user_id,type,title,body,link,created_by)
  values (v_quote.tradie_id,'booking_confirmed','Booking confirmed',v_job.category_name,'/provider/jobs',v_actor);
  return jsonb_build_object('booking_id',v_booking.id,'state','accepted');
end;
$$;



-- Exact operational eligibility. Every value is canonical server-side state;
-- missing units, value, time, coverage, capacity or standing returns false.
create or replace function public.oneforall_exact_worker_eligible_v2(
  p_provider_id uuid,
  p_worker_id uuid,
  p_service_key text,
  p_selected_scope_ids text[],
  p_service_instant timestamptz,
  p_suburb text,
  p_requested_units numeric,
  p_requested_value numeric,
  p_assertion_id uuid,
  p_require_booking boolean default true,
  p_enforce_notice boolean default true
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_service public.service_definitions%rowtype;
  v_offering public.provider_offerings%rowtype;
  v_worker public.provider_workers%rowtype;
  v_requirement jsonb;
  v_evidence_count integer;
  v_assertion_count integer;
  v_service_date date;
  v_weekday text;
begin
  if p_service_instant is null or nullif(btrim(p_suburb),'') is null
    or p_requested_units is null or p_requested_value is null or p_assertion_id is null then return false; end if;
  v_service_date := (p_service_instant at time zone 'Australia/Melbourne')::date;
  v_weekday := lower(btrim(to_char(p_service_instant at time zone 'Australia/Melbourne', 'FMDay')));

  select * into v_service from public.service_definitions where service_key = p_service_key;
  if not found or not v_service.publicly_visible or not v_service.public_release_enabled
    or not v_service.quote_enabled or (p_require_booking and not v_service.booking_enabled) then return false; end if;
  if cardinality(coalesce(p_selected_scope_ids, '{}'::text[])) = 0
    or not (v_service.scope_ids @> p_selected_scope_ids) then return false; end if;
  if not exists (
    select 1 from public.tradie_profiles profile
    where profile.user_id = p_provider_id and profile.provider_standing = 'active'
  ) then return false; end if;

  select * into v_offering from public.provider_offerings
  where provider_id = p_provider_id and service_key = p_service_key;
  if not found or v_offering.review_status <> 'approved' or not v_offering.active
    or not v_offering.available or v_offering.reverification_required
    or not (v_offering.approved_scope @> p_selected_scope_ids)
    or v_offering.approved_delivery_pathway is distinct from v_service.pathway
    or v_offering.approved_labour_mode is null
    or v_offering.capacity_remaining <= 0 or p_requested_units > v_offering.capacity_remaining
    or v_offering.minimum_units is null or p_requested_units < v_offering.minimum_units
    or v_offering.minimum_job_value is null or p_requested_value < v_offering.minimum_job_value
    or v_offering.minimum_notice_hours is null
    or not exists (select 1 from unnest(v_offering.coverage_suburbs) covered where lower(btrim(covered)) in ('*', lower(btrim(p_suburb))))
    or not exists (select 1 from unnest(v_offering.availability_days) available_day where lower(btrim(available_day)) = v_weekday)
    or (p_enforce_notice and extract(epoch from (p_service_instant - now())) / 3600 < v_offering.minimum_notice_hours)
  then return false; end if;

  select * into v_worker from public.provider_workers
  where id = p_worker_id and provider_id = p_provider_id;
  if not found or v_worker.review_status <> 'verified' or not v_worker.active
    or not v_worker.identity_verified or not v_worker.relationship_verified
    or (v_worker.is_subcontractor and not v_worker.subcontractor_separately_verified) then return false; end if;
  if not (
    v_offering.approved_labour_mode = 'mixed'
    or (v_offering.approved_labour_mode = 'sole_provider' and v_worker.relationship_type in ('owner','director'))
    or (v_offering.approved_labour_mode = 'employees' and v_worker.relationship_type in ('owner','director','employee'))
    or (v_offering.approved_labour_mode = 'subcontractors' and v_worker.relationship_type = 'subcontractor')
  ) then return false; end if;

  for v_requirement in select value from jsonb_array_elements(v_service.evidence_requirements)
  loop
    select count(*) into v_evidence_count
    from public.provider_evidence evidence
    where evidence.provider_id = p_provider_id
      and evidence.evidence_type = v_requirement->>'evidence_type'
      and evidence.subject_type = v_requirement->>'subject'
      and ((v_requirement->>'subject' = 'worker' and evidence.worker_id = p_worker_id)
        or (v_requirement->>'subject' = 'provider' and evidence.worker_id is null))
      and evidence.review_status = 'verified'
      and evidence.superseded_by_evidence_id is null and evidence.superseded_at is null
      and (evidence.service_scopes @> array[p_service_key] or evidence.service_scopes @> array['*'])
      and (evidence.approved_scope_ids @> p_selected_scope_ids or evidence.approved_scope_ids @> array['*'])
      and (coalesce((v_requirement->>'expiry_required')::boolean, false) is false
        or (evidence.expires_date is not null and evidence.expires_date::date >= v_service_date))
      and ((v_requirement->>'evidence_type') <> 'abn_entity_match' or evidence.abn_entity_match is true)
      and not exists (
        select 1 from public.provider_evidence replacement
        where replacement.supersedes_evidence_id = evidence.id
          and replacement.superseded_at is null
          and replacement.submission_status in ('submitted','under_review')
          and replacement.review_status not in ('rejected','expired')
      );
    if v_evidence_count <> 1 then return false; end if;
  end loop;

  select count(*) into v_assertion_count
  from public.provider_public_assertions assertion
  where assertion.id = p_assertion_id
    and assertion.provider_id = p_provider_id
    and assertion.status = 'active' and assertion.superseded_by_assertion_id is null
    and assertion.valid_through >= v_service_date
    and assertion.approved_service_ids @> array[p_service_key]
    and (assertion.credential_scope @> p_selected_scope_ids or assertion.credential_scope @> array['*']);
  return v_assertion_count = 1;
end;
$$;

create or replace function public.oneforall_intent_fingerprint(p_payload jsonb)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select encode(digest((coalesce(p_payload, '{}'::jsonb) - 'idempotency_key')::text, 'sha256'), 'hex');
$$;

-- Cancellation is always a bounded close action, including private drafts and
-- manual review. The reason is immutable audit context and retry intent must
-- match exactly.
create or replace function public.oneforall_transition_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs%rowtype;
  v_event public.request_events%rowtype;
  v_job_id uuid := (p_payload->>'job_id')::uuid;
  v_to text := p_payload->>'to_state';
  v_key text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_reason text := btrim(coalesce(p_payload->>'reason',''));
  v_fingerprint text := public.oneforall_intent_fingerprint(p_payload);
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if char_length(v_key) < 8 or v_to <> 'cancelled' or char_length(v_reason) < 10 then
    raise exception 'Cancellation intent and a meaningful reason are required';
  end if;
  select * into v_event from public.request_events
    where actor_id = v_actor and job_id = v_job_id and idempotency_key = v_key;
  if found then
    if v_event.intent_fingerprint is distinct from v_fingerprint then raise exception 'Request transition idempotency conflict'; end if;
    return jsonb_build_object('job_id', v_job_id, 'status', v_event.to_state, 'idempotent', true);
  end if;
  select * into v_job from public.jobs where id = v_job_id for update;
  if not found or v_job.customer_id <> v_actor then raise exception 'Request unavailable'; end if;
  if v_job.status not in ('draft','manual_review','submitted','published') or v_job.booking_id is not null then
    raise exception 'This request cannot be cancelled from its current state';
  end if;
  insert into public.request_events (
    job_id, customer_id, provider_id, actor_id, from_state, to_state,
    idempotency_key, intent_fingerprint, metadata
  ) values (
    v_job.id, v_job.customer_id, v_job.assigned_tradie_id, v_actor,
    v_job.status, 'cancelled', v_key, v_fingerprint, jsonb_build_object('reason',v_reason)
  );
  update public.jobs set status = 'cancelled', private_review_reason = v_reason,
    version = version + 1 where id = v_job.id;
  return jsonb_build_object('job_id', v_job.id, 'status', 'cancelled');
end;
$$;

create or replace function public.oneforall_record_founder_decision(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_key text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_fingerprint text := public.oneforall_intent_fingerprint(p_payload);
  v_existing public.founder_approval_decisions%rowtype;
  v_decision public.founder_approval_decisions%rowtype;
begin
  if not public.oneforall_is_founder() then raise exception 'Founder authority required'; end if;
  if char_length(v_key) < 8 or p_payload->>'scope_type' not in ('service_release','provider_assertion','regulated_service','public_claim')
    or p_payload->>'decision' not in ('approved','rejected')
    or char_length(btrim(coalesce(p_payload->>'decision_reason',''))) < 10
    or char_length(btrim(coalesce(p_payload->>'payload_fingerprint',''))) < 16 then
    raise exception 'Complete bounded founder decision required';
  end if;
  select * into v_existing from public.founder_approval_decisions
    where founder_user_id = v_actor and idempotency_key = v_key;
  if found then
    if v_existing.intent_fingerprint is distinct from v_fingerprint then raise exception 'Founder decision idempotency conflict'; end if;
    return jsonb_build_object('decision_id', v_existing.id, 'idempotent', true);
  end if;
  insert into public.founder_approval_decisions (
    decision_key, scope_type, scope_id, decision, payload_fingerprint,
    decision_reason, founder_user_id, supersedes_decision_id, idempotency_key,
    intent_fingerprint
  ) values (
    left(p_payload->>'decision_key', 160), p_payload->>'scope_type', left(p_payload->>'scope_id', 200),
    p_payload->>'decision', p_payload->>'payload_fingerprint', left(p_payload->>'decision_reason', 2000),
    v_actor, nullif(p_payload->>'supersedes_decision_id','')::uuid, v_key, v_fingerprint
  ) returning * into v_decision;
  return jsonb_build_object('decision_id', v_decision.id, 'decision', v_decision.decision);
end;
$$;



-- A public multi-service assertion is visible only when every listed service
-- is released. Provider owners/admins retain their private participant view.
drop policy if exists "bounded public assertions read" on public.provider_public_assertions;
create policy "bounded public assertions read" on public.provider_public_assertions for select to anon, authenticated
  using (
    (
      status = 'active'
      and superseded_by_assertion_id is null
      and valid_through >= (now() at time zone 'Australia/Melbourne')::date
      and cardinality(approved_service_ids) > 0
      and not exists (
        select 1
        from unnest(approved_service_ids) listed(service_key)
        left join public.service_definitions service on service.service_key = listed.service_key
        where service.service_key is null
          or not service.publicly_visible
          or not service.public_release_enabled
      )
    )
    or provider_id = auth.uid()
    or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- Emergency classification runs before scope validation. Painting answers
-- accept only explicit configured values; missing/unknown answers fail closed.
-- ---------------------------------------------------------------------------
create or replace function public.oneforall_classify_request(p_service_key text, p_payload jsonb)
returns table (decision text, reason text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_service public.service_definitions%rowtype;
  v_scopes text[];
  v_text text;
  v_term text;
  v_description text := btrim(coalesce(p_payload->>'scope_description', ''));
  v_suburb text := btrim(coalesce(p_payload->>'suburb', ''));
begin
  v_text := lower(concat_ws(' ',
    v_description,
    p_payload->>'reported_pest', p_payload->>'observed_signs',
    p_payload->>'safety_considerations', p_payload->>'painting_property_era',
    p_payload->>'painting_surface_hazard', p_payload->>'painting_access_height',
    coalesce((p_payload->'pathway_data')::text, '')
  ));
  if exists (
    select 1 from unnest(array[
      'immediate danger','life threatening','life-threatening','call 000',
      'active fire','electric shock','electrical shock','being shocked',
      'arcing','electrical sparks','sparks from','burning smell',
      'live exposed','exposed live wire','gas leak','gas smell','smell gas',
      'burst pipe','burst water','active flooding','house flooding',
      'sewage spill','structural collapse','collapse risk','collapsed structure',
      'snake','medical emergency'
    ]) emergency_term
    where position(emergency_term in v_text) > 0
  ) then
    return query select 'blocked'::text, 'emergency_redirect'::text; return;
  end if;

  select * into v_service from public.service_definitions where service_key = p_service_key;
  if not found then return query select 'blocked'::text, 'service_unknown'::text; return; end if;
  select coalesce(array_agg(value), '{}'::text[]) into v_scopes
  from jsonb_array_elements_text(coalesce(p_payload->'selected_scope_ids', '[]'::jsonb));
  if cardinality(v_scopes) = 0 or not (v_service.scope_ids @> v_scopes) then
    return query select 'manual_review'::text, 'scope_unknown'::text; return;
  end if;
  if v_service.adults_only and coalesce((p_payload->>'adult_scope_confirmed')::boolean, false) is not true then
    return query select 'blocked'::text, 'adult_confirmation_required'::text; return;
  end if;
  if p_service_key = 'general.guided_request' then
    if char_length(v_description) < 8 or v_suburb = '' then
      return query select 'manual_review'::text, 'guided_triage_details_required'::text; return;
    end if;
    return query select 'manual_review'::text, 'operations_triage_required'::text; return;
  end if;
  if p_service_key = 'building-renovation.managed_quote'
    and v_scopes is distinct from array['renovation-consultation']::text[] then
    return query select 'blocked'::text, 'consultation_only'::text; return;
  end if;
  if p_service_key = 'painting.residential' then
    if coalesce(p_payload->>'painting_property_era','') not in ('pre_1970','1970_or_later','unknown')
      or coalesce(p_payload->>'painting_surface_hazard','') not in ('none_known','lead_or_asbestos','unsure')
      or coalesce(p_payload->>'painting_access_height','') not in ('ground_level','ladder_or_height','roof') then
      return query select 'manual_review'::text, 'painting_screen_invalid'::text; return;
    end if;
    if p_payload->>'painting_surface_hazard' = 'lead_or_asbestos'
      or p_payload->>'painting_access_height' = 'roof' then
      return query select 'blocked'::text, 'painting_hazard_blocked'::text; return;
    end if;
    if p_payload->>'painting_property_era' in ('pre_1970','unknown')
      or p_payload->>'painting_surface_hazard' = 'unsure'
      or p_payload->>'painting_access_height' = 'ladder_or_height' then
      return query select 'manual_review'::text, 'painting_hazard_review'::text; return;
    end if;
  end if;
  if p_service_key = 'pest-control.pesticide_treatment'
    and coalesce(p_payload->>'diagnostic_booking_id', '') = '' then
    return query select 'manual_review'::text, 'completed_diagnostic_required'::text; return;
  end if;
  select term into v_term from unnest(v_service.blocked_terms) term
  where position(lower(term) in v_text) > 0 limit 1;
  if v_term is not null then return query select 'blocked'::text, 'prohibited_scope'::text; return; end if;
  select term into v_term from unnest(v_service.review_terms) term
  where position(lower(term) in v_text) > 0 limit 1;
  if v_service.manual_review_required or v_term is not null
    or p_payload->>'safety_considerations' in ('considerations_present','prefer_not_to_say')
    or v_description <> '' then
    return query select 'manual_review'::text, 'review_required'::text; return;
  end if;
  return query select 'allowed'::text, 'configured_scope_selected'::text;
end;
$$;

-- These helpers are created by this migration and are server-internal only.
-- Revoke their default PUBLIC execution privilege after their definitions
-- exist so a fresh migration can run in order.
revoke execute on function public.oneforall_exact_worker_eligible_v2(uuid, uuid, text, text[], timestamptz, text, numeric, numeric, uuid, boolean, boolean) from public, anon, authenticated;
revoke execute on function public.oneforall_intent_fingerprint(jsonb) from public, anon, authenticated;
