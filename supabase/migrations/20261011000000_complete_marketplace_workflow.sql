-- Complete managed marketplace workflow.
-- Additive only: every protected mutation is RPC-only, all current release
-- controls remain unchanged, and external payment records are participant
-- statements rather than processor or bank verification.

create extension if not exists pgcrypto with schema extensions;

alter table public.jobs
  add column if not exists request_photo_paths text[] not null default '{}',
  add column if not exists rebooked_from_booking_id uuid references public.bookings (id),
  add column if not exists requested_provider_id uuid references auth.users (id);

alter table public.interest_requests drop constraint if exists interest_requests_status_check;
alter table public.interest_requests
  add column if not exists revision_number integer not null default 1 check (revision_number > 0),
  add column if not exists version integer not null default 1 check (version > 0),
  add column if not exists quote_terms text,
  add column if not exists supersedes_quote_id uuid references public.interest_requests (id),
  add column if not exists superseded_by_quote_id uuid references public.interest_requests (id),
  add constraint interest_requests_status_check check (status in ('pending','accepted','declined','expired','superseded'));

alter table public.recurring_series drop constraint if exists recurring_series_state_check;
alter table public.recurring_series
  add column if not exists source_booking_id uuid references public.bookings (id),
  add column if not exists frequency text check (frequency in ('weekly','fortnightly','monthly')),
  add column if not exists preferred_weekday integer check (preferred_weekday between 1 and 7),
  add column if not exists preferred_time time,
  add column if not exists proposed_by uuid references auth.users (id),
  add column if not exists customer_confirmed_at timestamptz,
  add column if not exists provider_confirmed_at timestamptz,
  add column if not exists version integer not null default 1 check (version > 0),
  add column if not exists idempotency_key text,
  add column if not exists intent_fingerprint text,
  add constraint recurring_series_state_check check (state in ('proposed','active','paused','cancelled'));

create table if not exists public.external_payment_confirmations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  customer_id uuid not null references auth.users (id),
  provider_id uuid not null references auth.users (id),
  participant_role text not null check (participant_role in ('customer','provider')),
  actor_id uuid not null references auth.users (id),
  amount numeric not null check (amount > 0 and amount <= 1000000),
  currency text not null default 'AUD' check (currency = 'AUD'),
  payment_method text not null check (payment_method in ('cash','bank_transfer','card_external','other_external')),
  paid_at timestamptz not null,
  note text,
  status text not null default 'confirmed' check (status in ('confirmed','withdrawn')),
  idempotency_key text not null,
  intent_fingerprint text not null,
  created_date timestamptz not null default now(),
  unique (booking_id, participant_role),
  unique (actor_id, booking_id, idempotency_key)
);

create table if not exists public.provider_booking_links (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references auth.users (id) on delete cascade,
  service_key text not null references public.service_definitions (service_key),
  approved_scope_ids text[] not null,
  token_hash text not null unique,
  label text,
  status text not null default 'active' check (status in ('active','disabled','expired')),
  expires_at timestamptz,
  version integer not null default 1 check (version > 0),
  idempotency_key text not null,
  intent_fingerprint text not null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  unique (provider_id, service_key, idempotency_key)
);

alter table public.jobs
  add column if not exists provider_booking_link_id uuid references public.provider_booking_links (id);

create table if not exists public.marketplace_workflow_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'request_media_attached','quote_revised','payment_confirmed','payment_withdrawn',
    'recurrence_proposed','recurrence_confirmed','recurrence_cancelled',
    'rebooking_created','booking_link_created','booking_link_disabled'
  )),
  resource_type text not null,
  resource_id uuid not null,
  booking_id uuid references public.bookings (id),
  job_id uuid references public.jobs (id),
  customer_id uuid references auth.users (id),
  provider_id uuid references auth.users (id),
  actor_id uuid not null references auth.users (id),
  idempotency_key text not null,
  intent_fingerprint text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  unique (actor_id, event_type, resource_id, idempotency_key)
);

create index if not exists external_payment_booking_idx on public.external_payment_confirmations (booking_id);
create index if not exists provider_booking_links_owner_idx on public.provider_booking_links (provider_id, status);
create index if not exists recurring_series_booking_idx on public.recurring_series (source_booking_id);
create unique index if not exists recurring_series_idempotency_idx
  on public.recurring_series (proposed_by, source_booking_id, idempotency_key)
  where idempotency_key is not null;

alter table public.external_payment_confirmations enable row level security;
alter table public.provider_booking_links enable row level security;
alter table public.marketplace_workflow_events enable row level security;

create policy "external payments participant read" on public.external_payment_confirmations for select to authenticated
  using (customer_id = auth.uid() or provider_id = auth.uid() or public.is_admin());
create policy "provider booking links owner read" on public.provider_booking_links for select to authenticated
  using (provider_id = auth.uid() or public.is_admin());
