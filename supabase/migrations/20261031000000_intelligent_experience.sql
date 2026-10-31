-- Non-AI customer tools. No paid integrations, background sending, provider
-- activation, or release-control changes. Availability is an offer of time,
-- never an automatic booking, promise of arrival, or travel-time estimate.

create table public.customer_homes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 100),
  suburb text not null check (char_length(suburb) between 1 and 100),
  property_type text not null check (property_type in ('house','unit','apartment','other')),
  notes text not null default '' check (char_length(notes) <= 2000),
  appliances jsonb not null default '[]' check (jsonb_typeof(appliances) = 'array' and jsonb_array_length(appliances) <= 30),
  version integer not null default 1,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create table public.maintenance_reminders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  home_id uuid not null references public.customer_homes(id) on delete cascade,
  service_key text references public.service_definitions(service_key),
  title text not null check (char_length(title) between 1 and 150),
  due_date date not null,
  repeat_months integer check (repeat_months between 1 and 60),
  enabled boolean not null default true,
  version integer not null default 1,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create table public.request_photo_annotations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete cascade,
  photo_path text not null,
  annotations jsonb not null default '[]' check (jsonb_typeof(annotations)='array' and jsonb_array_length(annotations)<=20),
  version integer not null default 1,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  unique(job_id,photo_path)
);
create table public.booking_proof (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  phase text not null check (phase in ('before','after')),
  photo_path text not null unique,
  note text not null default '' check (char_length(note)<=1000),
  created_date timestamptz not null default now()
);
create table public.provider_availability_windows (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references auth.users(id) on delete cascade,
  worker_id uuid not null references public.provider_workers(id) on delete cascade,
  service_key text not null references public.service_definitions(service_key),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  version integer not null default 1,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  check(ends_at>starts_at and ends_at<=starts_at+interval '12 hours')
);
create table public.customer_request_bundles (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  intent_fingerprint text not null,
  request_ids uuid[] not null,
  results jsonb not null,
  created_date timestamptz not null default now(),
  unique(customer_id,idempotency_key)
);

create index customer_homes_owner_idx on public.customer_homes(customer_id);
create index maintenance_reminders_owner_due_idx on public.maintenance_reminders(customer_id,due_date) where enabled;
create index request_photo_annotations_job_idx on public.request_photo_annotations(job_id);
create index booking_proof_booking_idx on public.booking_proof(booking_id);
create index provider_availability_owner_idx on public.provider_availability_windows(provider_id,starts_at);
create index provider_availability_worker_idx on public.provider_availability_windows(worker_id,starts_at,ends_at);

alter table public.customer_homes enable row level security;
alter table public.maintenance_reminders enable row level security;
alter table public.request_photo_annotations enable row level security;
alter table public.booking_proof enable row level security;
alter table public.provider_availability_windows enable row level security;
alter table public.customer_request_bundles enable row level security;
create policy "homes owner read" on public.customer_homes for select to authenticated using(customer_id=auth.uid());
create policy "maintenance owner read" on public.maintenance_reminders for select to authenticated using(customer_id=auth.uid());
create policy "annotations owner or booked provider read" on public.request_photo_annotations for select to authenticated
  using(customer_id=auth.uid() or exists(select 1 from public.bookings b where b.job_id=request_photo_annotations.job_id and b.provider_id=auth.uid() and b.state<>'superseded'));
create policy "proof participants read" on public.booking_proof for select to authenticated
  using(exists(select 1 from public.bookings b where b.id=booking_proof.booking_id and (b.customer_id=auth.uid() or b.provider_id=auth.uid()) and b.state<>'superseded'));
create policy "availability owner read" on public.provider_availability_windows for select to authenticated using(provider_id=auth.uid());
create policy "request bundles owner read" on public.customer_request_bundles for select to authenticated using(customer_id=auth.uid());
revoke all on public.customer_homes,public.maintenance_reminders,public.request_photo_annotations,public.booking_proof,
  public.provider_availability_windows,public.customer_request_bundles from anon,authenticated;
grant select on public.customer_homes,public.maintenance_reminders,public.request_photo_annotations,public.booking_proof,
  public.provider_availability_windows,public.customer_request_bundles to authenticated;

