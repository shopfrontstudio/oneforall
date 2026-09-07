-- OneForAll provider demo sandbox.
-- Demo identities may hold complete provider-profile records for interface
-- testing, but are permanently barred from every authoritative marketplace,
-- customer-contact, public-assertion and payment record.

alter table public.app_users
  add column if not exists demo_mode boolean not null default false;

comment on column public.app_users.demo_mode is
  'True only for isolated product-demo identities. Demo identities cannot participate in authoritative marketplace records.';

create or replace function public.oneforall_reject_demo_marketplace_participation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_record jsonb := to_jsonb(new);
  v_provider_text text;
  v_provider uuid;
begin
  v_provider_text := coalesce(
    nullif(v_record->>'provider_id', ''),
    nullif(v_record->>'tradie_id', ''),
    nullif(v_record->>'assigned_tradie_id', '')
  );
  if v_provider_text is null then
    return new;
  end if;
  v_provider := v_provider_text::uuid;
  if exists (
    select 1 from public.app_users
    where id = v_provider and demo_mode
  ) then
    raise exception 'Demo accounts cannot participate in live marketplace records'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.oneforall_reject_demo_marketplace_participation() from public, anon, authenticated;

drop trigger if exists jobs_reject_demo_provider on public.jobs;
create trigger jobs_reject_demo_provider before insert or update on public.jobs
  for each row execute function public.oneforall_reject_demo_marketplace_participation();
drop trigger if exists invitations_reject_demo_provider on public.invitations;
create trigger invitations_reject_demo_provider before insert or update on public.invitations
  for each row execute function public.oneforall_reject_demo_marketplace_participation();
drop trigger if exists interest_requests_reject_demo_provider on public.interest_requests;
create trigger interest_requests_reject_demo_provider before insert or update on public.interest_requests
  for each row execute function public.oneforall_reject_demo_marketplace_participation();
drop trigger if exists bookings_reject_demo_provider on public.bookings;
create trigger bookings_reject_demo_provider before insert or update on public.bookings
  for each row execute function public.oneforall_reject_demo_marketplace_participation();
drop trigger if exists recurring_series_reject_demo_provider on public.recurring_series;
create trigger recurring_series_reject_demo_provider before insert or update on public.recurring_series
  for each row execute function public.oneforall_reject_demo_marketplace_participation();
drop trigger if exists provider_public_assertions_reject_demo_provider on public.provider_public_assertions;
create trigger provider_public_assertions_reject_demo_provider before insert or update on public.provider_public_assertions
  for each row execute function public.oneforall_reject_demo_marketplace_participation();
drop trigger if exists conversations_reject_demo_provider on public.conversations;
create trigger conversations_reject_demo_provider before insert or update on public.conversations
  for each row execute function public.oneforall_reject_demo_marketplace_participation();
drop trigger if exists messages_reject_demo_provider on public.messages;
create trigger messages_reject_demo_provider before insert or update on public.messages
  for each row execute function public.oneforall_reject_demo_marketplace_participation();
drop trigger if exists request_events_reject_demo_provider on public.request_events;
create trigger request_events_reject_demo_provider before insert or update on public.request_events
  for each row execute function public.oneforall_reject_demo_marketplace_participation();
drop trigger if exists booking_events_reject_demo_provider on public.booking_events;
create trigger booking_events_reject_demo_provider before insert or update on public.booking_events
  for each row execute function public.oneforall_reject_demo_marketplace_participation();
drop trigger if exists invitation_events_reject_demo_provider on public.invitation_events;
create trigger invitation_events_reject_demo_provider before insert or update on public.invitation_events
  for each row execute function public.oneforall_reject_demo_marketplace_participation();
drop trigger if exists subscriptions_reject_demo_provider on public.subscriptions;
create trigger subscriptions_reject_demo_provider before insert or update on public.subscriptions
  for each row execute function public.oneforall_reject_demo_marketplace_participation();
