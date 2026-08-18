-- Customer request launch. Every catalogue pathway may accept a private
-- request, while provider onboarding, quoting, booking and recurring-series
-- creation remain closed until their independent eligibility gates are ready.

alter table public.jobs
  add column if not exists request_recurrence text not null default 'once'
    check (request_recurrence in ('once','weekly','fortnightly','monthly')),
  add column if not exists intake_snapshot jsonb not null default '{}'::jsonb;

update public.service_definitions
set publicly_visible = true,
    request_enabled = true,
    public_release_enabled = true,
    provider_onboarding_enabled = false,
    quote_enabled = false,
    booking_enabled = false,
    recurrence_enabled = false,
    policy_version = 'phase1-request-launch-2026-08-19',
    updated_date = now();

create or replace function public.oneforall_submit_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_service public.service_definitions%rowtype;
  v_decision text;
  v_reason text;
  v_scopes text[];
  v_idempotency text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_fingerprint text := md5((coalesce(p_payload, '{}'::jsonb) - 'idempotency_key')::text);
  v_existing public.jobs%rowtype;
  v_job public.jobs%rowtype;
  v_suburb text := left(btrim(coalesce(p_payload->>'suburb','')), 100);
  v_urgency text := coalesce(nullif(p_payload->>'urgency',''), 'flexible');
  v_recurrence text := coalesce(nullif(p_payload->>'recurrence',''), 'once');
  v_preferred_date date;
  v_safety text := coalesce(nullif(p_payload->>'safety_considerations',''), 'none_declared');
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if octet_length(coalesce(p_payload, '{}'::jsonb)::text) > 16384 then raise exception 'Request payload is too large'; end if;
  if char_length(v_idempotency) < 8 or char_length(v_idempotency) > 120 then raise exception 'Valid idempotency key required'; end if;

  select * into v_existing from public.jobs
  where customer_id = v_actor and request_idempotency_key = v_idempotency;
  if found then
    if v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Idempotency key was already used with a different request';
    end if;
    return jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'idempotent', true);
  end if;

  if not exists (
    select 1 from public.app_users
    where id = v_actor and account_type = 'customer'
  ) then raise exception 'Customer account required'; end if;

  select * into v_service from public.service_definitions
  where service_key = p_payload->>'service_key';
  if not found or not public.oneforall_release_open(v_service.service_key, 'request') then
    raise exception 'Service requests are not released';
  end if;
  if v_suburb = '' then raise exception 'Service suburb is required'; end if;
  if v_urgency not in ('flexible','this_week','urgent') then raise exception 'Invalid urgency'; end if;
  if v_recurrence not in ('once','weekly','fortnightly','monthly') then raise exception 'Invalid recurrence'; end if;
  if v_safety not in ('none_declared','considerations_present','prefer_not_to_say') then raise exception 'Invalid safety response'; end if;

  select coalesce(array_agg(value), '{}'::text[]) into v_scopes
  from jsonb_array_elements_text(coalesce(p_payload->'selected_scope_ids', '[]'::jsonb));
  if cardinality(v_scopes) = 0 or not (v_service.scope_ids @> v_scopes) then
    raise exception 'Choose a valid configured service scope';
  end if;

  if nullif(p_payload->>'preferred_date','') is not null then
    v_preferred_date := (p_payload->>'preferred_date')::date;
    if v_preferred_date < (now() at time zone 'Australia/Melbourne')::date then
      raise exception 'Preferred date cannot be in the past';
    end if;
  end if;
  if v_service.pathway = 'scheduled_or_recurring' and v_preferred_date is null then
    raise exception 'Preferred date is required';
  end if;
  if v_service.pathway <> 'scheduled_or_recurring' then v_recurrence := 'once'; end if;

  select classified.decision, classified.reason into v_decision, v_reason
  from public.oneforall_classify_request(v_service.service_key, p_payload) classified;
  if v_decision = 'blocked' then raise exception 'Request is restricted: %', v_reason; end if;

  insert into public.jobs (
    customer_id, title, description, category_slug, category_name, suburb,
    preferred_date, urgency, request_recurrence, intake_snapshot,
    service_key, pathway, selected_scope_ids,
    scope_decision, hazard_screen_status, private_review_reason,
    request_idempotency_key, request_fingerprint, policy_version, status,
    created_by, indicative_low, indicative_high
  ) values (
    v_actor, v_service.name, left(btrim(coalesce(p_payload->>'scope_description','')), 3000),
    v_service.category_slug, v_service.name, v_suburb,
    v_preferred_date, v_urgency, v_recurrence,
    jsonb_build_object(
      'recurrence', v_recurrence,
      'reported_pest', left(btrim(coalesce(p_payload->>'reported_pest','')), 120),
      'observed_signs', left(btrim(coalesce(p_payload->>'observed_signs','')), 2000),
      'safety_considerations', v_safety,
      'adult_scope_confirmed', coalesce((p_payload->>'adult_scope_confirmed')::boolean, false),
      'painting_property_era', left(coalesce(p_payload->>'painting_property_era',''), 30),
      'painting_surface_hazard', left(coalesce(p_payload->>'painting_surface_hazard',''), 30),
      'painting_access_height', left(coalesce(p_payload->>'painting_access_height',''), 30)
    ),
    v_service.service_key, v_service.pathway, v_scopes, v_decision,
    case when v_decision = 'manual_review' then 'manual_review' else 'passed' end,
    case when v_decision = 'manual_review' then v_reason else null end,
    v_idempotency, v_fingerprint, v_service.policy_version,
    case when v_decision = 'manual_review' then 'manual_review' else 'submitted' end,
    v_actor, null, null
  ) returning * into v_job;

  insert into public.request_events (
    job_id, customer_id, actor_id, from_state, to_state, idempotency_key, metadata
  ) values (
    v_job.id, v_actor, v_actor, 'none', v_job.status, v_idempotency,
    jsonb_build_object('scope_decision', v_decision, 'reason', v_reason)
  );
  return jsonb_build_object('id', v_job.id, 'status', v_job.status, 'scope_decision', v_decision);
end;
$$;

revoke execute on function public.oneforall_submit_request(jsonb) from public, anon;
grant execute on function public.oneforall_submit_request(jsonb) to authenticated;

do $$
begin
  if (select count(*) from public.service_definitions) <> 15 then
    raise exception 'Expected exactly 15 configured service pathways';
  end if;
  if exists (
    select 1 from public.service_definitions
    where not publicly_visible or not request_enabled or not public_release_enabled
      or provider_onboarding_enabled or quote_enabled or booking_enabled or recurrence_enabled
  ) then
    raise exception 'Customer-request release controls are inconsistent';
  end if;
end;
$$;