create policy "workflow events participant read" on public.marketplace_workflow_events for select to authenticated
  using (customer_id = auth.uid() or provider_id = auth.uid() or public.is_admin());

revoke insert, update, delete on public.external_payment_confirmations,
  public.provider_booking_links, public.marketplace_workflow_events from anon, authenticated;

-- Customers may upload only to their own private request and only while it is
-- still unbooked. The path is not provider-readable until operations place it
-- in a reviewed invitation snapshot.
drop policy if exists "customer request media owner read" on storage.objects;
create policy "customer request media owner read" on storage.objects for select to authenticated
  using (
    bucket_id = 'provider-request-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.jobs job
      where job.id::text = (storage.foldername(name))[2] and job.customer_id = auth.uid()
    )
  );
drop policy if exists "customer request media bounded upload" on storage.objects;
create policy "customer request media bounded upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'provider-request-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.jobs job
      where job.id::text = (storage.foldername(name))[2]
        and job.customer_id = auth.uid()
        and job.status in ('manual_review','submitted','published')
    )
  );
drop policy if exists "customer request media owner cleanup" on storage.objects;
create policy "customer request media owner cleanup" on storage.objects for delete to authenticated
  using (
    bucket_id = 'provider-request-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.jobs job
      where job.id::text = (storage.foldername(name))[2]
        and job.customer_id = auth.uid()
        and job.status in ('manual_review','submitted','published')
    )
  );