drop trigger if exists boosts_reject_demo_provider on public.boosts;
create trigger boosts_reject_demo_provider before insert or update on public.boosts
  for each row execute function public.oneforall_reject_demo_marketplace_participation();

-- Seed the existing OneForAll demo login only when it exists in this project.
-- No real document, registration, policy number, customer or public assertion
-- is created. Browser-only sample work supplies the interactive demo journey.
do $$
declare
  v_demo_user constant uuid := '95456e03-33b8-49d2-beed-6fe76ee92451';
  v_profile_id uuid;
  v_worker_id uuid;
  v_evidence_id uuid;
  v_evidence_type text;
  v_subject_type text;
  v_service constant text := 'plumbing.licensed_services';
  v_scopes constant text[] := array['tap-toilet-repair','leak-assessment','drain-assessment','hot-water-assessment'];
begin
  if not exists (select 1 from public.app_users where id = v_demo_user) then
    return;
  end if;

  if exists (select 1 from public.jobs where assigned_tradie_id = v_demo_user)
    or exists (select 1 from public.invitations where tradie_id = v_demo_user)
    or exists (select 1 from public.interest_requests where tradie_id = v_demo_user)
    or exists (select 1 from public.bookings where provider_id = v_demo_user)
    or exists (select 1 from public.recurring_series where provider_id = v_demo_user)
    or exists (select 1 from public.provider_public_assertions where provider_id = v_demo_user)
    or exists (select 1 from public.conversations where tradie_id = v_demo_user)
    or exists (select 1 from public.messages where tradie_id = v_demo_user) then
    raise exception 'The selected demo identity already has live marketplace records and cannot be converted safely';
  end if;

  update public.app_users
  set full_name = 'Alex Morgan (Demo)', account_type = 'tradie', demo_mode = true
  where id = v_demo_user;

  if exists (select 1 from public.customer_profiles where user_id = v_demo_user) then
    update public.customer_profiles
    set full_name = 'Alex Morgan (Demo)', suburb = 'Ballarat', state = 'VIC',
        mobile = '0400 000 000', mobile_verified = true, email_verified = true
    where user_id = v_demo_user;
  else
    insert into public.customer_profiles (
      user_id, full_name, suburb, state, mobile, mobile_verified, email_verified, created_by
    ) values (
      v_demo_user, 'Alex Morgan (Demo)', 'Ballarat', 'VIC', '0400 000 000', true, true, v_demo_user
    );
  end if;

  select id into v_profile_id
  from public.tradie_profiles
  where user_id = v_demo_user
  order by created_date
  limit 1;

  if v_profile_id is null then
    insert into public.tradie_profiles (
      user_id, full_name, business_name, abn, trade_categories, service_areas,
      open_to_work, bio, verified, suburb, state, provider_type, business_email,
      contact_phone, weekly_availability, timezone, provider_standing, created_by
    ) values (
      v_demo_user, 'Alex Morgan (Demo)', 'Ballarat Demo Plumbing', '00000000000',
      array['Plumbing'], array['Ballarat','Alfredton','Wendouree'],
      true, 'Fictional provider profile used only to test the OneForAll provider experience.',
      true, 'Ballarat', 'VIC', 'solo', 'demo.plumber@anaramarketing.com.au',
      '0400 000 000',
      '{"monday":true,"tuesday":true,"wednesday":true,"thursday":true,"friday":true}'::jsonb,
      'Australia/Melbourne', 'active', v_demo_user
    ) returning id into v_profile_id;
  else
    update public.tradie_profiles
    set full_name = 'Alex Morgan (Demo)',
        business_name = 'Ballarat Demo Plumbing',
        abn = '00000000000',
        trade_categories = array['Plumbing'],
        service_areas = array['Ballarat','Alfredton','Wendouree'],
        open_to_work = true,
        bio = 'Fictional provider profile used only to test the OneForAll provider experience.',
        verified = true,
        suburb = 'Ballarat',
        state = 'VIC',
        provider_type = 'solo',
        business_email = 'demo.plumber@anaramarketing.com.au',
        contact_phone = '0400 000 000',
        weekly_availability = '{"monday":true,"tuesday":true,"wednesday":true,"thursday":true,"friday":true}'::jsonb,
        timezone = 'Australia/Melbourne',
        provider_standing = 'active'
    where id = v_profile_id;
  end if;

  select id into v_worker_id
  from public.provider_workers
  where provider_id = v_demo_user and relationship_type in ('owner','director')
  order by created_date
  limit 1;

  if v_worker_id is null then
    insert into public.provider_workers (
      provider_id, display_name, legal_name, relationship_type, active,
      identity_verified, relationship_verified, review_status, submission_status, submitted_at
    ) values (
      v_demo_user, 'Alex Morgan (Demo)', 'Alex Morgan (Demo)', 'owner', true,
      true, true, 'verified', 'submitted', now()
    ) returning id into v_worker_id;
  else
    update public.provider_workers
    set display_name = 'Alex Morgan (Demo)', legal_name = 'Alex Morgan (Demo)',
        relationship_type = 'owner', active = true, identity_verified = true,
        relationship_verified = true, review_status = 'verified',
        submission_status = 'submitted', provider_action_reason = null,
        submitted_at = coalesce(submitted_at, now()), version = version + 1
    where id = v_worker_id;
  end if;

  insert into public.provider_applications (
    provider_id, provider_type, current_step, completed_steps, status,
    notification_email_enabled, privacy_declaration_at, accuracy_declaration_at,
    eligibility_declaration_at, terms_version, submitted_at, reviewed_at, created_by
  ) values (
    v_demo_user, 'solo', 4, array[1,2,3,4], 'approved',
    true, now(), now(), now(), 'demo-sandbox-v1', now(), now(), v_demo_user
  )
  on conflict (provider_id) do update set
    provider_type = 'solo', current_step = 4, completed_steps = array[1,2,3,4],
    status = 'approved', provider_action_reason = null, notification_email_enabled = true,
    privacy_declaration_at = coalesce(provider_applications.privacy_declaration_at, now()),
    accuracy_declaration_at = coalesce(provider_applications.accuracy_declaration_at, now()),
    eligibility_declaration_at = coalesce(provider_applications.eligibility_declaration_at, now()),
    terms_version = 'demo-sandbox-v1',
    submitted_at = coalesce(provider_applications.submitted_at, now()),
    reviewed_at = now();

  insert into public.provider_offerings (
    provider_id, service_key, approved_scope, coverage_suburbs, availability_days,
    capacity_remaining, minimum_notice_hours, approved_delivery_pathway,
    approved_labour_mode, review_status, active, available, reverification_required,
    requested_selected, requested_scope_ids, requested_coverage_suburbs,
    requested_availability_days, requested_capacity, requested_minimum_notice_hours,
    requested_delivery_pathway, requested_labour_mode, submission_status, submitted_at
  ) values (
    v_demo_user, v_service, v_scopes, array['Ballarat','Alfredton','Wendouree'],
    array['monday','tuesday','wednesday','thursday','friday'], 4, 2,
    'managed_quote', 'sole_provider', 'approved', true, true, false,
    true, v_scopes, array['Ballarat','Alfredton','Wendouree'],
    array['monday','tuesday','wednesday','thursday','friday'], 4, 2,
    'managed_quote', 'sole_provider', 'submitted', now()
  )
  on conflict (provider_id, service_key) do update set
    approved_scope = v_scopes,
    coverage_suburbs = array['Ballarat','Alfredton','Wendouree'],
    availability_days = array['monday','tuesday','wednesday','thursday','friday'],
    capacity_remaining = 4, minimum_notice_hours = 2,
    approved_delivery_pathway = 'managed_quote', approved_labour_mode = 'sole_provider',
    review_status = 'approved', active = true, available = true, reverification_required = false,
    requested_selected = true, requested_scope_ids = v_scopes,
    requested_coverage_suburbs = array['Ballarat','Alfredton','Wendouree'],
    requested_availability_days = array['monday','tuesday','wednesday','thursday','friday'],
    requested_capacity = 4, requested_minimum_notice_hours = 2,
    requested_delivery_pathway = 'managed_quote', requested_labour_mode = 'sole_provider',
    submission_status = 'submitted', provider_action_reason = null,
    submitted_at = coalesce(provider_offerings.submitted_at, now()),
    version = provider_offerings.version + 1;

  foreach v_evidence_type in array array[
    'responsible_identity','abn_entity_match','service_specific_insurance',
    'worker_identity','worker_relationship',
    'victorian_plumbing_registration_or_licence','plumbing_scope_authorisation'
  ] loop
    v_subject_type := case
      when v_evidence_type in ('worker_identity','worker_relationship','victorian_plumbing_registration_or_licence','plumbing_scope_authorisation')
      then 'worker' else 'provider' end;

    select id into v_evidence_id
    from public.provider_evidence
    where provider_id = v_demo_user
      and subject_type = v_subject_type
      and evidence_type = v_evidence_type
      and worker_id is not distinct from (case when v_subject_type = 'worker' then v_worker_id else null end)
      and superseded_at is null and superseded_by_evidence_id is null
    order by (review_status = 'verified') desc, created_date desc
    limit 1;

    if v_evidence_id is null then
      insert into public.provider_evidence (
        provider_id, subject_type, worker_id, evidence_type, submitted_service_key,
        submitted_service_keys, submitted_scope_ids, service_scopes, approved_scope_ids,
        submission_status, review_status, expires_date, abn_entity_match,
        automation_status, automation_checked_at, reference_number, issuer_name
      ) values (
        v_demo_user, v_subject_type,
        case when v_subject_type = 'worker' then v_worker_id else null end,
        v_evidence_type, v_service, array[v_service], v_scopes, v_scopes, v_scopes,
        'submitted', 'verified',
        case when v_evidence_type in ('service_specific_insurance','victorian_plumbing_registration_or_licence','plumbing_scope_authorisation')
          then '2030-12-31 23:59:59+11'::timestamptz else null end,
        case when v_evidence_type = 'abn_entity_match' then true else null end,
        case when v_evidence_type in ('responsible_identity','abn_entity_match','worker_identity')
          then 'passed' else 'manual_review' end,
        now(), 'DEMO-ONLY', 'OneForAll demo sandbox'
      ) returning id into v_evidence_id;
    else
      update public.provider_evidence
      set submitted_service_key = v_service,
          submitted_service_keys = array[v_service],
          submitted_scope_ids = v_scopes,
          service_scopes = v_scopes,
          approved_scope_ids = v_scopes,
          document_path = null,
          document_original_name = null,
          document_mime_type = null,
          document_size_bytes = null,
          submission_status = 'submitted',
          review_status = 'verified',
          expires_date = case when v_evidence_type in ('service_specific_insurance','victorian_plumbing_registration_or_licence','plumbing_scope_authorisation')
            then '2030-12-31 23:59:59+11'::timestamptz else null end,
          abn_entity_match = case when v_evidence_type = 'abn_entity_match' then true else null end,
          automation_status = case when v_evidence_type in ('responsible_identity','abn_entity_match','worker_identity')
            then 'passed' else 'manual_review' end,
          automation_checked_at = now(),
          reference_number = 'DEMO-ONLY',
          issuer_name = 'OneForAll demo sandbox',
          provider_action_reason = null,
          version = version + 1
      where id = v_evidence_id;
    end if;
  end loop;
end;
$$;

comment on function public.oneforall_reject_demo_marketplace_participation() is
  'Fail-closed guard preventing isolated demo providers from entering any live marketplace or customer-contact record.';
