-- OneForAll seamless provider experience.
-- The workspace UI can be deployed independently. Every consequential
-- provider capability introduced here is fail-closed and remains off.

-- ---------------------------------------------------------------------------
-- Independent feature controls. Service-level onboarding/quote/booking flags
-- remain authoritative as an additional gate.
-- ---------------------------------------------------------------------------
create table if not exists public.provider_feature_controls (
  id boolean primary key default true check (id),
  provider_workspace_visible boolean not null default true,
  application_writes_enabled boolean not null default false,
  sensitive_uploads_enabled boolean not null default false,
  hybrid_checks_enabled boolean not null default false,
  transactional_email_enabled boolean not null default false,
  provider_job_actions_enabled boolean not null default false,
  updated_by uuid references auth.users (id),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
insert into public.provider_feature_controls (id) values (true) on conflict (id) do nothing;
alter table public.provider_feature_controls enable row level security;
drop policy if exists "provider controls public read" on public.provider_feature_controls;
create policy "provider controls public read" on public.provider_feature_controls
  for select to anon, authenticated using (true);
revoke insert, update, delete on public.provider_feature_controls from anon, authenticated;
grant select on public.provider_feature_controls to anon, authenticated;

-- ---------------------------------------------------------------------------
-- One central resumable application. Operational approval remains on the
-- protected provider resources and cannot be granted by this record.
-- ---------------------------------------------------------------------------
create table if not exists public.provider_applications (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null unique references auth.users (id) on delete cascade,
  provider_type text not null default 'solo' check (provider_type in ('solo','team')),
  current_step integer not null default 1 check (current_step between 1 and 4),
  completed_steps integer[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','submitted','under_review','action_required','approved','rejected','suspended','expired')),
  provider_action_reason text,
  notification_email_enabled boolean not null default true,
  privacy_declaration_at timestamptz,
  accuracy_declaration_at timestamptz,
  eligibility_declaration_at timestamptz,
  terms_version text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  submission_idempotency_key text,
  submission_intent_fingerprint text,
  created_by uuid not null default auth.uid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.provider_applications enable row level security;
drop policy if exists "provider application private read" on public.provider_applications;
create policy "provider application private read" on public.provider_applications
  for select to authenticated using (provider_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.provider_applications from anon, authenticated;
grant select on public.provider_applications to authenticated;
drop trigger if exists provider_applications_updated on public.provider_applications;
create trigger provider_applications_updated before update on public.provider_applications
  for each row execute function public.set_updated_date();

create table if not exists public.provider_automation_events (
  id uuid primary key default gen_random_uuid(),
  evidence_id uuid not null references public.provider_evidence (id),
  provider_id uuid not null references auth.users (id) on delete cascade,
  result text not null check (result in ('passed','manual_review','failed')),
  vendor_reference_fingerprint text not null,
  created_date timestamptz not null default now()
);
alter table public.provider_automation_events enable row level security;
drop policy if exists "provider automation admin read" on public.provider_automation_events;
create policy "provider automation admin read" on public.provider_automation_events
  for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.provider_automation_events from anon, authenticated;
grant select on public.provider_automation_events to authenticated;
drop trigger if exists provider_automation_events_immutable on public.provider_automation_events;
create trigger provider_automation_events_immutable before update or delete on public.provider_automation_events
  for each row execute function public.oneforall_reject_immutable_mutation();

alter table public.tradie_profiles
  add column if not exists provider_type text not null default 'solo' check (provider_type in ('solo','team')),
  add column if not exists business_email text,
  add column if not exists contact_phone text,
  add column if not exists weekly_availability jsonb not null default '{}'::jsonb,
  add column if not exists timezone text not null default 'Australia/Melbourne';

alter table public.provider_workers
  add column if not exists submission_status text not null default 'draft' check (submission_status in ('draft','submitted','under_review','changes_required')),
  add column if not exists provider_action_reason text,
  add column if not exists submitted_at timestamptz;

alter table public.provider_offerings
  add column if not exists requested_selected boolean not null default true,
  add column if not exists requested_scope_ids text[] not null default '{}',
  add column if not exists requested_coverage_suburbs text[] not null default '{}',
  add column if not exists requested_availability_days text[] not null default '{}',
  add column if not exists requested_capacity numeric,
  add column if not exists requested_minimum_units numeric,
  add column if not exists requested_minimum_job_value numeric,
  add column if not exists requested_minimum_notice_hours numeric,
  add column if not exists requested_delivery_pathway text,
  add column if not exists requested_labour_mode text check (requested_labour_mode in ('sole_provider','employees','subcontractors','mixed')),
  add column if not exists submission_status text not null default 'draft' check (submission_status in ('draft','submitted','under_review','changes_required')),
  add column if not exists provider_action_reason text,
  add column if not exists submitted_at timestamptz;

alter table public.provider_evidence
  add column if not exists submitted_service_keys text[] not null default '{}',
  add column if not exists document_original_name text,
  add column if not exists document_mime_type text,
  add column if not exists document_size_bytes bigint,
  add column if not exists reference_number text,
  add column if not exists issuer_name text,
  add column if not exists issued_date date,
  add column if not exists automation_status text not null default 'not_started' check (automation_status in ('not_started','pending_configuration','running','passed','manual_review','failed')),
  add column if not exists automation_checked_at timestamptz,
  add column if not exists provider_action_reason text;

-- Legacy externally reachable URLs are never copied into the new private
-- bucket. They are explicitly queued for human review before future use.
update public.provider_evidence set
  submission_status = 'changes_required',
  review_status = case when review_status = 'verified' then 'pending' else review_status end,
  automation_status = 'manual_review',
  provider_action_reason = 'A legacy document reference requires private resubmission and manual review.',
  version = version + 1
where document_path ~* '^https?://';

update public.provider_offerings offering set
  active = false,available = false,reverification_required = true,
  provider_action_reason = 'Legacy evidence requires manual review.',
  version = offering.version + 1
where exists (
  select 1 from public.provider_evidence evidence
  where evidence.provider_id = offering.provider_id and evidence.document_path ~* '^https?://'
);

alter table public.invitations
  alter column expires_at set default (now() + interval '12 hours');
alter table public.invitations
  add column if not exists scope_summary text,
  add column if not exists indicative_price_low numeric,
  add column if not exists indicative_price_high numeric,
  add column if not exists requested_units numeric,
  add column if not exists requested_value numeric,
  add column if not exists safe_access_factors text[] not null default '{}',
  add column if not exists safe_safety_summary text,
  add column if not exists safe_photo_paths text[] not null default '{}';

alter table public.bookings
  add column if not exists confirmed_service_address text,
  add column if not exists confirmed_customer_contact text,
  add column if not exists confirmed_access_details text;

-- ---------------------------------------------------------------------------
-- Private evidence and reviewed pre-booking media. Neither bucket is public.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('provider-evidence','provider-evidence',false,10485760,array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('provider-request-media','provider-request-media',false,10485760,array['image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "provider evidence owner reviewer read" on storage.objects;
create policy "provider evidence owner reviewer read" on storage.objects for select to authenticated
  using (bucket_id = 'provider-evidence' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "provider evidence gated upload" on storage.objects;
create policy "provider evidence gated upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'provider-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.provider_feature_controls where id and application_writes_enabled and sensitive_uploads_enabled)
    and exists (
      select 1 from public.provider_evidence evidence
      where evidence.id::text = (storage.foldername(name))[2]
        and evidence.provider_id = auth.uid()
        and evidence.submission_status in ('draft','changes_required')
    )
  );

drop policy if exists "provider evidence owner cleanup" on storage.objects;
create policy "provider evidence owner cleanup" on storage.objects for delete to authenticated
  using (
    bucket_id = 'provider-evidence'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.provider_feature_controls where id and application_writes_enabled and sensitive_uploads_enabled)
    and exists (
      select 1 from public.provider_evidence evidence
      where evidence.id::text = (storage.foldername(name))[2]
        and evidence.provider_id = auth.uid()
        and evidence.submission_status in ('draft','changes_required')
    )
  );

drop policy if exists "matched provider reviewed media read" on storage.objects;
create policy "matched provider reviewed media read" on storage.objects for select to authenticated
  using (
    bucket_id = 'provider-request-media'
    and exists (
      select 1 from public.invitations invitation
      where invitation.tradie_id = auth.uid()
        and name = any(invitation.safe_photo_paths)
        and invitation.status = 'pending'
        and invitation.expires_at > now()
    )
  );

-- No evidence object path or provider-only record is customer-readable.
revoke insert, update, delete on public.provider_workers, public.provider_offerings,
  public.provider_evidence, public.tradie_profiles from anon, authenticated;

create or replace function public.oneforall_provider_control_open(p_control text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select case p_control
    when 'application_writes' then application_writes_enabled
    when 'sensitive_uploads' then sensitive_uploads_enabled
    when 'hybrid_checks' then hybrid_checks_enabled
    when 'transactional_email' then transactional_email_enabled
    when 'provider_job_actions' then provider_job_actions_enabled
    else false end
  from public.provider_feature_controls where id), false);
$$;

revoke execute on function public.oneforall_provider_control_open(text) from public, anon, authenticated;

create or replace function public.oneforall_ensure_worker_base_evidence(
  p_provider_id uuid,
  p_worker_id uuid,
  p_service_keys text[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type text;
  v_evidence_id uuid;
begin
  if auth.uid() is null or (auth.uid() <> p_provider_id and not public.is_admin())
    or not public.oneforall_provider_control_open('application_writes') then
    raise exception 'Provider application authority required';
  end if;
  if cardinality(coalesce(p_service_keys,'{}'::text[])) = 0
    or not exists (select 1 from public.provider_workers where id = p_worker_id and provider_id = p_provider_id) then return; end if;
  foreach v_type in array array['worker_identity','worker_relationship'] loop
    select id into v_evidence_id from public.provider_evidence
    where provider_id = p_provider_id and worker_id = p_worker_id and evidence_type = v_type
      and superseded_at is null order by created_date desc limit 1;
    if v_evidence_id is null then
      insert into public.provider_evidence (
        provider_id,subject_type,worker_id,evidence_type,submitted_service_key,
        submitted_service_keys,submitted_scope_ids,submission_status,review_status,automation_status
      ) values (
        p_provider_id,'worker',p_worker_id,v_type,p_service_keys[1],p_service_keys,
        array['*'],'draft','pending','not_started'
      );
    else
      update public.provider_evidence set submitted_service_key = p_service_keys[1],submitted_service_keys = p_service_keys,
        version = version + 1 where id = v_evidence_id and review_status <> 'verified';
    end if;
    v_evidence_id := null;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resumable application operations. They can prepare private review records,
-- but never write verified/approved/active/provider-standing state.
-- ---------------------------------------------------------------------------
create or replace function public.oneforall_start_provider_application(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_type text := coalesce(nullif(p_payload->>'provider_type',''),'solo');
  v_name text;
  v_application public.provider_applications%rowtype;
  v_profile public.tradie_profiles%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if v_type not in ('solo','team') then raise exception 'Choose solo provider or team'; end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-application:' || v_actor::text, 0));
  select * into v_application from public.provider_applications where provider_id = v_actor;
  if found then return jsonb_build_object('application',to_jsonb(v_application),'idempotent',true); end if;
  if not public.oneforall_provider_control_open('application_writes') then raise exception 'Provider applications are not open yet'; end if;
  if not exists (select 1 from public.service_definitions where provider_onboarding_enabled and public_release_enabled) then
    raise exception 'No provider service is open for applications';
  end if;
  select coalesce(nullif(btrim(full_name),''),'OneForAll provider') into v_name from public.app_users where id = v_actor;
  select * into v_profile from public.tradie_profiles where user_id = v_actor order by created_date limit 1 for update;
  if not found then
    insert into public.tradie_profiles (
      user_id,full_name,provider_type,open_to_work,verified,provider_standing,created_by
    ) values (
      v_actor,v_name,v_type,false,false,'inactive',v_actor
    ) returning * into v_profile;
  else
    update public.tradie_profiles set provider_type = v_type, open_to_work = false
    where id = v_profile.id returning * into v_profile;
  end if;
  insert into public.provider_workers (
    provider_id,display_name,legal_name,relationship_type,active,identity_verified,
    relationship_verified,review_status,submission_status
  )
  select v_actor,v_name,v_name,'owner',false,false,false,'draft','draft'
  where not exists (
    select 1 from public.provider_workers where provider_id = v_actor and relationship_type in ('owner','director')
  );
  insert into public.provider_applications (provider_id,provider_type,created_by)
  values (v_actor,v_type,v_actor) returning * into v_application;
  update public.app_users set account_type = 'tradie' where id = v_actor;
  return jsonb_build_object('application',to_jsonb(v_application));
end;
$$;

create or replace function public.oneforall_save_provider_worker(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_application public.provider_applications%rowtype;
  v_worker public.provider_workers%rowtype;
  v_worker_id uuid := nullif(p_payload->>'worker_id','')::uuid;
  v_name text := left(btrim(coalesce(p_payload->>'display_name','')),120);
  v_relationship text := p_payload->>'relationship_type';
  v_requirement jsonb;
  v_services text[];
  v_evidence_services text[];
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not public.oneforall_provider_control_open('application_writes') then raise exception 'Provider application changes are not enabled'; end if;
  select * into v_application from public.provider_applications where provider_id = v_actor for update;
  if not found or v_application.provider_type <> 'team' or v_application.status not in ('draft','action_required') then
    raise exception 'An editable team application is required';
  end if;
  if char_length(v_name) < 2 or v_relationship not in ('director','employee','subcontractor') then
    raise exception 'Worker name and relationship are required';
  end if;
  if v_worker_id is null then
    insert into public.provider_workers (
      provider_id,display_name,legal_name,relationship_type,is_subcontractor,
      active,identity_verified,relationship_verified,subcontractor_separately_verified,
      review_status,submission_status
    ) values (
      v_actor,v_name,left(btrim(coalesce(p_payload->>'legal_name',v_name)),120),v_relationship,
      v_relationship = 'subcontractor',false,false,false,false,'draft','draft'
    ) returning * into v_worker;
  else
    select * into v_worker from public.provider_workers where id = v_worker_id and provider_id = v_actor for update;
    if not found or v_worker.relationship_type = 'owner' or v_worker.submission_status not in ('draft','changes_required') then
      raise exception 'This worker cannot be edited';
    end if;
    update public.provider_workers set display_name = v_name,
      legal_name = left(btrim(coalesce(p_payload->>'legal_name',v_name)),120),
      relationship_type = v_relationship,is_subcontractor = v_relationship = 'subcontractor',
      active = false,review_status = 'draft',submission_status = 'draft',version = version + 1
    where id = v_worker.id returning * into v_worker;
  end if;
  select coalesce(array_agg(service_key), '{}'::text[]) into v_services
  from public.provider_offerings where provider_id = v_actor and requested_selected;
  for v_requirement in
    select distinct on (requirement->>'evidence_type') requirement
    from public.service_definitions service
    cross join lateral jsonb_array_elements(service.evidence_requirements) requirement
    where service.service_key = any(v_services) and requirement->>'subject' = 'worker'
    order by requirement->>'evidence_type'
  loop
    select array_agg(distinct service.service_key order by service.service_key) into v_evidence_services
    from public.service_definitions service
    cross join lateral jsonb_array_elements(service.evidence_requirements) candidate
    where service.service_key = any(v_services)
      and candidate->>'subject' = 'worker'
      and candidate->>'evidence_type' = v_requirement->>'evidence_type';
    if not exists (
      select 1 from public.provider_evidence evidence
      where evidence.provider_id = v_actor and evidence.worker_id = v_worker.id
        and evidence.evidence_type = v_requirement->>'evidence_type' and evidence.superseded_at is null
    ) then
      insert into public.provider_evidence (
        provider_id,subject_type,worker_id,evidence_type,submitted_service_key,
        submitted_service_keys,submitted_scope_ids,submission_status,review_status,automation_status
      ) values (
        v_actor,'worker',v_worker.id,v_requirement->>'evidence_type',v_evidence_services[1],
        v_evidence_services,array['*'],'draft','pending','not_started'
      );
    end if;
  end loop;
  perform public.oneforall_ensure_worker_base_evidence(v_actor,v_worker.id,v_services);
  return jsonb_build_object('worker',to_jsonb(v_worker));
end;
$$;

create or replace function public.oneforall_attach_provider_evidence(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_application public.provider_applications%rowtype;
  v_evidence public.provider_evidence%rowtype;
  v_path text := btrim(coalesce(p_payload->>'document_path',''));
  v_mime text := p_payload->>'mime_type';
  v_size bigint;
  v_automation text;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not public.oneforall_provider_control_open('application_writes')
    or not public.oneforall_provider_control_open('sensitive_uploads') then
    raise exception 'Private document collection is not enabled';
  end if;
  select * into v_application from public.provider_applications where provider_id = v_actor;
  if not found or v_application.status not in ('draft','action_required') then raise exception 'An editable application is required'; end if;
  begin v_size := (p_payload->>'file_size')::bigint; exception when others then raise exception 'Valid document size required'; end;
  if v_mime not in ('image/jpeg','image/png','application/pdf') or v_size <= 0 or v_size > 10485760 then
    raise exception 'Use a PDF, JPG or PNG document smaller than 10 MB';
  end if;
  select * into v_evidence from public.provider_evidence
  where id = (p_payload->>'evidence_id')::uuid and provider_id = v_actor for update;
  if not found or v_evidence.review_status in ('verified','suspended') or v_evidence.superseded_at is not null then
    raise exception 'This evidence record cannot accept a document';
  end if;
  if v_path like '%://%' or v_path not like v_actor::text || '/' || v_evidence.id::text || '/%' then
    raise exception 'Private document path is invalid';
  end if;
  v_automation := case
    when public.oneforall_provider_control_open('hybrid_checks')
      and v_evidence.evidence_type in ('responsible_identity','worker_identity','abn_entity_match','victorian_electrical_contractor_registration','victorian_electrical_licence','victorian_plumbing_registration_or_licence','victorian_builder_registration_where_required','victorian_pest_licence')
    then 'running'
    when public.oneforall_provider_control_open('hybrid_checks') then 'manual_review'
    else 'pending_configuration' end;
  update public.provider_evidence set
    document_path = v_path,
    document_original_name = left(btrim(coalesce(p_payload->>'original_name','document')),180),
    document_mime_type = v_mime,
    document_size_bytes = v_size,
    submission_status = 'submitted',review_status = 'pending',
    automation_status = v_automation,automation_checked_at = null,
    provider_action_reason = null,version = version + 1
  where id = v_evidence.id returning * into v_evidence;
  return jsonb_build_object('evidence_id',v_evidence.id,'status',v_evidence.submission_status,'automation_status',v_evidence.automation_status);
end;
$$;

create or replace function public.oneforall_submit_provider_application(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_application public.provider_applications%rowtype;
  v_key text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_fingerprint text := public.oneforall_intent_fingerprint(p_payload);
begin
  if v_actor is null or char_length(v_key) < 8 then raise exception 'Authentication and idempotency key required'; end if;
  if not public.oneforall_provider_control_open('application_writes')
    or not public.oneforall_provider_control_open('sensitive_uploads') then
    raise exception 'Application submission and document collection are not enabled';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-application:' || v_actor::text, 0));
  select * into v_application from public.provider_applications where provider_id = v_actor for update;
  if not found then raise exception 'Provider application unavailable'; end if;
  if v_application.submission_idempotency_key = v_key then
    if v_application.submission_intent_fingerprint is distinct from v_fingerprint then raise exception 'Application submission idempotency conflict'; end if;
    return jsonb_build_object('application',to_jsonb(v_application),'idempotent',true);
  end if;
  if v_application.status not in ('draft','action_required') then raise exception 'This application cannot be submitted'; end if;
  if not (v_application.completed_steps @> array[1,2,3,4])
    or v_application.privacy_declaration_at is null
    or v_application.accuracy_declaration_at is null
    or v_application.eligibility_declaration_at is null then
    raise exception 'Complete all four application steps and declarations';
  end if;
  if not exists (select 1 from public.provider_offerings where provider_id = v_actor and requested_selected) then
    raise exception 'Choose at least one provider service';
  end if;
  if exists (
    select 1 from public.provider_offerings offering
    left join public.service_definitions service on service.service_key = offering.service_key
    where offering.provider_id = v_actor and offering.requested_selected
      and (service.service_key is null or not service.provider_onboarding_enabled or not service.public_release_enabled)
  ) then raise exception 'A selected service is no longer accepting applications'; end if;
  if exists (
    select 1 from public.provider_evidence evidence
    where evidence.provider_id = v_actor and evidence.superseded_at is null
      and exists (
        select 1 from public.provider_offerings offering
        where offering.provider_id = v_actor and offering.requested_selected
          and offering.service_key = any(evidence.submitted_service_keys)
      )
      and (evidence.document_path is null or evidence.submission_status not in ('submitted','under_review') or evidence.review_status in ('rejected','expired','suspended'))
  ) then raise exception 'Every required document must be submitted'; end if;
  if exists (
    select 1
    from public.provider_offerings offering
    join public.service_definitions service on service.service_key = offering.service_key
    cross join lateral jsonb_array_elements(service.evidence_requirements) requirement
    where offering.provider_id = v_actor and offering.requested_selected
      and (
        (requirement->>'subject' = 'provider' and not exists (
          select 1 from public.provider_evidence evidence
          where evidence.provider_id = v_actor and evidence.subject_type = 'provider'
            and evidence.evidence_type = requirement->>'evidence_type'
            and offering.service_key = any(evidence.submitted_service_keys)
            and evidence.superseded_at is null
        ))
        or
        (requirement->>'subject' = 'worker' and exists (
          select 1 from public.provider_workers worker
          where worker.provider_id = v_actor and not exists (
            select 1 from public.provider_evidence evidence
            where evidence.provider_id = v_actor and evidence.subject_type = 'worker'
              and evidence.worker_id = worker.id
              and evidence.evidence_type = requirement->>'evidence_type'
              and offering.service_key = any(evidence.submitted_service_keys)
              and evidence.superseded_at is null
          )
        ))
      )
  ) then raise exception 'The verification checklist is incomplete for a selected service or worker'; end if;
  if exists (
    select 1 from public.provider_workers worker
    cross join unnest(array['worker_identity','worker_relationship']) required(evidence_type)
    where worker.provider_id = v_actor and not exists (
      select 1 from public.provider_evidence evidence
      where evidence.provider_id = v_actor and evidence.worker_id = worker.id
        and evidence.evidence_type = required.evidence_type
        and evidence.superseded_at is null and evidence.document_path is not null
        and evidence.submission_status in ('submitted','under_review')
    )
  ) then raise exception 'Identity and business relationship evidence is required for every worker'; end if;
  update public.provider_workers set submission_status = 'under_review',review_status = 'under_review',submitted_at = now(),active = false
  where provider_id = v_actor and submission_status in ('draft','changes_required');
  update public.provider_offerings set submission_status = 'under_review',review_status = 'under_review',submitted_at = now(),active = false,available = false,reverification_required = true
  where provider_id = v_actor and requested_selected and review_status <> 'approved';
  update public.provider_evidence set submission_status = 'under_review'
  where provider_id = v_actor and submission_status = 'submitted' and review_status = 'pending';
  update public.provider_applications set status = 'submitted',submitted_at = now(),provider_action_reason = null,
    submission_idempotency_key = v_key,submission_intent_fingerprint = v_fingerprint
  where id = v_application.id returning * into v_application;
  insert into public.notifications (user_id,type,title,body,link,created_by)
  values (v_actor,'provider_application','Application received','Your provider application is under review.','/provider/apply',v_actor);
  return jsonb_build_object('application',to_jsonb(v_application));
end;
$$;


create or replace function public.oneforall_save_provider_application(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_application public.provider_applications%rowtype;
  v_profile public.tradie_profiles%rowtype;
  v_step integer;
  v_complete boolean := coalesce((p_payload->>'complete_step')::boolean,false);
  v_services text[] := '{}';
  v_coverage text[] := '{}';
  v_days text[] := '{}';
  v_service text;
  v_requirement jsonb;
  v_evidence_services text[];
  v_worker_id uuid;
  v_evidence_id uuid;
  v_name text;
  v_email text;
  v_suburb text;
  v_abn text;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not public.oneforall_provider_control_open('application_writes') then raise exception 'Provider application changes are not enabled'; end if;
  perform pg_advisory_xact_lock(hashtextextended('provider-application:' || v_actor::text, 0));
  select * into v_application from public.provider_applications where provider_id = v_actor for update;
  if not found or v_application.status not in ('draft','action_required') then raise exception 'This application is not editable'; end if;
  begin v_step := (p_payload->>'step')::integer; exception when others then raise exception 'Choose a valid application step'; end;
  if v_step not between 1 and 4 then raise exception 'Choose a valid application step'; end if;
  select * into v_profile from public.tradie_profiles where user_id = v_actor order by created_date limit 1 for update;
  if not found then raise exception 'Provider profile unavailable'; end if;

  if v_step = 1 then
    if coalesce(p_payload->>'provider_type',v_application.provider_type) not in ('solo','team') then raise exception 'Choose solo provider or team'; end if;
    v_name := left(btrim(coalesce(p_payload->>'full_name',v_profile.full_name,'')),120);
    v_email := left(btrim(coalesce(p_payload->>'business_email',v_profile.business_email,'')),200);
    v_suburb := left(btrim(coalesce(p_payload->>'suburb',v_profile.suburb,'')),100);
    v_abn := regexp_replace(coalesce(p_payload->>'abn',v_profile.abn,''),'[^0-9]','','g');
    if v_complete and (char_length(v_name) < 2 or char_length(v_suburb) < 2 or position('@' in v_email) < 2 or char_length(v_abn) <> 11) then
      raise exception 'Full name, business email, suburb and an 11-digit ABN are required';
    end if;
    update public.tradie_profiles set
      provider_type = coalesce(p_payload->>'provider_type',provider_type),
      full_name = v_name,
      business_name = left(btrim(coalesce(p_payload->>'business_name','')),160),
      abn = v_abn,
      business_email = v_email,
      contact_phone = left(btrim(coalesce(p_payload->>'mobile','')),40),
      suburb = v_suburb,
      open_to_work = false
    where id = v_profile.id;
    update public.provider_applications set provider_type = coalesce(p_payload->>'provider_type',provider_type) where id = v_application.id;
    update public.provider_workers set display_name = coalesce(nullif(v_name,''),display_name), legal_name = coalesce(nullif(v_name,''),legal_name)
    where provider_id = v_actor and relationship_type in ('owner','director') and review_status = 'draft';

  elsif v_step = 2 then
    select coalesce(array_agg(distinct btrim(value)) filter (where btrim(value) <> ''), '{}'::text[]) into v_services
    from jsonb_array_elements_text(coalesce(p_payload->'service_keys','[]'::jsonb));
    select coalesce(array_agg(distinct left(btrim(value),100)) filter (where btrim(value) <> ''), '{}'::text[]) into v_coverage
    from jsonb_array_elements_text(coalesce(p_payload->'coverage_suburbs','[]'::jsonb));
    select coalesce(array_agg(distinct lower(btrim(value))) filter (where lower(btrim(value)) = any(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])), '{}'::text[]) into v_days
    from jsonb_array_elements_text(coalesce(p_payload->'availability_days','[]'::jsonb));
    if exists (
      select 1 from unnest(v_services) requested
      left join public.service_definitions service on service.service_key = requested
      where service.service_key is null or not service.provider_onboarding_enabled or not service.public_release_enabled
    ) then raise exception 'One or more services are not open for provider applications'; end if;
    if v_complete and (cardinality(v_services) = 0 or cardinality(v_coverage) = 0 or cardinality(v_days) = 0) then
      raise exception 'Choose at least one service, coverage suburb and regular day';
    end if;
    update public.provider_offerings set requested_selected = false, submission_status = 'draft'
    where provider_id = v_actor and review_status <> 'approved' and not (service_key = any(v_services));
    foreach v_service in array v_services loop
      insert into public.provider_offerings (
        provider_id,service_key,requested_selected,requested_scope_ids,
        requested_coverage_suburbs,requested_availability_days,requested_delivery_pathway,
        requested_labour_mode,submission_status,review_status,active,available,reverification_required
      )
      select v_actor,service.service_key,true,service.scope_ids,v_coverage,v_days,service.pathway,
        case v_application.provider_type when 'solo' then 'sole_provider' else 'employees' end,
        'draft','draft',false,false,true
      from public.service_definitions service where service.service_key = v_service
      on conflict (provider_id,service_key) do update set
        requested_selected = true,
        requested_scope_ids = excluded.requested_scope_ids,
        requested_coverage_suburbs = excluded.requested_coverage_suburbs,
        requested_availability_days = excluded.requested_availability_days,
        requested_delivery_pathway = excluded.requested_delivery_pathway,
        requested_labour_mode = excluded.requested_labour_mode,
        submission_status = case when provider_offerings.review_status = 'approved' then provider_offerings.submission_status else 'draft' end,
        version = provider_offerings.version + 1;
    end loop;
    update public.tradie_profiles set service_areas = v_coverage,
      weekly_availability = jsonb_build_object('days',v_days,'timezone','Australia/Melbourne'),
      trade_categories = array(select distinct service.category_slug from public.service_definitions service where service.service_key = any(v_services))
    where id = v_profile.id;
    select id into v_worker_id from public.provider_workers
    where provider_id = v_actor and relationship_type in ('owner','director') order by created_date limit 1;
    for v_requirement in
      select distinct on (requirement->>'subject',requirement->>'evidence_type') requirement
      from public.service_definitions service
      cross join lateral jsonb_array_elements(service.evidence_requirements) requirement
      where service.service_key = any(v_services)
      order by requirement->>'subject',requirement->>'evidence_type'
    loop
      select array_agg(distinct service.service_key order by service.service_key) into v_evidence_services
      from public.service_definitions service
      cross join lateral jsonb_array_elements(service.evidence_requirements) candidate
      where service.service_key = any(v_services)
        and candidate->>'subject' = v_requirement->>'subject'
        and candidate->>'evidence_type' = v_requirement->>'evidence_type';
      select id into v_evidence_id from public.provider_evidence evidence
      where evidence.provider_id = v_actor
        and evidence.subject_type = v_requirement->>'subject'
        and evidence.worker_id is not distinct from case when v_requirement->>'subject' = 'worker' then v_worker_id else null end
        and evidence.evidence_type = v_requirement->>'evidence_type'
        and evidence.superseded_at is null
      order by evidence.created_date desc limit 1;
      if v_evidence_id is null then
        insert into public.provider_evidence (
          provider_id,subject_type,worker_id,evidence_type,submitted_service_key,
          submitted_service_keys,submitted_scope_ids,submission_status,review_status,automation_status
        ) values (
          v_actor,v_requirement->>'subject',case when v_requirement->>'subject' = 'worker' then v_worker_id else null end,
          v_requirement->>'evidence_type',v_evidence_services[1],v_evidence_services,array['*'],'draft','pending','not_started'
        );
      else
        update public.provider_evidence set submitted_service_key = v_evidence_services[1], submitted_service_keys = v_evidence_services,
          version = version + 1 where id = v_evidence_id and review_status <> 'verified';
      end if;
      v_evidence_id := null;
    end loop;
    if v_application.provider_type = 'team' then
      for v_worker_id in
        select worker.id from public.provider_workers worker
        where worker.provider_id = v_actor and worker.relationship_type not in ('owner','director')
      loop
        for v_requirement in
          select distinct on (requirement->>'evidence_type') requirement
          from public.service_definitions service
          cross join lateral jsonb_array_elements(service.evidence_requirements) requirement
          where service.service_key = any(v_services) and requirement->>'subject' = 'worker'
          order by requirement->>'evidence_type'
        loop
          select array_agg(distinct service.service_key order by service.service_key) into v_evidence_services
          from public.service_definitions service
          cross join lateral jsonb_array_elements(service.evidence_requirements) candidate
          where service.service_key = any(v_services)
            and candidate->>'subject' = 'worker'
            and candidate->>'evidence_type' = v_requirement->>'evidence_type';
          select id into v_evidence_id from public.provider_evidence evidence
          where evidence.provider_id = v_actor and evidence.subject_type = 'worker'
            and evidence.worker_id = v_worker_id and evidence.evidence_type = v_requirement->>'evidence_type'
            and evidence.superseded_at is null order by evidence.created_date desc limit 1;
          if v_evidence_id is null then
            insert into public.provider_evidence (
              provider_id,subject_type,worker_id,evidence_type,submitted_service_key,
              submitted_service_keys,submitted_scope_ids,submission_status,review_status,automation_status
            ) values (
              v_actor,'worker',v_worker_id,v_requirement->>'evidence_type',v_evidence_services[1],
              v_evidence_services,array['*'],'draft','pending','not_started'
            );
          else
            update public.provider_evidence set submitted_service_key = v_evidence_services[1],submitted_service_keys = v_evidence_services,
              version = version + 1 where id = v_evidence_id and review_status <> 'verified';
          end if;
          v_evidence_id := null;
        end loop;
      end loop;
    end if;
    for v_worker_id in select worker.id from public.provider_workers worker where worker.provider_id = v_actor loop
      perform public.oneforall_ensure_worker_base_evidence(v_actor,v_worker_id,v_services);
    end loop;

  elsif v_step = 3 then
    if v_complete and exists (
      select 1 from public.provider_evidence evidence
      where evidence.provider_id = v_actor and evidence.superseded_at is null
        and exists (
          select 1 from public.provider_offerings offering
          where offering.provider_id = v_actor and offering.requested_selected
            and offering.service_key = any(evidence.submitted_service_keys)
        )
        and evidence.review_status <> 'verified'
        and (evidence.document_path is null or evidence.submission_status not in ('submitted','under_review'))
    ) then raise exception 'Upload every required document before continuing'; end if;

  elsif v_step = 4 then
    update public.provider_applications set
      notification_email_enabled = coalesce((p_payload->>'notification_email_enabled')::boolean,notification_email_enabled),
      privacy_declaration_at = case when coalesce((p_payload->>'privacy_declaration')::boolean,false) then coalesce(privacy_declaration_at,now()) else null end,
      accuracy_declaration_at = case when coalesce((p_payload->>'accuracy_declaration')::boolean,false) then coalesce(accuracy_declaration_at,now()) else null end,
      eligibility_declaration_at = case when coalesce((p_payload->>'eligibility_declaration')::boolean,false) then coalesce(eligibility_declaration_at,now()) else null end,
      terms_version = case when coalesce((p_payload->>'privacy_declaration')::boolean,false) then 'provider-terms-pending-founder-approval' else terms_version end
    where id = v_application.id;
    if v_complete and not (
      coalesce((p_payload->>'privacy_declaration')::boolean,false)
      and coalesce((p_payload->>'accuracy_declaration')::boolean,false)
      and coalesce((p_payload->>'eligibility_declaration')::boolean,false)
    ) then raise exception 'Complete all provider declarations'; end if;
  end if;

  if v_complete then
    update public.provider_applications set
      completed_steps = array(select distinct value from unnest(array_append(completed_steps,v_step)) value order by value),
      current_step = greatest(current_step,least(4,v_step + 1)),
      provider_action_reason = null
    where id = v_application.id;
  end if;
  select * into v_application from public.provider_applications where id = v_application.id;
  return jsonb_build_object('application',to_jsonb(v_application));
end;
$$;

-- Callable only with a service-role JWT from the future verification worker.
-- Even a successful automated result leaves review_status pending and cannot
-- approve or activate a provider resource.
create or replace function public.oneforall_record_automated_evidence_result(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_evidence public.provider_evidence%rowtype;
  v_result text := p_payload->>'result';
  v_reference text := btrim(coalesce(p_payload->>'vendor_reference',''));
  v_supported boolean;
  v_required_expiry boolean;
  v_expiry timestamptz;
begin
  if auth.role() <> 'service_role' then raise exception 'Verification service role required'; end if;
  if not public.oneforall_provider_control_open('hybrid_checks') then raise exception 'Hybrid checks are not enabled'; end if;
  if v_result not in ('passed','manual_review','failed') then raise exception 'Invalid automated evidence result'; end if;
  select * into v_evidence from public.provider_evidence where id = (p_payload->>'evidence_id')::uuid for update;
  if not found or v_evidence.submission_status not in ('submitted','under_review') or v_evidence.review_status <> 'pending' then
    raise exception 'Evidence is not available for automated checking';
  end if;
  v_supported := v_evidence.evidence_type in ('responsible_identity','worker_identity','abn_entity_match','victorian_electrical_contractor_registration','victorian_electrical_licence','victorian_plumbing_registration_or_licence','victorian_builder_registration_where_required','victorian_pest_licence');
  if v_result = 'passed' and (not v_supported or char_length(v_reference) < 8) then
    raise exception 'This evidence requires manual review or a valid authority reference';
  end if;
  select coalesce(bool_or((requirement->>'expiry_required')::boolean),false) into v_required_expiry
  from unnest(v_evidence.submitted_service_keys) submitted(service_key)
  join public.service_definitions service on service.service_key = submitted.service_key
  cross join lateral jsonb_array_elements(service.evidence_requirements) requirement
  where requirement->>'evidence_type' = v_evidence.evidence_type
    and requirement->>'subject' = v_evidence.subject_type;
  if v_result = 'passed' and v_required_expiry then
    begin v_expiry := (p_payload->>'expires_date')::timestamptz;
    exception when others then raise exception 'A verified future expiry is required'; end;
    if v_expiry <= now() then raise exception 'A verified future expiry is required'; end if;
  else
    v_expiry := v_evidence.expires_date;
  end if;
  insert into public.provider_automation_events (
    evidence_id,provider_id,result,vendor_reference_fingerprint
  ) values (
    v_evidence.id,v_evidence.provider_id,v_result,md5(coalesce(v_reference,'manual-review'))
  );
  update public.provider_evidence set automation_status = v_result,automation_checked_at = now(),
    submission_status = 'under_review',
    review_status = case when v_result = 'passed' then 'verified' else 'pending' end,
    expires_date = v_expiry,
    abn_entity_match = case when v_result = 'passed' and evidence_type = 'abn_entity_match' then true else abn_entity_match end,
    service_scopes = case when v_result = 'passed' then submitted_service_keys else service_scopes end,
    approved_scope_ids = case when v_result = 'passed' then submitted_scope_ids else approved_scope_ids end,
    provider_action_reason = case when v_result in ('manual_review','failed') then 'OneForAll will manually review this document.' else null end,
    version = version + 1 where id = v_evidence.id;
  return jsonb_build_object('evidence_id',v_evidence.id,'automation_status',v_result,
    'review_status',case when v_result = 'passed' then 'verified' else 'pending' end);
end;
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
  v_service_count integer;
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
  select * into v_evidence from public.provider_evidence where id = (p_payload->>'evidence_id')::uuid for update;
  if not found or v_evidence.provider_id = v_actor then raise exception 'Independent evidence review required'; end if;
  if v_evidence.submission_status not in ('submitted','under_review') or v_evidence.superseded_at is not null then
    raise exception 'Evidence is not reviewable';
  end if;
  select count(distinct service.service_key),coalesce(bool_or((requirement->>'expiry_required')::boolean),false)
  into v_service_count,v_required_expiry
  from unnest(v_evidence.submitted_service_keys) submitted(service_key)
  join public.service_definitions service on service.service_key = submitted.service_key
  cross join lateral jsonb_array_elements(service.evidence_requirements) requirement
  where requirement->>'evidence_type' = v_evidence.evidence_type
    and requirement->>'subject' = v_evidence.subject_type;
  if v_evidence.evidence_type in ('worker_identity','worker_relationship') and v_evidence.subject_type = 'worker' then
    v_service_count := cardinality(v_evidence.submitted_service_keys);
    v_required_expiry := false;
  end if;
  if v_decision = 'verified' and (
    cardinality(v_evidence.submitted_service_keys) = 0
    or v_service_count <> cardinality(v_evidence.submitted_service_keys)
    or cardinality(v_evidence.submitted_scope_ids) = 0
    or v_evidence.document_path is null or v_evidence.document_path like '%://%'
    or (v_required_expiry and (v_evidence.expires_date is null or v_evidence.expires_date <= now()))
    or (v_evidence.evidence_type = 'abn_entity_match' and v_evidence.abn_entity_match is not true)
    or (
      public.oneforall_provider_control_open('hybrid_checks')
      and v_evidence.evidence_type in ('responsible_identity','worker_identity','abn_entity_match','victorian_electrical_contractor_registration','victorian_electrical_licence','victorian_plumbing_registration_or_licence','victorian_builder_registration_where_required','victorian_pest_licence')
      and v_evidence.automation_status <> 'passed'
    )
  ) then raise exception 'Evidence does not meet every configured service requirement'; end if;
  insert into public.provider_review_events (
    provider_id,resource_type,resource_id,from_status,to_status,reviewer_id,
    decision_reason,idempotency_key,intent_fingerprint
  ) values (
    v_evidence.provider_id,'evidence',v_evidence.id,v_evidence.review_status,
    v_decision,v_actor,v_reason,v_key,v_fingerprint
  );
  update public.provider_evidence set
    review_status = v_decision,
    submission_status = case when v_decision = 'rejected' then 'changes_required' else 'under_review' end,
    service_scopes = case when v_decision = 'verified' then v_evidence.submitted_service_keys else service_scopes end,
    approved_scope_ids = case when v_decision = 'verified' then v_evidence.submitted_scope_ids else approved_scope_ids end,
    provider_action_reason = case when v_decision = 'rejected' then v_reason else null end,
    version = version + 1
  where id = v_evidence.id;
  return jsonb_build_object('evidence_id',v_evidence.id,'status',v_decision);
end;
$$;

-- Providers receive a bounded request snapshot. Customer identity, contact,
-- exact address, raw access notes and raw safety text are deliberately absent.
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
    'scope_summary', invitation.scope_summary,
    'service_area', invitation.service_area,
    'preferred_date', invitation.preferred_date,
    'indicative_price_low', invitation.indicative_price_low,
    'indicative_price_high', invitation.indicative_price_high,
    'safe_access_factors', invitation.safe_access_factors,
    'safe_safety_summary', invitation.safe_safety_summary,
    'safe_photo_paths', invitation.safe_photo_paths,
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
  v_low numeric;
  v_high numeric;
  v_access text[];
  v_photos text[];
  v_scope_summary text := left(btrim(coalesce(p_payload->>'scope_summary','')),1000);
  v_safety_summary text := left(btrim(coalesce(p_payload->>'safe_safety_summary','')),500);
begin
  if v_actor is null or not public.is_admin() then raise exception 'Admin review required'; end if;
  if not public.oneforall_provider_control_open('provider_job_actions') then raise exception 'Provider job actions are not enabled'; end if;
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
  begin
    v_low := coalesce((p_payload->>'indicative_price_low')::numeric,v_job.indicative_low);
    v_high := coalesce((p_payload->>'indicative_price_high')::numeric,v_job.indicative_high);
  exception when others then raise exception 'A valid indicative price range is required'; end;
  if v_low is null or v_high is null or v_low <= 0 or v_high < v_low then raise exception 'A valid indicative price range is required'; end if;
  select coalesce(array_agg(left(btrim(value),120)) filter (where btrim(value) <> ''), '{}'::text[]) into v_access
  from jsonb_array_elements_text(coalesce(p_payload->'safe_access_factors','[]'::jsonb));
  select coalesce(array_agg(btrim(value)) filter (where btrim(value) <> ''), '{}'::text[]) into v_photos
  from jsonb_array_elements_text(coalesce(p_payload->'safe_photo_paths','[]'::jsonb));
  if cardinality(v_access) > 8 or cardinality(v_photos) > 6
    or exists (select 1 from unnest(v_photos) path where path like '%://%' or char_length(path) > 240)
    or exists (select 1 from unnest(v_photos) path where not exists (select 1 from storage.objects object where object.bucket_id = 'provider-request-media' and object.name = path)) then
    raise exception 'Reviewed request media or access summary is invalid';
  end if;
  insert into public.invitations (
    job_id,job_title,customer_id,customer_name,tradie_id,tradie_name,status,
    service_key,selected_scope_ids,selected_scope_labels,scope_summary,service_area,
    preferred_date,provider_assertion_id,expires_at,indicative_price_low,
    indicative_price_high,requested_units,requested_value,safe_access_factors,
    safe_safety_summary,safe_photo_paths,idempotency_key,intent_fingerprint,created_by
  ) values (
    v_job.id,v_job.category_name,v_job.customer_id,null,v_provider,null,'pending',
    v_job.service_key,v_job.selected_scope_ids,'{}'::text[],v_scope_summary,v_job.suburb,
    v_job.preferred_date,v_assertion_id,now() + interval '12 hours',v_low,v_high,
    v_job.requested_units,v_job.requested_value,v_access,v_safety_summary,v_photos,
    v_key,v_fingerprint,v_actor
  ) returning * into v_invitation;
  insert into public.invitation_events (
    invitation_id,job_id,customer_id,provider_id,actor_id,from_status,to_status,idempotency_key,intent_fingerprint
  ) values (
    v_invitation.id,v_job.id,v_job.customer_id,v_provider,v_actor,'none','pending',v_key,v_fingerprint
  );
  insert into public.request_events (
    job_id,customer_id,provider_id,actor_id,from_state,to_state,idempotency_key,intent_fingerprint,metadata
  ) values (
    v_job.id,v_job.customer_id,v_provider,v_actor,'submitted','published',v_key,v_fingerprint,
    jsonb_build_object('invitation_id',v_invitation.id)
  );
  update public.jobs set status = 'published',version = version + 1 where id = v_job.id;
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
  v_profile public.tradie_profiles%rowtype;
  v_action text := p_payload->>'action';
  v_pricing_mode text := coalesce(p_payload->>'pricing_mode','indicative');
  v_key text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_fingerprint text := public.oneforall_intent_fingerprint(p_payload);
  v_event public.invitation_events%rowtype;
  v_worker public.provider_workers%rowtype;
  v_quote public.interest_requests%rowtype;
  v_worker_id uuid;
  v_low numeric;
  v_high numeric;
  v_service_date date;
  v_service_instant timestamptz;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if v_action not in ('available','decline') or char_length(v_key) < 8 then raise exception 'Invalid invitation response'; end if;
  select * into v_event from public.invitation_events
  where invitation_id = (p_payload->>'invitation_id')::uuid and actor_id = v_actor and idempotency_key = v_key;
  if found then
    if v_event.intent_fingerprint is distinct from v_fingerprint then raise exception 'Invitation response idempotency conflict'; end if;
    return jsonb_build_object('invitation_id',v_event.invitation_id,'status',v_event.to_status,'idempotent',true);
  end if;
  if not public.oneforall_provider_control_open('provider_job_actions') then raise exception 'Provider job actions are not enabled'; end if;
  select * into v_invitation from public.invitations where id = (p_payload->>'invitation_id')::uuid for update;
  if not found or v_invitation.tradie_id <> v_actor then raise exception 'Invitation unavailable'; end if;
  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then raise exception 'Invitation expired or closed'; end if;
  if not public.oneforall_release_open(v_invitation.service_key,'quote') then raise exception 'Provider responses are not released for this service'; end if;
  if v_action = 'decline' then
    insert into public.invitation_events (
      invitation_id,job_id,customer_id,provider_id,actor_id,from_status,to_status,idempotency_key,intent_fingerprint
    ) values (
      v_invitation.id,v_invitation.job_id,v_invitation.customer_id,v_actor,v_actor,'pending','declined',v_key,v_fingerprint
    );
    update public.invitations set status = 'declined' where id = v_invitation.id;
    return jsonb_build_object('invitation_id',v_invitation.id,'status','declined');
  end if;
  if v_pricing_mode not in ('indicative','custom')
    or coalesce((p_payload->>'substitution_disclosed')::boolean,false) is not true then
    raise exception 'Pricing choice and exact attending worker disclosure are required';
  end if;
  if v_pricing_mode = 'indicative' then
    v_low := v_invitation.indicative_price_low;
    v_high := v_invitation.indicative_price_high;
  else
    begin
      v_low := (p_payload->>'quote_low')::numeric;
      v_high := (p_payload->>'quote_high')::numeric;
    exception when others then raise exception 'Enter a valid custom price range'; end;
  end if;
  if v_low is null or v_high is null or v_low <= 0 or v_high < v_low then raise exception 'Enter a positive price range with minimum not above maximum'; end if;
  begin v_service_date := (p_payload->>'earliest_availability')::date;
  exception when others then raise exception 'Earliest availability is required'; end;
  if v_service_date < (now() at time zone 'Australia/Melbourne')::date then raise exception 'Earliest availability cannot be in the past'; end if;
  v_service_date := greatest(coalesce(v_invitation.preferred_date,v_service_date),v_service_date);
  v_service_instant := ((v_service_date::timestamp + time '12:00') at time zone 'Australia/Melbourne');
  select * into v_job from public.jobs where id = v_invitation.job_id;
  if not found or v_job.status <> 'published' then raise exception 'Canonical request unavailable'; end if;
  select * into v_profile from public.tradie_profiles where user_id = v_actor order by created_date limit 1;
  if not found then raise exception 'Provider profile unavailable'; end if;
  begin v_worker_id := nullif(p_payload->>'attending_worker_id','')::uuid; exception when others then raise exception 'Choose a valid attending worker'; end;
  if v_profile.provider_type = 'solo' and v_worker_id is null then
    select id into v_worker_id from public.provider_workers
    where provider_id = v_actor and relationship_type in ('owner','director') and active and review_status = 'verified'
    order by created_date limit 1;
  elsif v_profile.provider_type = 'team' and v_worker_id is null then
    raise exception 'Team providers must choose an eligible attending worker';
  end if;
  select * into v_worker from public.provider_workers where id = v_worker_id and provider_id = v_actor;
  if not found or not public.oneforall_exact_worker_eligible_v2(
    v_actor,v_worker.id,v_invitation.service_key,v_invitation.selected_scope_ids,
    v_service_instant,v_job.suburb,v_job.requested_units,v_job.requested_value,
    v_invitation.provider_assertion_id,false,true
  ) then raise exception 'Exact worker, evidence, offering, capacity or assertion gate failed'; end if;
  insert into public.interest_requests (
    job_id,job_title,customer_id,tradie_id,quote_low,quote_high,
    earliest_availability,message,status,response_deadline,service_key,
    selected_scope_ids,attending_worker_id,attending_worker_display_name,
    substitution_disclosed,provider_assertion_id,invitation_id,idempotency_key,created_by
  ) values (
    v_invitation.job_id,v_invitation.job_title,v_invitation.customer_id,v_actor,v_low,v_high,
    v_service_date,left(btrim(coalesce(p_payload->>'message','')),1000),'pending',v_invitation.expires_at,
    v_invitation.service_key,v_invitation.selected_scope_ids,v_worker.id,v_worker.display_name,
    true,v_invitation.provider_assertion_id,v_invitation.id,v_key,v_actor
  ) returning * into v_quote;
  insert into public.invitation_events (
    invitation_id,job_id,customer_id,provider_id,actor_id,from_status,to_status,
    idempotency_key,intent_fingerprint,metadata
  ) values (
    v_invitation.id,v_invitation.job_id,v_invitation.customer_id,v_actor,v_actor,
    'pending','responded',v_key,v_fingerprint,jsonb_build_object('quote_id',v_quote.id,'pricing_mode',v_pricing_mode)
  );
  update public.invitations set status = 'responded' where id = v_invitation.id;
  insert into public.notifications (user_id,type,title,body,link,created_by)
  values (v_invitation.customer_id,'managed_quote','Provider availability received',v_invitation.job_title,'/bookings',v_actor);
  return jsonb_build_object('quote_id',v_quote.id,'status','pending','pricing_mode',v_pricing_mode);
end;
$$;

create or replace function public.oneforall_provider_transition_booking(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_booking public.bookings%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select * into v_booking from public.bookings where id = (p_payload->>'booking_id')::uuid;
  if not found or v_booking.provider_id <> v_actor then raise exception 'Provider booking unavailable'; end if;
  if p_payload->>'to_state' not in ('scheduled','in_progress','completed') then raise exception 'Use OneForAll support for cancellation or disputes'; end if;
  if not public.oneforall_provider_control_open('provider_job_actions') then raise exception 'Provider job actions are not enabled'; end if;
  return public.oneforall_transition_booking(p_payload);
end;
$$;

create or replace function public.oneforall_confirm_provider_response(p_payload jsonb)
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
  v_address text := nullif(btrim(coalesce(p_payload->>'confirmed_service_address','')), '');
  v_contact text := nullif(btrim(coalesce(p_payload->>'confirmed_customer_contact','')), '');
  v_access text := nullif(btrim(coalesce(p_payload->>'confirmed_access_details','')), '');
begin
  if not public.oneforall_provider_control_open('provider_job_actions') then raise exception 'Provider job actions are not enabled'; end if;
  if v_actor is null or char_length(v_key) < 8
    or coalesce((p_payload->>'worker_acknowledged')::boolean,false) is not true then
    raise exception 'Idempotency key and worker acknowledgement are required';
  end if;
  if char_length(coalesce(v_address,'')) > 500 or char_length(coalesce(v_contact,'')) > 300
    or char_length(coalesce(v_access,'')) > 1000 then
    raise exception 'Confirmed booking details are too long';
  end if;
  select * into v_job from public.jobs where id = (p_payload->>'job_id')::uuid for update;
  if not found or (v_job.customer_id <> v_actor and not public.is_admin()) then
    raise exception 'Only the customer or OneForAll can confirm this response';
  end if;
  select * into v_booking from public.bookings
    where customer_id = v_job.customer_id and job_id = v_job.id and idempotency_key = v_key;
  if found then
    if v_booking.intent_fingerprint is distinct from v_fingerprint then raise exception 'Provider response confirmation idempotency conflict'; end if;
    return jsonb_build_object('booking_id',v_booking.id,'idempotent',true);
  end if;
  select * into v_quote from public.interest_requests where id = (p_payload->>'quote_id')::uuid for update;
  if v_quote.id is null or v_quote.customer_id <> v_job.customer_id or v_quote.job_id <> v_job.id
    or v_quote.status <> 'pending' or v_quote.response_deadline <= now()
    or v_job.status <> 'published' or v_job.scope_decision <> 'allowed'
    or v_job.hazard_screen_status <> 'passed' or v_quote.provider_assertion_id is null then
    raise exception 'Provider response cannot be confirmed';
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
    state,idempotency_key,intent_fingerprint,confirmed_service_address,
    confirmed_customer_contact,confirmed_access_details
  ) values (
    v_job.id,v_quote.id,v_job.customer_id,v_quote.tradie_id,v_job.service_key,v_job.selected_scope_ids,
    v_worker.id,v_worker.display_name,true,true,v_job.scope_decision,v_job.hazard_screen_status,
    'accepted',v_key,v_fingerprint,v_address,v_contact,v_access
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
    idempotency_key,intent_fingerprint,metadata
  ) values (
    v_booking.id,v_job.id,v_job.customer_id,v_quote.tradie_id,v_actor,'none','accepted',
    v_key,v_fingerprint,jsonb_build_object('confirmed_by_oneforall',public.is_admin())
  );
  insert into public.conversations (job_id,job_title,customer_id,tradie_id,contact_unlocked,created_by)
  select v_job.id,v_job.category_name,v_job.customer_id,v_quote.tradie_id,true,v_actor
  where not exists (select 1 from public.conversations where job_id = v_job.id and tradie_id = v_quote.tradie_id);
  insert into public.notifications (user_id,type,title,body,link,created_by)
  values (v_quote.tradie_id,'booking_confirmed','Booking confirmed',v_job.category_name,'/provider/jobs',v_actor);
  return jsonb_build_object('booking_id',v_booking.id,'state','accepted');
end;
$$;

-- Remove direct client paths that would bypass the new global job-action gate.
revoke execute on function public.oneforall_transition_booking(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_accept_quote(jsonb) from public, anon, authenticated;

revoke execute on function public.oneforall_start_provider_application(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_ensure_worker_base_evidence(uuid, uuid, text[]) from public, anon, authenticated;
revoke execute on function public.oneforall_save_provider_application(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_save_provider_worker(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_attach_provider_evidence(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_submit_provider_application(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_record_automated_evidence_result(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_review_provider_evidence(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_provider_invitation_snapshots(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_invite_provider(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_respond_invitation(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_provider_transition_booking(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_confirm_provider_response(jsonb) from public, anon, authenticated;

grant execute on function public.oneforall_start_provider_application(jsonb) to authenticated;
grant execute on function public.oneforall_save_provider_application(jsonb) to authenticated;
grant execute on function public.oneforall_save_provider_worker(jsonb) to authenticated;
grant execute on function public.oneforall_attach_provider_evidence(jsonb) to authenticated;
grant execute on function public.oneforall_submit_provider_application(jsonb) to authenticated;
grant execute on function public.oneforall_record_automated_evidence_result(jsonb) to service_role;
grant execute on function public.oneforall_review_provider_evidence(jsonb) to authenticated;
grant execute on function public.oneforall_provider_invitation_snapshots(jsonb) to authenticated;
grant execute on function public.oneforall_invite_provider(jsonb) to authenticated;
grant execute on function public.oneforall_respond_invitation(jsonb) to authenticated;
grant execute on function public.oneforall_provider_transition_booking(jsonb) to authenticated;
grant execute on function public.oneforall_confirm_provider_response(jsonb) to authenticated;

comment on table public.provider_feature_controls is
  'Independent provider release controls. All consequential controls default off and require a separate approved production change.';
comment on table public.provider_applications is
  'Private resumable provider application. This table cannot itself grant verification, service activation or provider standing.';
comment on function public.oneforall_record_automated_evidence_result(jsonb) is
  'Service-role-only hybrid check result. Supported authoritative evidence may be verified, but no worker, offering or provider standing is activated.';