-- A home record is private customer-entered information, not a claim that the
-- address, appliance, owner, maintenance interval or safety was verified.
create or replace function public.oneforall_save_home_profile(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_id uuid:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
  v_home public.customer_homes%rowtype; v_label text:=btrim(coalesce(p_payload->>'label',''));
  v_suburb text:=btrim(coalesce(p_payload->>'suburb','')); v_kind text:=coalesce(p_payload->>'property_type','house');
  v_notes text:=coalesce(p_payload->>'notes',''); v_appliances jsonb:=coalesce(p_payload->'appliances','[]'::jsonb); v_item jsonb;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>32768 then raise exception 'Invalid home details'; end if;
  perform pg_advisory_xact_lock(hashtextextended('home:'||v_actor::text,0));
  select * into v_home from public.customer_homes where id=v_id for update;
  if found then
    if v_home.customer_id<>v_actor then raise exception 'Home unavailable'; end if;
    if v_home.version is distinct from (p_payload->>'version')::integer then raise exception 'Home changed. Reload before saving'; end if;
    if coalesce((p_payload->>'delete')::boolean,false) then
      delete from public.customer_homes where id=v_id;
      return jsonb_build_object('id',v_id,'deleted',true);
    end if;
  elsif coalesce((p_payload->>'delete')::boolean,false) then raise exception 'Home unavailable';
  elsif (select count(*) from public.customer_homes where customer_id=v_actor)>=10 then raise exception 'Save up to ten homes'; end if;
  if char_length(v_label) not between 1 and 100 or char_length(v_suburb) not between 1 and 100
    or v_kind not in ('house','unit','apartment','other') or char_length(v_notes)>2000
    or jsonb_typeof(v_appliances)<>'array' then raise exception 'Check home details'; end if;
  if jsonb_array_length(v_appliances)>30 then raise exception 'Save up to thirty appliances'; end if;
  for v_item in select value from jsonb_array_elements(v_appliances) loop
    if jsonb_typeof(v_item)<>'object' or char_length(btrim(coalesce(v_item->>'name',''))) not between 1 and 100
      or char_length(coalesce(v_item->>'details',''))>500 or char_length(coalesce(v_item->>'id',''))>100 then
      raise exception 'Check appliance details'; end if;
    if nullif(v_item->>'last_serviced_on','') is not null and ((v_item->>'last_serviced_on')::date>current_date
      or (v_item->>'last_serviced_on')::date<date '1900-01-01') then raise exception 'Check last service date'; end if;
  end loop;
  insert into public.customer_homes(id,customer_id,label,suburb,property_type,notes,appliances)
    values(v_id,v_actor,v_label,v_suburb,v_kind,v_notes,v_appliances)
    on conflict(id) do update set label=excluded.label,suburb=excluded.suburb,property_type=excluded.property_type,
      notes=excluded.notes,appliances=excluded.appliances,version=customer_homes.version+1,updated_date=now()
    returning * into v_home;
  return to_jsonb(v_home);
end $$;

create or replace function public.oneforall_save_maintenance_reminder(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_id uuid:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
  v_row public.maintenance_reminders%rowtype; v_home uuid:=(p_payload->>'home_id')::uuid;
  v_title text:=btrim(coalesce(p_payload->>'title','')); v_due date:=(p_payload->>'due_date')::date;
  v_months integer:=nullif(p_payload->>'repeat_months','')::integer;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>4096 then raise exception 'Invalid reminder'; end if;
  perform pg_advisory_xact_lock(hashtextextended('home:'||v_actor::text,0));
  select * into v_row from public.maintenance_reminders where id=v_id for update;
  if found then
    if v_row.customer_id<>v_actor then raise exception 'Reminder unavailable'; end if;
    if v_row.version is distinct from (p_payload->>'version')::integer then raise exception 'Reminder changed. Reload before saving'; end if;
    if coalesce((p_payload->>'delete')::boolean,false) then
      delete from public.maintenance_reminders where id=v_id;
      return jsonb_build_object('id',v_id,'deleted',true);
    end if;
  elsif coalesce((p_payload->>'delete')::boolean,false) then raise exception 'Reminder unavailable';
  elsif (select count(*) from public.maintenance_reminders where customer_id=v_actor)>=100 then raise exception 'Save up to one hundred reminders'; end if;
  if not exists(select 1 from public.customer_homes where id=v_home and customer_id=v_actor) then raise exception 'Home unavailable'; end if;
  if char_length(v_title) not between 1 and 150 or v_due is null or v_due<date '2000-01-01' or v_due>current_date+3650
    or (v_months is not null and v_months not between 1 and 60) then raise exception 'Check reminder details'; end if;
  insert into public.maintenance_reminders(id,customer_id,home_id,service_key,title,due_date,repeat_months,enabled)
    values(v_id,v_actor,v_home,nullif(p_payload->>'service_key',''),v_title,v_due,v_months,coalesce((p_payload->>'enabled')::boolean,true))
    on conflict(id) do update set home_id=excluded.home_id,service_key=excluded.service_key,title=excluded.title,
      due_date=excluded.due_date,repeat_months=excluded.repeat_months,enabled=excluded.enabled,
      version=maintenance_reminders.version+1,updated_date=now() returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function public.oneforall_save_photo_annotations(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_job public.jobs%rowtype; v_row public.request_photo_annotations%rowtype;
  v_path text:=p_payload->>'photo_path'; v_annotations jsonb:=coalesce(p_payload->'annotations','[]'::jsonb);
  v_item jsonb; v_x numeric; v_y numeric;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>32768 then raise exception 'Invalid annotations'; end if;
  select * into v_job from public.jobs where id=(p_payload->>'job_id')::uuid for update;
  if not found or v_job.customer_id<>v_actor or v_job.status not in ('manual_review','submitted','published') then raise exception 'Request cannot be annotated'; end if;
  if v_path is null or not(v_path=any(v_job.request_photo_paths)) then raise exception 'Attach this photo to the request first'; end if;
  if jsonb_typeof(v_annotations)<>'array' then raise exception 'Invalid annotations'; end if;
  if jsonb_array_length(v_annotations)>20 then raise exception 'Add up to twenty photo notes'; end if;
  for v_item in select value from jsonb_array_elements(v_annotations) loop
    if jsonb_typeof(v_item)<>'object' or jsonb_typeof(v_item->'x') is distinct from 'number'
      or jsonb_typeof(v_item->'y') is distinct from 'number' then raise exception 'Choose a valid point on the photo'; end if;
    v_x:=(v_item->>'x')::numeric; v_y:=(v_item->>'y')::numeric;
    if v_x not between 0 and 1 or v_y not between 0 and 1
      or char_length(btrim(coalesce(v_item->>'note',''))) not between 1 and 300 then raise exception 'Check photo note'; end if;
  end loop;
  select * into v_row from public.request_photo_annotations where job_id=v_job.id and photo_path=v_path for update;
  if found and v_row.version is distinct from (p_payload->>'version')::integer then raise exception 'Photo notes changed. Reload before saving'; end if;
  insert into public.request_photo_annotations(job_id,customer_id,photo_path,annotations)
    values(v_job.id,v_actor,v_path,v_annotations)
    on conflict(job_id,photo_path) do update set annotations=excluded.annotations,
      version=request_photo_annotations.version+1,updated_date=now() returning * into v_row;
  return to_jsonb(v_row);
end $$;

-- This new bucket has no public read, public URLs, or identity-document access.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('booking-proof','booking-proof',false,8388608,array['image/jpeg','image/png'])
  on conflict(id) do nothing;
create policy "proof participant storage read" on storage.objects for select to authenticated
  using(bucket_id='booking-proof' and exists(
    select 1 from public.booking_proof p join public.bookings b on b.id=p.booking_id
    where p.photo_path=name and (b.customer_id=auth.uid() or b.provider_id=auth.uid()) and b.state<>'superseded'
  ));
create policy "proof bounded provider upload" on storage.objects for insert to authenticated
  with check(bucket_id='booking-proof' and (storage.foldername(name))[1]=auth.uid()::text
    and exists(select 1 from public.provider_feature_controls where id and provider_job_actions_enabled)
    and exists(select 1 from public.bookings b join public.service_definitions s on s.service_key=b.service_key
      where b.id::text=(storage.foldername(storage.objects.name))[2] and b.provider_id=auth.uid()
        and b.state in ('accepted','scheduled','in_progress','completed') and s.booking_enabled and s.public_release_enabled));
create policy "proof unattached owner cleanup" on storage.objects for delete to authenticated
  using(bucket_id='booking-proof' and (storage.foldername(name))[1]=auth.uid()::text
    and not exists(select 1 from public.booking_proof p where p.photo_path=name));

create or replace function public.oneforall_attach_job_proof(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_booking public.bookings%rowtype; v_row public.booking_proof%rowtype;
  v_id uuid:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
  v_path text:=p_payload->>'photo_path'; v_phase text:=p_payload->>'phase'; v_note text:=coalesce(p_payload->>'note','');
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>4096 then raise exception 'Invalid proof'; end if;
  select * into v_booking from public.bookings where id=(p_payload->>'booking_id')::uuid for update;
  if not found or v_booking.provider_id<>v_actor or v_booking.state not in ('accepted','scheduled','in_progress','completed') then raise exception 'Booking unavailable'; end if;
  if not public.oneforall_provider_control_open('provider_job_actions')
    or not public.oneforall_release_open(v_booking.service_key,'booking') then raise exception 'Job actions are not enabled'; end if;
  if v_phase is null or v_phase not in ('before','after') or char_length(v_note)>1000 or v_path is null
    or v_path !~ ('^'||v_actor::text||'/'||v_booking.id::text||'/[A-Za-z0-9_-]+\.(jpg|png)$') then raise exception 'Invalid proof photo'; end if;
  if not exists(select 1 from storage.objects o where o.bucket_id='booking-proof' and o.name=v_path) then raise exception 'Upload the private proof photo first'; end if;
  select * into v_row from public.booking_proof where id=v_id or photo_path=v_path;
  if found then
    if v_row.booking_id<>v_booking.id or v_row.actor_id<>v_actor or v_row.phase<>v_phase or v_row.note<>v_note then raise exception 'Proof retry conflict'; end if;
    return to_jsonb(v_row);
  end if;
  if (select count(*) from public.booking_proof where booking_id=v_booking.id and phase=v_phase)>=12 then raise exception 'Add up to twelve photos per stage'; end if;
  insert into public.booking_proof(id,booking_id,actor_id,phase,photo_path,note)
    values(v_id,v_booking.id,v_actor,v_phase,v_path,v_note) returning * into v_row;
  return to_jsonb(v_row);
end $$;

create or replace function public.oneforall_save_provider_availability(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_id uuid:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
  v_row public.provider_availability_windows%rowtype; v_worker uuid:=(p_payload->>'worker_id')::uuid;
  v_service text:=p_payload->>'service_key'; v_start timestamptz:=(p_payload->>'starts_at')::timestamptz;
  v_end timestamptz:=(p_payload->>'ends_at')::timestamptz;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>4096 then raise exception 'Invalid availability'; end if;
  if not public.oneforall_provider_control_open('provider_job_actions') then raise exception 'Job actions are not enabled'; end if;
  perform pg_advisory_xact_lock(hashtextextended('availability:'||v_actor::text,0));
  select * into v_row from public.provider_availability_windows where id=v_id for update;
  if found then
    if v_row.provider_id<>v_actor then raise exception 'Availability unavailable'; end if;
    if v_row.version is distinct from (p_payload->>'version')::integer then raise exception 'Availability changed. Reload before saving'; end if;
    if coalesce((p_payload->>'delete')::boolean,false) then
      delete from public.provider_availability_windows where id=v_id;
      return jsonb_build_object('id',v_id,'deleted',true);
    end if;
  elsif coalesce((p_payload->>'delete')::boolean,false) then raise exception 'Availability unavailable'; end if;
  if not exists(select 1 from public.provider_workers where id=v_worker and provider_id=v_actor and active and review_status='verified')
    or not exists(select 1 from public.provider_offerings where provider_id=v_actor and service_key=v_service
      and active and review_status='approved' and not reverification_required)
    or not public.oneforall_release_open(v_service,'booking') then raise exception 'Approved worker and released service required'; end if;
  if v_start is null or v_end is null or v_start<=now() or v_start>now()+interval '180 days'
    or v_end<=v_start or v_end>v_start+interval '12 hours' then raise exception 'Choose a future availability window up to twelve hours'; end if;
  if exists(select 1 from public.provider_availability_windows where worker_id=v_worker and id<>v_id and starts_at<v_end and ends_at>v_start)
    then raise exception 'Availability overlaps another window'; end if;
  if (select count(*) from public.provider_availability_windows where provider_id=v_actor and starts_at>now() and id<>v_id)>=500
    then raise exception 'Save up to five hundred future windows'; end if;
  insert into public.provider_availability_windows(id,provider_id,worker_id,service_key,starts_at,ends_at)
    values(v_id,v_actor,v_worker,v_service,v_start,v_end)
    on conflict(id) do update set worker_id=excluded.worker_id,service_key=excluded.service_key,starts_at=excluded.starts_at,
      ends_at=excluded.ends_at,version=provider_availability_windows.version+1,updated_date=now() returning * into v_row;
  return to_jsonb(v_row);
end $$;

-- Never exposes a provider's whole diary or other customer identities. Only a
-- quote owner can inspect the attending worker's service-specific open windows.
-- Unknown duration means the entire day of an existing booking is withheld.
create or replace function public.oneforall_availability_for_quote(p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_quote public.interest_requests%rowtype; v_job public.jobs%rowtype; v_result jsonb;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select * into v_quote from public.interest_requests where id=(p_payload->>'quote_id')::uuid;
  if not found or v_quote.customer_id<>v_actor or v_quote.status<>'pending' or v_quote.response_deadline is null or v_quote.response_deadline<=now()
    or v_quote.superseded_by_quote_id is not null then raise exception 'Quote unavailable'; end if;
  select * into v_job from public.jobs where id=v_quote.job_id;
  if not found or v_job.customer_id<>v_actor or v_job.status<>'published' then raise exception 'Request unavailable'; end if;
  if not public.oneforall_provider_control_open('provider_job_actions') then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'starts_at',w.starts_at,'ends_at',w.ends_at) order by w.starts_at),'[]'::jsonb)
    into v_result from public.provider_availability_windows w
    where w.provider_id=v_quote.tradie_id and w.worker_id=v_quote.attending_worker_id and w.service_key=v_quote.service_key
      and w.starts_at>now() and w.starts_at<=now()+interval '90 days'
      and public.oneforall_exact_worker_eligible_v2(w.provider_id,w.worker_id,w.service_key,v_quote.selected_scope_ids,
        w.starts_at,v_job.suburb,v_job.requested_units,v_job.requested_value,v_quote.provider_assertion_id,true,true)
      and not exists(select 1 from public.bookings b where b.attending_worker_id=w.worker_id and b.state in ('accepted','scheduled','in_progress')
        and (b.scheduled_start at time zone 'Australia/Melbourne')::date=(w.starts_at at time zone 'Australia/Melbourne')::date);
  return v_result;
end $$;

-- A cart groups independent requests, not prices or provider assignments.
-- Any invalid item rolls back the complete transaction. Retries return the
-- original bundle, and changed intent with the same key is rejected.
create or replace function public.oneforall_submit_request_bundle(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=auth.uid(); v_key text:=btrim(coalesce(p_payload->>'idempotency_key',''));
  v_items jsonb:=p_payload->'items'; v_fingerprint text:=md5(coalesce((p_payload->'items')::text,''));
  v_existing public.customer_request_bundles%rowtype; v_result jsonb; v_results jsonb:='[]'::jsonb;
  v_ids uuid[]:='{}'; v_item jsonb; v_index integer:=0;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>131072
    or char_length(v_key) not between 8 and 100 or v_items is null or jsonb_typeof(v_items)<>'array' then raise exception 'Invalid request bundle'; end if;
  if jsonb_array_length(v_items) not between 1 and 8 then raise exception 'Choose one to eight services'; end if;
  perform pg_advisory_xact_lock(hashtextextended('request-bundle:'||v_actor::text,0));
  select * into v_existing from public.customer_request_bundles where customer_id=v_actor and idempotency_key=v_key;
  if found then
    if v_existing.intent_fingerprint<>v_fingerprint then raise exception 'Bundle retry has different details'; end if;
    return jsonb_build_object('id',v_existing.id,'requests',v_existing.results,'idempotent',true);
  end if;
  for v_item in select value from jsonb_array_elements(v_items) loop
    if jsonb_typeof(v_item)<>'object' or nullif(v_item->>'requested_units','') is null or nullif(v_item->>'requested_value','') is null
      or (v_item->>'requested_units')::numeric<=0 or (v_item->>'requested_value')::numeric<=0 then raise exception 'Each request needs planning quantity and budget'; end if;
    v_result:=public.oneforall_submit_request_v2(v_item||jsonb_build_object('idempotency_key',coalesce(nullif(v_item->>'idempotency_key',''),v_key||':'||v_index::text)));
    v_results:=v_results||jsonb_build_array(v_result); v_ids:=array_append(v_ids,(v_result->>'id')::uuid); v_index:=v_index+1;
  end loop;
  insert into public.customer_request_bundles(customer_id,idempotency_key,intent_fingerprint,request_ids,results)
    values(v_actor,v_key,v_fingerprint,v_ids,v_results) returning * into v_existing;
  return jsonb_build_object('id',v_existing.id,'requests',v_results);
end $$;

revoke execute on function public.oneforall_save_home_profile(jsonb),public.oneforall_save_maintenance_reminder(jsonb),
  public.oneforall_save_photo_annotations(jsonb),public.oneforall_attach_job_proof(jsonb),
  public.oneforall_save_provider_availability(jsonb),public.oneforall_availability_for_quote(jsonb),
  public.oneforall_submit_request_bundle(jsonb) from public,anon;
grant execute on function public.oneforall_save_home_profile(jsonb),public.oneforall_save_maintenance_reminder(jsonb),
  public.oneforall_save_photo_annotations(jsonb),public.oneforall_attach_job_proof(jsonb),
  public.oneforall_save_provider_availability(jsonb),public.oneforall_availability_for_quote(jsonb),
  public.oneforall_submit_request_bundle(jsonb) to authenticated;

comment on table public.customer_homes is 'Private customer-entered property and appliance details; not verified claims.';
comment on table public.maintenance_reminders is 'Customer opt-in in-app reminders. No background messages, predictive diagnosis or automatic booking.';
comment on table public.booking_proof is 'Provider supplied job photos, not independent inspection or customer acceptance.';
comment on table public.provider_availability_windows is 'Provider-published available windows, not reserved appointments. Canonical booking confirmation remains authoritative.';

-- No invented price data. Only explicitly approved current guides are public.
create table public.service_price_guides (
  service_key text primary key references public.service_definitions(service_key),
  unit_label text not null check(char_length(unit_label) between 1 and 50),
  low_per_unit numeric(12,2) not null check(low_per_unit>0),
  high_per_unit numeric(12,2) not null check(high_per_unit>=low_per_unit),
  callout numeric(12,2) not null default 0 check(callout>=0),
  inclusions text not null check(char_length(inclusions) between 1 and 1000),
  exclusions text not null check(char_length(exclusions) between 1 and 1000),
  valid_through date not null,
  approved_by uuid not null references auth.users(id),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.service_price_guides enable row level security;
create policy "current price guides read" on public.service_price_guides for select to anon,authenticated
  using(valid_through >= (now() at time zone 'Australia/Melbourne')::date);
revoke all on public.service_price_guides from anon,authenticated;
grant select on public.service_price_guides to anon,authenticated;
create or replace function public.oneforall_save_price_guide(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.service_price_guides%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'Admin approval required'; end if;
  if p_payload is null or octet_length(p_payload::text)>4096 then raise exception 'Invalid price guide'; end if;
  if (p_payload->>'valid_through')::date not between current_date and current_date+366 then raise exception 'Choose a validity date within a year'; end if;
  insert into public.service_price_guides(service_key,unit_label,low_per_unit,high_per_unit,callout,inclusions,exclusions,valid_through,approved_by)
  values(p_payload->>'service_key',p_payload->>'unit_label',(p_payload->>'low_per_unit')::numeric,(p_payload->>'high_per_unit')::numeric,
    coalesce((p_payload->>'callout')::numeric,0),p_payload->>'inclusions',p_payload->>'exclusions',(p_payload->>'valid_through')::date,auth.uid())
  on conflict(service_key) do update set unit_label=excluded.unit_label,low_per_unit=excluded.low_per_unit,high_per_unit=excluded.high_per_unit,
    callout=excluded.callout,inclusions=excluded.inclusions,exclusions=excluded.exclusions,valid_through=excluded.valid_through,
    approved_by=excluded.approved_by,updated_date=now() returning * into v_row;
  return to_jsonb(v_row);
end $$;
revoke execute on function public.oneforall_save_price_guide(jsonb) from public,anon;
grant execute on function public.oneforall_save_price_guide(jsonb) to authenticated;