create or replace function public.oneforall_attach_request_media(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_job public.jobs%rowtype;
  v_paths text[];
  v_key text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_fingerprint text := public.oneforall_intent_fingerprint(p_payload);
  v_event public.marketplace_workflow_events%rowtype;
begin
  if v_actor is null or char_length(v_key) < 8 then raise exception 'Authentication and idempotency key required'; end if;
  select * into v_job from public.jobs where id = (p_payload->>'job_id')::uuid for update;
  if not found or v_job.customer_id <> v_actor or v_job.status not in ('manual_review','submitted','published') then
    raise exception 'Request media cannot be changed';
  end if;
  select * into v_event from public.marketplace_workflow_events
    where actor_id=v_actor and event_type='request_media_attached' and resource_id=v_job.id and idempotency_key=v_key;
  if found then
    if v_event.intent_fingerprint <> v_fingerprint then raise exception 'Request media idempotency conflict'; end if;
    return jsonb_build_object('job_id',v_job.id,'photo_count',cardinality(v_job.request_photo_paths),'idempotent',true);
  end if;
  select coalesce(array_agg(btrim(value)),'{}'::text[]) into v_paths
  from jsonb_array_elements_text(coalesce(p_payload->'paths','[]'::jsonb));
  if cardinality(v_paths) > 6 or exists (
    select 1 from unnest(v_paths) path
    where path !~ ('^' || v_actor::text || '/' || v_job.id::text || '/[A-Za-z0-9._-]+$')
      or not exists (select 1 from storage.objects object where object.bucket_id='provider-request-media' and object.name=path)
  ) then raise exception 'Request photos are invalid'; end if;
  insert into public.marketplace_workflow_events
    (event_type,resource_type,resource_id,job_id,customer_id,actor_id,idempotency_key,intent_fingerprint,metadata)
  values ('request_media_attached','job',v_job.id,v_job.id,v_actor,v_actor,v_key,v_fingerprint,jsonb_build_object('paths',v_paths));
  update public.jobs set request_photo_paths=v_paths,version=version+1 where id=v_job.id;
  return jsonb_build_object('job_id',v_job.id,'photo_count',cardinality(v_paths));
end $$;

create or replace function public.oneforall_revise_quote(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_old public.interest_requests%rowtype;
  v_new public.interest_requests%rowtype;
  v_job public.jobs%rowtype;
  v_key text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_fingerprint text := public.oneforall_intent_fingerprint(p_payload);
  v_event public.marketplace_workflow_events%rowtype;
  v_low numeric;
  v_high numeric;
  v_expected integer;
  v_date date;
begin
  if v_actor is null or char_length(v_key)<8 then raise exception 'Authentication and idempotency key required'; end if;
  select * into v_old from public.interest_requests where id=(p_payload->>'quote_id')::uuid for update;
  if not found or v_old.tradie_id<>v_actor or v_old.status<>'pending' or v_old.booking_id is not null
    or v_old.response_deadline<=now() then raise exception 'Quote cannot be revised'; end if;
  select * into v_event from public.marketplace_workflow_events
    where actor_id=v_actor and event_type='quote_revised' and resource_id=v_old.id and idempotency_key=v_key;
  if found then
    if v_event.intent_fingerprint<>v_fingerprint then raise exception 'Quote revision idempotency conflict'; end if;
    return v_event.metadata || jsonb_build_object('idempotent',true);
  end if;
  if not public.oneforall_provider_control_open('provider_job_actions')
    or not public.oneforall_release_open(v_old.service_key,'quote') then raise exception 'Quote revisions are not released'; end if;
  begin
    v_low := (p_payload->>'quote_low')::numeric;
    v_high := (p_payload->>'quote_high')::numeric;
    v_expected := (p_payload->>'expected_version')::integer;
    v_date := (p_payload->>'earliest_availability')::date;
  exception when others then raise exception 'Valid quote values and version are required'; end;
  if v_expected<>v_old.version or v_low<=0 or v_high<v_low
    or v_date < (now() at time zone 'Australia/Melbourne')::date then raise exception 'Quote changed or values are invalid'; end if;
  select * into v_job from public.jobs where id=v_old.job_id;
  if not found or v_job.status<>'published' then raise exception 'Canonical request unavailable'; end if;
  if not public.oneforall_exact_worker_eligible_v2(
    v_actor,v_old.attending_worker_id,v_old.service_key,v_old.selected_scope_ids,
    ((greatest(v_date,coalesce(v_job.preferred_date,v_date))::timestamp+time '12:00') at time zone 'Australia/Melbourne'),
    v_job.suburb,v_job.requested_units,v_job.requested_value,v_old.provider_assertion_id,false,true
  ) then raise exception 'Exact provider and worker eligibility changed'; end if;
  insert into public.interest_requests (
    job_id,job_title,customer_id,tradie_id,tradie_name,tradie_business,quote_low,quote_high,
    earliest_availability,message,status,response_deadline,service_key,selected_scope_ids,
    attending_worker_id,attending_worker_display_name,substitution_disclosed,provider_assertion_id,
    invitation_id,idempotency_key,created_by,revision_number,version,quote_terms,supersedes_quote_id
  ) values (
    v_old.job_id,v_old.job_title,v_old.customer_id,v_old.tradie_id,v_old.tradie_name,v_old.tradie_business,v_low,v_high,
    v_date,left(btrim(coalesce(p_payload->>'message','')),1000),'pending',v_old.response_deadline,v_old.service_key,v_old.selected_scope_ids,
    v_old.attending_worker_id,v_old.attending_worker_display_name,true,v_old.provider_assertion_id,
    v_old.invitation_id,v_key,v_actor,v_old.revision_number+1,1,left(btrim(coalesce(p_payload->>'quote_terms','')),2000),v_old.id
  ) returning * into v_new;
  update public.interest_requests set status='superseded',superseded_by_quote_id=v_new.id,version=version+1 where id=v_old.id;
  insert into public.marketplace_workflow_events
    (event_type,resource_type,resource_id,job_id,customer_id,provider_id,actor_id,idempotency_key,intent_fingerprint,metadata)
  values ('quote_revised','quote',v_old.id,v_old.job_id,v_old.customer_id,v_actor,v_actor,v_key,v_fingerprint,
    jsonb_build_object('quote_id',v_new.id,'revision_number',v_new.revision_number));
  insert into public.notifications (user_id,type,title,body,link,created_by)
  values (v_old.customer_id,'quote_revised','Quote updated','Review and approve the latest provider quote.','/bookings',v_actor);
  return jsonb_build_object('quote_id',v_new.id,'revision_number',v_new.revision_number,'status','pending');
end $$;

create or replace function public.oneforall_record_external_payment(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_role text;
  v_key text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_fingerprint text := public.oneforall_intent_fingerprint(p_payload);
  v_existing public.external_payment_confirmations%rowtype;
  v_amount numeric;
  v_paid_at timestamptz;
  v_method text := p_payload->>'payment_method';
begin
  if v_actor is null or char_length(v_key)<8 then raise exception 'Authentication and idempotency key required'; end if;
  select * into v_booking from public.bookings where id=(p_payload->>'booking_id')::uuid for update;
  if not found then raise exception 'Booking unavailable'; end if;
  if v_actor=v_booking.customer_id then v_role:='customer';
  elsif v_actor=v_booking.provider_id then v_role:='provider';
  else raise exception 'Booking participant required'; end if;
  if v_booking.state not in ('in_progress','completed') then raise exception 'Payment can be recorded only after work starts'; end if;
  begin v_amount:=(p_payload->>'amount')::numeric; v_paid_at:=(p_payload->>'paid_at')::timestamptz;
  exception when others then raise exception 'Valid amount and payment time required'; end;
  if v_amount<=0 or v_amount>1000000 or v_paid_at>now()+interval '5 minutes'
    or v_method not in ('cash','bank_transfer','card_external','other_external') then raise exception 'External payment details are invalid'; end if;
  select * into v_existing from public.external_payment_confirmations where booking_id=v_booking.id and participant_role=v_role;
  if found then
    if v_existing.idempotency_key=v_key and v_existing.intent_fingerprint=v_fingerprint then
      return jsonb_build_object('confirmation_id',v_existing.id,'status',v_existing.status,'idempotent',true);
    end if;
    raise exception 'This participant already recorded payment; contact support to correct it';
  end if;
  insert into public.external_payment_confirmations
    (booking_id,customer_id,provider_id,participant_role,actor_id,amount,payment_method,paid_at,note,idempotency_key,intent_fingerprint)
  values (v_booking.id,v_booking.customer_id,v_booking.provider_id,v_role,v_actor,v_amount,v_method,v_paid_at,
    left(btrim(coalesce(p_payload->>'note','')),500),v_key,v_fingerprint)
  returning * into v_existing;
  insert into public.marketplace_workflow_events
    (event_type,resource_type,resource_id,booking_id,job_id,customer_id,provider_id,actor_id,idempotency_key,intent_fingerprint,metadata)
  values ('payment_confirmed','external_payment_confirmation',v_existing.id,v_booking.id,v_booking.job_id,
    v_booking.customer_id,v_booking.provider_id,v_actor,v_key,v_fingerprint,
    jsonb_build_object('participant_role',v_role,'amount',v_amount,'currency','AUD','bank_verified',false));
  return jsonb_build_object('confirmation_id',v_existing.id,'participant_role',v_role,'bank_verified',false);
end $$;

create or replace function public.oneforall_propose_recurring_schedule(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_booking public.bookings%rowtype; v_series public.recurring_series%rowtype;
  v_key text:=btrim(coalesce(p_payload->>'idempotency_key','')); v_fingerprint text:=public.oneforall_intent_fingerprint(p_payload);
  v_frequency text:=p_payload->>'frequency'; v_weekday integer; v_time time;
begin
  if v_actor is null or char_length(v_key)<8 then raise exception 'Authentication and idempotency key required'; end if;
  select * into v_booking from public.bookings where id=(p_payload->>'booking_id')::uuid for update;
  if not found or v_actor not in (v_booking.customer_id,v_booking.provider_id) then raise exception 'Booking participant required'; end if;
  if v_booking.state not in ('accepted','scheduled','in_progress','completed')
    or not public.oneforall_release_open(v_booking.service_key,'recurrence') then raise exception 'Recurring schedules are not released'; end if;
  if v_frequency not in ('weekly','fortnightly','monthly') then raise exception 'Choose a supported frequency'; end if;
  begin v_weekday:=(p_payload->>'preferred_weekday')::integer; v_time:=(p_payload->>'preferred_time')::time;
  exception when others then raise exception 'Valid Ballarat weekday and time required'; end;
  select * into v_series from public.recurring_series where proposed_by=v_actor and source_booking_id=v_booking.id and idempotency_key=v_key;
  if found then
    if v_series.intent_fingerprint<>v_fingerprint then raise exception 'Recurring schedule idempotency conflict'; end if;
    return jsonb_build_object('series_id',v_series.id,'state',v_series.state,'idempotent',true);
  end if;
  if exists (select 1 from public.recurring_series where source_booking_id=v_booking.id and state in ('proposed','active','paused')) then
    raise exception 'A recurring schedule already exists for this booking';
  end if;
  insert into public.recurring_series
    (customer_id,provider_id,service_key,selected_scope_ids,state,source_booking_id,frequency,preferred_weekday,preferred_time,
     proposed_by,customer_confirmed_at,provider_confirmed_at,idempotency_key,intent_fingerprint)
  values (v_booking.customer_id,v_booking.provider_id,v_booking.service_key,v_booking.selected_scope_ids,'proposed',v_booking.id,
    v_frequency,v_weekday,v_time,v_actor,case when v_actor=v_booking.customer_id then now() end,
    case when v_actor=v_booking.provider_id then now() end,v_key,v_fingerprint)
  returning * into v_series;
  insert into public.marketplace_workflow_events
    (event_type,resource_type,resource_id,booking_id,job_id,customer_id,provider_id,actor_id,idempotency_key,intent_fingerprint,metadata)
  values ('recurrence_proposed','recurring_series',v_series.id,v_booking.id,v_booking.job_id,v_booking.customer_id,v_booking.provider_id,
    v_actor,v_key,v_fingerprint,jsonb_build_object('frequency',v_frequency,'preferred_weekday',v_weekday,'preferred_time',v_time));
  return jsonb_build_object('series_id',v_series.id,'state','proposed');
end $$;

create or replace function public.oneforall_confirm_recurring_schedule(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_series public.recurring_series%rowtype; v_key text:=btrim(coalesce(p_payload->>'idempotency_key',''));
  v_fingerprint text:=public.oneforall_intent_fingerprint(p_payload); v_expected integer; v_event public.marketplace_workflow_events%rowtype;
begin
  if v_actor is null or char_length(v_key)<8 then raise exception 'Authentication and idempotency key required'; end if;
  begin v_expected:=(p_payload->>'expected_version')::integer; exception when others then raise exception 'Expected version required'; end;
  select * into v_event from public.marketplace_workflow_events
  where actor_id=v_actor and event_type='recurrence_confirmed' and resource_id=(p_payload->>'series_id')::uuid and idempotency_key=v_key;
  if found then
    if v_event.intent_fingerprint<>v_fingerprint then raise exception 'Recurring confirmation idempotency conflict'; end if;
    return v_event.metadata || jsonb_build_object('series_id',v_event.resource_id,'idempotent',true);
  end if;
  select * into v_series from public.recurring_series where id=(p_payload->>'series_id')::uuid for update;
  if not found or v_actor not in (v_series.customer_id,v_series.provider_id) or v_series.state<>'proposed'
    or v_series.version<>v_expected then raise exception 'Recurring proposal changed or unavailable'; end if;
  if not public.oneforall_release_open(v_series.service_key,'recurrence') then raise exception 'Recurring schedules are not released'; end if;
  update public.recurring_series set
    customer_confirmed_at=case when v_actor=v_series.customer_id then now() else customer_confirmed_at end,
    provider_confirmed_at=case when v_actor=v_series.provider_id then now() else provider_confirmed_at end,
    state=case when (v_actor=v_series.customer_id or customer_confirmed_at is not null)
      and (v_actor=v_series.provider_id or provider_confirmed_at is not null) then 'active' else 'proposed' end,
    version=version+1 where id=v_series.id returning * into v_series;
  insert into public.marketplace_workflow_events
    (event_type,resource_type,resource_id,booking_id,customer_id,provider_id,actor_id,idempotency_key,intent_fingerprint,metadata)
  values ('recurrence_confirmed','recurring_series',v_series.id,v_series.source_booking_id,v_series.customer_id,v_series.provider_id,
    v_actor,v_key,v_fingerprint,jsonb_build_object('state',v_series.state,'version',v_series.version));
  return jsonb_build_object('series_id',v_series.id,'state',v_series.state,'version',v_series.version);
end $$;

create or replace function public.oneforall_rebook(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_booking public.bookings%rowtype; v_job public.jobs%rowtype; v_new public.jobs%rowtype;
  v_key text:=btrim(coalesce(p_payload->>'idempotency_key','')); v_fingerprint text:=public.oneforall_intent_fingerprint(p_payload);
  v_date date;
begin
  if v_actor is null or char_length(v_key)<8 then raise exception 'Authentication and idempotency key required'; end if;
  select * into v_booking from public.bookings where id=(p_payload->>'booking_id')::uuid;
  if not found or v_booking.customer_id<>v_actor or v_booking.state<>'completed' then raise exception 'Only a completed customer booking can be rebooked'; end if;
  if not public.oneforall_release_open(v_booking.service_key,'request') then raise exception 'This service is not accepting requests'; end if;
  select * into v_new from public.jobs where customer_id=v_actor and request_idempotency_key=v_key;
  if found then
    if v_new.request_fingerprint<>v_fingerprint then raise exception 'Rebooking idempotency conflict'; end if;
    return jsonb_build_object('job_id',v_new.id,'status',v_new.status,'idempotent',true);
  end if;
  begin v_date:=(p_payload->>'preferred_date')::date; exception when others then raise exception 'Preferred date required'; end;
  if v_date<(now() at time zone 'Australia/Melbourne')::date then raise exception 'Preferred date cannot be in the past'; end if;
  select * into v_job from public.jobs where id=v_booking.job_id;
  insert into public.jobs (
    customer_id,title,description,category_slug,category_name,suburb,preferred_date,urgency,request_recurrence,intake_snapshot,
    service_key,pathway,selected_scope_ids,scope_decision,hazard_screen_status,request_idempotency_key,request_fingerprint,
    policy_version,status,created_by,requested_units,requested_value,rebooked_from_booking_id
  ) values (
    v_actor,v_job.title,left(btrim(coalesce(p_payload->>'notes',v_job.description,'')),3000),v_job.category_slug,v_job.category_name,v_job.suburb,
    v_date,coalesce(nullif(p_payload->>'urgency',''),'flexible'),'once',v_job.intake_snapshot,v_job.service_key,v_job.pathway,
    v_job.selected_scope_ids,'allowed','passed',v_key,v_fingerprint,v_job.policy_version,'submitted',v_actor,
    v_job.requested_units,v_job.requested_value,v_booking.id
  ) returning * into v_new;
  insert into public.request_events (job_id,customer_id,provider_id,actor_id,from_state,to_state,idempotency_key,intent_fingerprint,metadata)
  values (v_new.id,v_actor,v_booking.provider_id,v_actor,'completed','submitted',v_key,v_fingerprint,
    jsonb_build_object('rebooked_from_booking_id',v_booking.id));
  insert into public.marketplace_workflow_events
    (event_type,resource_type,resource_id,booking_id,job_id,customer_id,provider_id,actor_id,idempotency_key,intent_fingerprint)
  values ('rebooking_created','job',v_new.id,v_booking.id,v_new.id,v_actor,v_booking.provider_id,v_actor,v_key,v_fingerprint);
  return jsonb_build_object('job_id',v_new.id,'status','submitted');
end $$;

create or replace function public.oneforall_create_provider_booking_link(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_key text:=btrim(coalesce(p_payload->>'idempotency_key',''));
  v_fingerprint text:=public.oneforall_intent_fingerprint(p_payload); v_service public.service_definitions%rowtype;
  v_scopes text[]; v_token text:=gen_random_uuid()::text||replace(gen_random_uuid()::text,'-',''); v_link public.provider_booking_links%rowtype;
begin
  if v_actor is null or char_length(v_key)<8 then raise exception 'Authentication and idempotency key required'; end if;
  if not public.oneforall_provider_control_open('provider_job_actions') then raise exception 'Provider booking links are not released'; end if;
  select * into v_service from public.service_definitions where service_key=p_payload->>'service_key';
  if not found or not public.oneforall_release_open(v_service.service_key,'quote') then raise exception 'Service booking links are not released'; end if;
  select coalesce(array_agg(value),'{}'::text[]) into v_scopes from jsonb_array_elements_text(coalesce(p_payload->'scope_ids','[]'::jsonb));
  if cardinality(v_scopes)=0 or not (v_service.scope_ids@>v_scopes) then raise exception 'Choose configured service scopes'; end if;
  if not exists (select 1 from public.provider_offerings where provider_id=v_actor and service_key=v_service.service_key
    and review_status='approved' and active and available and not reverification_required and approved_scope@>v_scopes) then
    raise exception 'Approved active offering required'; end if;
  select * into v_link from public.provider_booking_links where provider_id=v_actor and service_key=v_service.service_key and idempotency_key=v_key;
  if found then
    if v_link.intent_fingerprint<>v_fingerprint then raise exception 'Booking link idempotency conflict'; end if;
    return jsonb_build_object('link_id',v_link.id,'status',v_link.status,'idempotent',true);
  end if;
  insert into public.provider_booking_links
    (provider_id,service_key,approved_scope_ids,token_hash,label,expires_at,idempotency_key,intent_fingerprint)
  values (v_actor,v_service.service_key,v_scopes,encode(extensions.digest(v_token,'sha256'),'hex'),left(btrim(coalesce(p_payload->>'label','')),100),
    case when nullif(p_payload->>'expires_at','') is null then null else (p_payload->>'expires_at')::timestamptz end,v_key,v_fingerprint)
  returning * into v_link;
  insert into public.marketplace_workflow_events
    (event_type,resource_type,resource_id,provider_id,actor_id,idempotency_key,intent_fingerprint,metadata)
  values ('booking_link_created','provider_booking_link',v_link.id,v_actor,v_actor,v_key,v_fingerprint,jsonb_build_object('service_key',v_service.service_key));
  return jsonb_build_object('link_id',v_link.id,'token',v_token,'status','active');
end $$;

create or replace function public.oneforall_resolve_provider_booking_link(p_payload jsonb)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select jsonb_build_object(
    'token',p_payload->>'token','service_key',link.service_key,'scope_ids',link.approved_scope_ids,
    'provider_display_name',assertion.display_name,'status',link.status,
    'public_release_enabled',service.public_release_enabled,'quote_enabled',service.quote_enabled,'expires_at',link.expires_at
  ) from public.provider_booking_links link
  join public.service_definitions service on service.service_key=link.service_key
  join lateral (
    select display_name from public.provider_public_assertions assertion
    where assertion.provider_id=link.provider_id and assertion.status='active' and assertion.superseded_by_assertion_id is null
      and assertion.valid_through>=current_date and assertion.approved_service_ids@>array[link.service_key]
    order by assertion.evidence_checked_date desc limit 1
  ) assertion on true
  where link.token_hash=encode(extensions.digest(coalesce(p_payload->>'token',''),'sha256'),'hex') and link.status='active'
    and (link.expires_at is null or link.expires_at>now()) and service.publicly_visible and service.public_release_enabled and service.quote_enabled
  limit 1),'{}'::jsonb);
$$;

revoke execute on function public.oneforall_attach_request_media(jsonb) from public, anon;
revoke execute on function public.oneforall_revise_quote(jsonb) from public, anon;
revoke execute on function public.oneforall_record_external_payment(jsonb) from public, anon;
revoke execute on function public.oneforall_propose_recurring_schedule(jsonb) from public, anon;
revoke execute on function public.oneforall_confirm_recurring_schedule(jsonb) from public, anon;
revoke execute on function public.oneforall_rebook(jsonb) from public, anon;
revoke execute on function public.oneforall_create_provider_booking_link(jsonb) from public, anon;
revoke execute on function public.oneforall_resolve_provider_booking_link(jsonb) from public;
grant execute on function public.oneforall_attach_request_media(jsonb) to authenticated;
grant execute on function public.oneforall_revise_quote(jsonb) to authenticated;
grant execute on function public.oneforall_record_external_payment(jsonb) to authenticated;
grant execute on function public.oneforall_propose_recurring_schedule(jsonb) to authenticated;
grant execute on function public.oneforall_confirm_recurring_schedule(jsonb) to authenticated;
grant execute on function public.oneforall_rebook(jsonb) to authenticated;
grant execute on function public.oneforall_create_provider_booking_link(jsonb) to authenticated;
grant execute on function public.oneforall_resolve_provider_booking_link(jsonb) to anon, authenticated;

comment on table public.external_payment_confirmations is
  'Participant statements about direct external payment. Never bank-, payout- or processor-verified.';
comment on table public.provider_booking_links is
  'Opaque provider-owned request links; resolution exposes only an active bounded public assertion.';

-- Canonical demand values are required by exact provider eligibility. They are
-- planning inputs only and never a charge or price promise.
alter table public.service_definitions
  add column if not exists request_unit_label text not null default 'hours',
  add column if not exists minimum_request_units numeric not null default 0.5,
  add column if not exists maximum_request_units numeric not null default 80,
  add column if not exists maximum_request_value numeric not null default 1000000;
update public.service_definitions set
  request_unit_label=case
    when category_slug='rubbish-removal' then 'loads'
    when category_slug='pest-control' then 'visits'
    when category_slug in ('handyman','carpentry','not-sure') then 'tasks'
    else 'hours' end,
  minimum_request_units=case when category_slug in ('rubbish-removal','pest-control','handyman','carpentry','not-sure','moving-packing') then 1 else 0.5 end,
  maximum_request_units=case when category_slug='rubbish-removal' then 10 when category_slug='pest-control' then 5 when category_slug in ('handyman','carpentry','not-sure') then 30 else 80 end;

create or replace function public.oneforall_submit_request_v2(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_service public.service_definitions%rowtype; v_decision text; v_reason text; v_scopes text[];
  v_idempotency text:=btrim(coalesce(p_payload->>'idempotency_key','')); v_fingerprint text:=md5((coalesce(p_payload,'{}'::jsonb)-'idempotency_key')::text);
  v_existing public.jobs%rowtype; v_job public.jobs%rowtype; v_suburb text:=left(btrim(coalesce(p_payload->>'suburb','')),100);
  v_urgency text:=coalesce(nullif(p_payload->>'urgency',''),'flexible'); v_recurrence text:=coalesce(nullif(p_payload->>'recurrence',''),'once');
  v_preferred_date date; v_safety text:=coalesce(nullif(p_payload->>'safety_considerations',''),'none_declared');
  v_units numeric; v_value numeric; v_link public.provider_booking_links%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if octet_length(coalesce(p_payload,'{}'::jsonb)::text)>16384 then raise exception 'Request payload is too large'; end if;
  if char_length(v_idempotency)<8 or char_length(v_idempotency)>120 then raise exception 'Valid idempotency key required'; end if;
  select * into v_existing from public.jobs where customer_id=v_actor and request_idempotency_key=v_idempotency;
  if found then
    if v_existing.request_fingerprint<>v_fingerprint then raise exception 'Idempotency key was already used with a different request'; end if;
    return jsonb_build_object('id',v_existing.id,'status',v_existing.status,'idempotent',true);
  end if;
  if not exists (select 1 from public.app_users where id=v_actor and account_type='customer') then raise exception 'Customer account required'; end if;
  select * into v_service from public.service_definitions where service_key=p_payload->>'service_key';
  if not found or not public.oneforall_release_open(v_service.service_key,'request') then raise exception 'Service requests are not released'; end if;
  if v_suburb='' then raise exception 'Service suburb is required'; end if;
  if v_urgency not in ('flexible','this_week','urgent') or v_recurrence not in ('once','weekly','fortnightly','monthly')
    or v_safety not in ('none_declared','considerations_present','prefer_not_to_say') then raise exception 'Invalid request preference'; end if;
  begin v_units:=(p_payload->>'requested_units')::numeric; v_value:=(p_payload->>'requested_value')::numeric;
  exception when others then raise exception 'Planning quantity and budget are required'; end;
  if v_units<v_service.minimum_request_units or v_units>v_service.maximum_request_units
    or v_value<=0 or v_value>v_service.maximum_request_value then raise exception 'Planning quantity or budget is outside the service bounds'; end if;
  select coalesce(array_agg(value),'{}'::text[]) into v_scopes from jsonb_array_elements_text(coalesce(p_payload->'selected_scope_ids','[]'::jsonb));
  if cardinality(v_scopes)=0 or not (v_service.scope_ids@>v_scopes) then raise exception 'Choose a valid configured service scope'; end if;
  if nullif(btrim(coalesce(p_payload->>'booking_link_token','')),'') is not null then
    select * into v_link from public.provider_booking_links link
    where link.token_hash=encode(extensions.digest(btrim(p_payload->>'booking_link_token'),'sha256'),'hex')
      and link.status='active' and (link.expires_at is null or link.expires_at>now());
    if not found or v_link.service_key<>v_service.service_key or not (v_link.approved_scope_ids@>v_scopes)
      or not public.oneforall_release_open(v_service.service_key,'quote') then
      raise exception 'Provider request link is unavailable for this service scope';
    end if;
    if not exists (
      select 1 from public.provider_public_assertions assertion
      where assertion.provider_id=v_link.provider_id and assertion.status='active'
        and assertion.superseded_by_assertion_id is null and assertion.valid_through>=current_date
        and assertion.approved_service_ids@>array[v_service.service_key]
    ) then raise exception 'Provider request link is not currently eligible'; end if;
  end if;
  if nullif(p_payload->>'preferred_date','') is not null then
    v_preferred_date:=(p_payload->>'preferred_date')::date;
    if v_preferred_date<(now() at time zone 'Australia/Melbourne')::date then raise exception 'Preferred date cannot be in the past'; end if;
  end if;
  if v_service.pathway='scheduled_or_recurring' and v_preferred_date is null then raise exception 'Preferred date is required'; end if;
  if v_service.pathway<>'scheduled_or_recurring' then v_recurrence:='once'; end if;
  select classified.decision,classified.reason into v_decision,v_reason from public.oneforall_classify_request(v_service.service_key,p_payload) classified;
  if v_decision='blocked' then raise exception 'Request is restricted: %',v_reason; end if;
  insert into public.jobs (
    customer_id,title,description,category_slug,category_name,suburb,preferred_date,urgency,request_recurrence,intake_snapshot,
    service_key,pathway,selected_scope_ids,scope_decision,hazard_screen_status,private_review_reason,request_idempotency_key,
    request_fingerprint,policy_version,status,created_by,requested_units,requested_value,indicative_low,indicative_high,
    requested_provider_id,provider_booking_link_id
  ) values (
    v_actor,v_service.name,left(btrim(coalesce(p_payload->>'scope_description','')),3000),v_service.category_slug,v_service.name,v_suburb,
    v_preferred_date,v_urgency,v_recurrence,jsonb_build_object(
      'recurrence',v_recurrence,'reported_pest',left(btrim(coalesce(p_payload->>'reported_pest','')),120),
      'observed_signs',left(btrim(coalesce(p_payload->>'observed_signs','')),2000),'safety_considerations',v_safety,
      'adult_scope_confirmed',coalesce((p_payload->>'adult_scope_confirmed')::boolean,false),
      'painting_property_era',left(coalesce(p_payload->>'painting_property_era',''),30),
      'painting_surface_hazard',left(coalesce(p_payload->>'painting_surface_hazard',''),30),
      'painting_access_height',left(coalesce(p_payload->>'painting_access_height',''),30),
      'request_unit_label',v_service.request_unit_label,'requested_units',v_units,'requested_value',v_value
    ),v_service.service_key,v_service.pathway,v_scopes,v_decision,
    case when v_decision='manual_review' then 'manual_review' else 'passed' end,
    case when v_decision='manual_review' then v_reason end,v_idempotency,v_fingerprint,v_service.policy_version,
    case when v_decision='manual_review' then 'manual_review' else 'submitted' end,v_actor,v_units,v_value,null,null,
    v_link.provider_id,v_link.id
  ) returning * into v_job;
  insert into public.request_events (job_id,customer_id,provider_id,actor_id,from_state,to_state,idempotency_key,metadata)
  values (v_job.id,v_actor,v_link.provider_id,v_actor,'none',v_job.status,v_idempotency,
    jsonb_build_object('scope_decision',v_decision,'reason',v_reason,'requested_units',v_units,'requested_value',v_value,
      'provider_booking_link_id',v_link.id));
  return jsonb_build_object('id',v_job.id,'status',v_job.status,'scope_decision',v_decision);
end $$;

revoke execute on function public.oneforall_submit_request(jsonb) from authenticated;
revoke execute on function public.oneforall_submit_request_v2(jsonb) from public,anon;
grant execute on function public.oneforall_submit_request_v2(jsonb) to authenticated;
