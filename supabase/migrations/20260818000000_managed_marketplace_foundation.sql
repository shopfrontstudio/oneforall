-- OneForAll managed-marketplace recovery.
-- This migration closes the legacy open-board/client-mutation model and makes
-- request, invitation, quote, booking, evidence and approval changes RPC-only.

-- ---------------------------------------------------------------------------
-- Close permissive policies that may already exist on an upgraded database.
-- ---------------------------------------------------------------------------
drop policy if exists "update own user row" on public.app_users;
drop policy if exists "cp insert own" on public.customer_profiles;
drop policy if exists "cp update own" on public.customer_profiles;
drop policy if exists "cp delete own" on public.customer_profiles;
drop policy if exists "tp insert own" on public.tradie_profiles;
drop policy if exists "tp read all" on public.tradie_profiles;
drop policy if exists "tp update own" on public.tradie_profiles;
drop policy if exists "tp delete own" on public.tradie_profiles;
drop policy if exists "jobs insert own" on public.jobs;
drop policy if exists "jobs read" on public.jobs;
drop policy if exists "jobs update own" on public.jobs;
drop policy if exists "jobs delete own" on public.jobs;
drop policy if exists "ir insert" on public.interest_requests;
drop policy if exists "ir update participants" on public.interest_requests;
drop policy if exists "inv insert" on public.invitations;
drop policy if exists "inv update participants" on public.invitations;
drop policy if exists "inv delete customer" on public.invitations;
drop policy if exists "conv insert" on public.conversations;
drop policy if exists "conv update participants" on public.conversations;
drop policy if exists "msg insert as self" on public.messages;
drop policy if exists "msg update own" on public.messages;
drop policy if exists "msg delete own" on public.messages;
drop policy if exists "notif insert" on public.notifications;
drop policy if exists "notif update own" on public.notifications;
drop policy if exists "notif delete own" on public.notifications;
drop policy if exists "rev insert as self" on public.reviews;
drop policy if exists "rev update own" on public.reviews;
drop policy if exists "rev delete own" on public.reviews;
drop policy if exists "sub insert own" on public.subscriptions;
drop policy if exists "sub update own" on public.subscriptions;
drop policy if exists "sub delete own" on public.subscriptions;
drop policy if exists "boost insert own" on public.boosts;
drop policy if exists "boost update own" on public.boosts;
drop policy if exists "boost delete own" on public.boosts;
drop policy if exists "cat admin insert" on public.service_categories;
drop policy if exists "cat admin update" on public.service_categories;
drop policy if exists "cat admin delete" on public.service_categories;

drop policy if exists "uploads are publicly readable" on storage.objects;
drop policy if exists "authenticated users can upload" on storage.objects;
drop policy if exists "uploads owner read" on storage.objects;
drop policy if exists "uploads owner insert" on storage.objects;
update storage.buckets set public = false where id = 'uploads';
create policy "uploads owner read" on storage.objects for select to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Canonical 12-category / 15-pathway service catalogue.
-- All seven release controls are deliberately false.
-- ---------------------------------------------------------------------------
delete from public.service_categories;
insert into public.service_categories (name, slug, icon, sort_order, is_active) values
  ('Cleaning', 'cleaning', 'Sparkles', 1, true),
  ('Gardening', 'gardening', 'Trees', 2, true),
  ('Beauty', 'beauty', 'Sparkles', 3, true),
  ('Handyman', 'handyman', 'Wrench', 4, true),
  ('Electrical', 'electrical', 'Zap', 5, true),
  ('Plumbing', 'plumbing', 'Droplets', 6, true),
  ('Carpentry', 'carpentry', 'Hammer', 7, true),
  ('Building & Renovation', 'building-renovation', 'HardHat', 8, true),
  ('Painting', 'painting', 'PaintRoller', 9, true),
  ('Rubbish Removal', 'rubbish-removal', 'Trash2', 10, true),
  ('Pest Control', 'pest-control', 'ShieldCheck', 11, true),
  ('Not sure what I need?', 'not-sure', 'HelpCircle', 12, true);

create table public.service_definitions (
  service_key text primary key,
  category_slug text not null references public.service_categories (slug),
  name text not null,
  pathway text not null check (pathway in ('scheduled_or_recurring', 'managed_quote', 'licensed_diagnostic')),
  scope_ids text[] not null,
  evidence_requirements jsonb not null default '[]'::jsonb,
  blocked_terms text[] not null default '{}',
  review_terms text[] not null default '{}',
  manual_review_required boolean not null default false,
  adults_only boolean not null default false,
  publicly_visible boolean not null default false,
  request_enabled boolean not null default false,
  provider_onboarding_enabled boolean not null default false,
  quote_enabled boolean not null default false,
  booking_enabled boolean not null default false,
  recurrence_enabled boolean not null default false,
  public_release_enabled boolean not null default false,
  policy_version text not null default 'phase1-foundation-2026-08-12',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.service_definitions enable row level security;
create policy "service definitions public read" on public.service_definitions for select to anon, authenticated using (true);
create trigger service_definitions_updated before update on public.service_definitions
  for each row execute function public.set_updated_date();

insert into public.service_definitions
  (service_key, category_slug, name, pathway, scope_ids, evidence_requirements, blocked_terms, review_terms, manual_review_required, adults_only)
values
  ('cleaning.routine_domestic', 'cleaning', 'Routine domestic cleaning', 'scheduled_or_recurring',
   array['vacuum-mop-dust','kitchen-bathroom','bins-linen','internal-glass'],
   '[{"evidence_type":"responsible_identity","subject":"provider","expiry_required":false},{"evidence_type":"abn_entity_match","subject":"provider","expiry_required":false},{"evidence_type":"service_specific_insurance","subject":"provider","expiry_required":true},{"evidence_type":"chemical_equipment_declaration","subject":"provider","expiry_required":false},{"evidence_type":"safe_chemical_process","subject":"worker","expiry_required":false}]',
   array['commercial','ladder','hoarding','trauma','sewage','sharps','body fluid','asbestos','drug contamination'], array['end of lease','unoccupied','keyholding','heavy soil','industrial product'], false, false),
  ('cleaning.ordinary_deep_clean', 'cleaning', 'Ordinary deep clean', 'managed_quote',
   array['ordinary-deep-clean'],
   '[{"evidence_type":"responsible_identity","subject":"provider","expiry_required":false},{"evidence_type":"abn_entity_match","subject":"provider","expiry_required":false},{"evidence_type":"service_specific_insurance","subject":"provider","expiry_required":true},{"evidence_type":"chemical_equipment_declaration","subject":"provider","expiry_required":false},{"evidence_type":"safe_chemical_process","subject":"worker","expiry_required":false}]',
   array['biohazard','remediation','chemical mixing'], array['deep clean'], true, false),
  ('gardening.basic_maintenance', 'gardening', 'Basic garden maintenance', 'scheduled_or_recurring',
   array['mowing','hand-weeding-raking','watering-leaves','ground-edging'],
   '[{"evidence_type":"responsible_identity","subject":"provider","expiry_required":false},{"evidence_type":"abn_entity_match","subject":"provider","expiry_required":false},{"evidence_type":"service_specific_insurance","subject":"provider","expiry_required":true},{"evidence_type":"equipment_competence","subject":"worker","expiry_required":false},{"evidence_type":"ppe_exclusion_zone","subject":"worker","expiry_required":false}]',
   array['chemical application','excavat','drainage','irrigation','retaining wall','powerline','contaminated soil','pest poison'], array['steep','roadside','underground service','chemical'], false, false),
  ('gardening.small_shrub_pruning', 'gardening', 'Small shrub pruning', 'managed_quote',
   array['ground-hand-pruning'],
   '[{"evidence_type":"responsible_identity","subject":"provider","expiry_required":false},{"evidence_type":"abn_entity_match","subject":"provider","expiry_required":false},{"evidence_type":"service_specific_insurance","subject":"provider","expiry_required":true},{"evidence_type":"equipment_competence","subject":"worker","expiry_required":false},{"evidence_type":"ppe_exclusion_zone","subject":"worker","expiry_required":false},{"evidence_type":"green_waste_receiver","subject":"provider","expiry_required":false},{"evidence_type":"load_restraint","subject":"worker","expiry_required":false}]',
   array['ladder','climb','chainsaw','pole saw','chipper','stump grind','tree fell'], array['green waste','remove waste'], false, false),
  ('beauty.adult_low_risk', 'beauty', 'Adult low-risk mobile beauty', 'scheduled_or_recurring',
   array['dry-hair-styling','makeup-strip-lashes','basic-nails-polish'],
   '[{"evidence_type":"responsible_identity","subject":"provider","expiry_required":false},{"evidence_type":"abn_entity_match","subject":"provider","expiry_required":false},{"evidence_type":"service_specific_insurance","subject":"provider","expiry_required":true},{"evidence_type":"relevant_training","subject":"worker","expiry_required":false},{"evidence_type":"infection_control","subject":"worker","expiry_required":false},{"evidence_type":"clean_tools_linen","subject":"provider","expiry_required":false},{"evidence_type":"business_registration_position","subject":"provider","expiry_required":false}]',
   array['minor','under 18','broken skin','infected skin','blade','clinical','injectable','prescription','microneedl','skin penetration','laser','ipl','intimate','eyelash extension'], array['colour','bleach','allerg','diabetes','circulation','infection'], false, true),
  ('handyman.minor_tasks', 'handyman', 'Minor handyman tasks', 'managed_quote',
   array['flat-pack','minor-furniture','surface-hardware','light-picture'],
   '[{"evidence_type":"responsible_identity","subject":"provider","expiry_required":false},{"evidence_type":"abn_entity_match","subject":"provider","expiry_required":false},{"evidence_type":"service_specific_insurance","subject":"provider","expiry_required":true},{"evidence_type":"task_experience","subject":"worker","expiry_required":false},{"evidence_type":"hidden_service_process","subject":"worker","expiry_required":false},{"evidence_type":"fixing_competence","subject":"worker","expiry_required":false}]',
   array['electrical','wiring','plumbing','gas','drainage','waterproof','structural','load-bearing','demolition','roof','ladder','asbestos','smoke alarm','garage door opener'], array['wall anchor','heavy','unknown surface','hidden service','tv','mirror','shelf','masonry','tile','wet area'], false, false),
  ('electrical.licensed_services', 'electrical', 'Licensed electrical services', 'managed_quote',
   array['lights-switches-powerpoints','fault-assessment','switchboard-safety','appliance-connection'],
   '[{"evidence_type":"responsible_identity","subject":"provider","expiry_required":false},{"evidence_type":"abn_entity_match","subject":"provider","expiry_required":false},{"evidence_type":"service_specific_insurance","subject":"provider","expiry_required":true},{"evidence_type":"victorian_electrical_contractor_registration","subject":"provider","expiry_required":true},{"evidence_type":"victorian_electrical_licence","subject":"worker","expiry_required":true},{"evidence_type":"electrical_scope_authorisation","subject":"worker","expiry_required":true}]',
   array['diy electrical','unlicensed electrical','live exposed','exposed conductor','meter tamper'], array['emergency','after hours','solar','battery','ev charger'], true, false),
  ('plumbing.licensed_services', 'plumbing', 'Licensed plumbing services', 'managed_quote',
   array['tap-toilet-repair','leak-assessment','drain-assessment','hot-water-assessment'],
   '[{"evidence_type":"responsible_identity","subject":"provider","expiry_required":false},{"evidence_type":"abn_entity_match","subject":"provider","expiry_required":false},{"evidence_type":"service_specific_insurance","subject":"provider","expiry_required":true},{"evidence_type":"victorian_plumbing_registration_or_licence","subject":"worker","expiry_required":true},{"evidence_type":"plumbing_scope_authorisation","subject":"worker","expiry_required":true}]',
   array['diy plumbing','unlicensed plumbing','active sewage','sewage spill','asbestos disturbance'], array['emergency','after hours','gas','roofing','drainage','specialised'], true, false),
  ('carpentry.household', 'carpentry', 'Household carpentry', 'managed_quote',
   array['doors-trim','shelving-storage','timber-repairs','small-installations'],
   '[{"evidence_type":"responsible_identity","subject":"provider","expiry_required":false},{"evidence_type":"abn_entity_match","subject":"provider","expiry_required":false},{"evidence_type":"service_specific_insurance","subject":"provider","expiry_required":true},{"evidence_type":"carpentry_competence","subject":"worker","expiry_required":false},{"evidence_type":"fixing_and_tool_safety","subject":"worker","expiry_required":false}]',
   array['load-bearing','structural change','without permit','electrical','plumbing','gas work','asbestos disturbance'], array['exterior','deck','stair','balustrade','safety-critical'], true, false),
  ('building-renovation.managed_quote', 'building-renovation', 'Building and renovation consultation', 'managed_quote',
   array['renovation-consultation'],
   '[{"evidence_type":"responsible_identity","subject":"provider","expiry_required":false},{"evidence_type":"abn_entity_match","subject":"provider","expiry_required":false},{"evidence_type":"service_specific_insurance","subject":"provider","expiry_required":true},{"evidence_type":"victorian_builder_registration_where_required","subject":"provider","expiry_required":true},{"evidence_type":"permit_and_engineering_process","subject":"provider","expiry_required":false},{"evidence_type":"verified_trade_scope","subject":"worker","expiry_required":false}]',
   array['start building','perform building work','begin renovation','construction work','unlicensed building','without permit','without engineering','asbestos disturbance','immediate structural danger'], array['structural','permit','engineer','demolition','waterproof'], true, false),
  ('painting.residential', 'painting', 'Residential painting', 'managed_quote',
   array['interior-walls-ceilings','doors-trim','ground-level-exterior','ordinary-preparation'],
   '[{"evidence_type":"responsible_identity","subject":"provider","expiry_required":false},{"evidence_type":"abn_entity_match","subject":"provider","expiry_required":false},{"evidence_type":"service_specific_insurance","subject":"provider","expiry_required":true},{"evidence_type":"painting_surface_preparation","subject":"worker","expiry_required":false},{"evidence_type":"height_and_ppe_process","subject":"worker","expiry_required":false}]',
   array['lead','asbestos','roof painting','unsafe height','fire remediation','flood remediation','significant mould','hazardous coating'], array['ladder','height','pre_1970','unknown','commercial','specialist coating'], false, false),
  ('rubbish-removal.ordinary', 'rubbish-removal', 'Ordinary rubbish removal', 'managed_quote',
   array['household-furniture','cardboard-recyclables','clean-green-waste'],
   '[{"evidence_type":"responsible_identity","subject":"provider","expiry_required":false},{"evidence_type":"abn_entity_match","subject":"provider","expiry_required":false},{"evidence_type":"service_specific_insurance","subject":"provider","expiry_required":true},{"evidence_type":"vehicle_identity","subject":"provider","expiry_required":false},{"evidence_type":"load_restraint","subject":"worker","expiry_required":false},{"evidence_type":"lawful_receivers","subject":"provider","expiry_required":false},{"evidence_type":"disposal_receipts_process","subject":"provider","expiry_required":false}]',
   array['asbestos','clinical waste','sharps','pharma','fuel','oil','solvent','acid','pesticide','unknown chemical','sewage','contaminated soil','drug waste','animal carcass','illegal dump'], array['renovation','soil','rubble','mattress','tyre','e-waste','fridge','battery','paint','gas cylinder','mixed load'], false, false),
  ('pest-control.diagnostic', 'pest-control', 'Licensed pest diagnostic', 'licensed_diagnostic',
   array['accessible-inspection','reported-pest-identification','options-discussion'],
   '[{"evidence_type":"responsible_identity","subject":"provider","expiry_required":false},{"evidence_type":"abn_entity_match","subject":"provider","expiry_required":false},{"evidence_type":"service_specific_insurance","subject":"provider","expiry_required":true},{"evidence_type":"victorian_pest_licence","subject":"worker","expiry_required":true},{"evidence_type":"pest_professional_liability","subject":"provider","expiry_required":true},{"evidence_type":"pest_scope_authorisation","subject":"worker","expiry_required":true},{"evidence_type":"sds_chemical_register","subject":"provider","expiry_required":false},{"evidence_type":"site_risk_records","subject":"worker","expiry_required":false},{"evidence_type":"spill_response","subject":"worker","expiry_required":false}]',
   array['treat','treatment','spray','fumigat','exterminat','poison','wildlife','snake','off-label','missing sds','unsafe re-entry'], array['termite','timber pest','bed bug','pregnan','child','respiratory','sensitive pet','trainee'], false, false),
  ('pest-control.pesticide_treatment', 'pest-control', 'Managed pesticide treatment', 'licensed_diagnostic',
   array['post-diagnostic-treatment'],
   '[{"evidence_type":"responsible_identity","subject":"provider","expiry_required":false},{"evidence_type":"abn_entity_match","subject":"provider","expiry_required":false},{"evidence_type":"service_specific_insurance","subject":"provider","expiry_required":true},{"evidence_type":"victorian_pest_licence","subject":"worker","expiry_required":true},{"evidence_type":"pest_professional_liability","subject":"provider","expiry_required":true},{"evidence_type":"pest_scope_authorisation","subject":"worker","expiry_required":true},{"evidence_type":"sds_chemical_register","subject":"provider","expiry_required":false},{"evidence_type":"site_risk_records","subject":"worker","expiry_required":false},{"evidence_type":"spill_response","subject":"worker","expiry_required":false}]',
   array['direct','missing authorisation','no supervisor','missing sds'], array['treatment'], true, false),
  ('general.guided_request', 'not-sure', 'Help me choose the right service', 'managed_quote',
   array['guided-triage'],
   '[{"evidence_type":"operations_triage_authorisation","subject":"worker","expiry_required":false}]',
   array['immediate danger','life threatening','illegal work','bypass licence','bypass license'], array['not sure','help choose','guided request'], true, false);

-- ---------------------------------------------------------------------------
-- Extend legacy tables into the managed request/invitation/quote model.
-- ---------------------------------------------------------------------------
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add column if not exists service_key text references public.service_definitions (service_key);
alter table public.jobs add column if not exists pathway text;
alter table public.jobs add column if not exists selected_scope_ids text[] not null default '{}';
alter table public.jobs add column if not exists scope_decision text check (scope_decision in ('allowed','manual_review','blocked'));
alter table public.jobs add column if not exists hazard_screen_status text not null default 'pending' check (hazard_screen_status in ('pending','passed','manual_review','blocked'));
alter table public.jobs add column if not exists private_review_reason text;
alter table public.jobs add column if not exists request_idempotency_key text;
alter table public.jobs add column if not exists request_fingerprint text;
alter table public.jobs add column if not exists policy_version text;
alter table public.jobs add column if not exists version integer not null default 1;
alter table public.jobs add column if not exists booking_id uuid;
alter table public.jobs add column if not exists accepted_quote_id uuid;
alter table public.jobs add column if not exists requested_units numeric;
alter table public.jobs add column if not exists requested_value numeric;
alter table public.jobs add constraint jobs_status_check check (status in ('draft','manual_review','submitted','published','matched','in_progress','completed','cancelled'));
create unique index if not exists jobs_request_idempotency_idx on public.jobs (customer_id, request_idempotency_key) where request_idempotency_key is not null;

alter table public.invitations drop constraint if exists invitations_status_check;
alter table public.invitations add column if not exists service_key text references public.service_definitions (service_key);
alter table public.invitations add column if not exists selected_scope_ids text[] not null default '{}';
alter table public.invitations add column if not exists selected_scope_labels text[] not null default '{}';
alter table public.invitations add column if not exists service_area text;
alter table public.invitations add column if not exists preferred_date date;
alter table public.invitations add column if not exists provider_assertion_id uuid;
alter table public.invitations add column if not exists expires_at timestamptz not null default (now() + interval '48 hours');
alter table public.invitations add constraint invitations_status_check check (status in ('pending','responded','declined','expired'));

alter table public.interest_requests add column if not exists service_key text references public.service_definitions (service_key);
alter table public.interest_requests add column if not exists selected_scope_ids text[] not null default '{}';
alter table public.interest_requests add column if not exists attending_worker_id uuid;
alter table public.interest_requests add column if not exists attending_worker_display_name text;
alter table public.interest_requests add column if not exists substitution_disclosed boolean not null default false;
alter table public.interest_requests add column if not exists provider_assertion_id uuid;
alter table public.interest_requests add column if not exists invitation_id uuid references public.invitations (id);
alter table public.interest_requests add column if not exists booking_id uuid;
alter table public.interest_requests add column if not exists idempotency_key text;
create unique index if not exists interest_request_idempotency_idx on public.interest_requests (tradie_id, job_id, idempotency_key) where idempotency_key is not null;

-- Provider resources are private drafts/review records. Customers never query
-- these tables; only bounded provider_public_assertions may cross that boundary.
create table public.provider_workers (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  legal_name text,
  relationship_type text not null check (relationship_type in ('owner','director','employee','subcontractor')),
  active boolean not null default false,
  identity_verified boolean not null default false,
  relationship_verified boolean not null default false,
  is_subcontractor boolean not null default false,
  subcontractor_separately_verified boolean not null default false,
  review_status text not null default 'draft' check (review_status in ('draft','under_review','verified','rejected','suspended')),
  version integer not null default 1,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create table public.provider_offerings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references auth.users (id) on delete cascade,
  service_key text not null references public.service_definitions (service_key),
  approved_scope text[] not null default '{}',
  coverage_suburbs text[] not null default '{}',
  availability_days text[] not null default '{}',
  capacity_remaining numeric not null default 0,
  minimum_units numeric,
  minimum_job_value numeric,
  minimum_notice_hours numeric,
  approved_delivery_pathway text,
  approved_labour_mode text check (approved_labour_mode in ('sole_provider','employees','subcontractors','mixed')),
  review_status text not null default 'draft' check (review_status in ('draft','under_review','approved','rejected','suspended')),
  active boolean not null default false,
  available boolean not null default false,
  reverification_required boolean not null default true,
  version integer not null default 1,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  unique (provider_id, service_key)
);
create table public.provider_evidence (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references auth.users (id) on delete cascade,
  subject_type text not null check (subject_type in ('provider','worker')),
  worker_id uuid references public.provider_workers (id),
  evidence_type text not null,
  document_path text,
  submitted_service_key text references public.service_definitions (service_key),
  submitted_scope_ids text[] not null default '{}',
  service_scopes text[] not null default '{}',
  approved_scope_ids text[] not null default '{}',
  submission_status text not null default 'draft' check (submission_status in ('draft','submitted','under_review','changes_required')),
  review_status text not null default 'pending' check (review_status in ('pending','verified','rejected','expired','suspended')),
  expires_date timestamptz,
  abn_entity_match boolean,
  supersedes_evidence_id uuid references public.provider_evidence (id),
  superseded_by_evidence_id uuid references public.provider_evidence (id),
  superseded_at timestamptz,
  version integer not null default 1,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  check ((subject_type = 'worker' and worker_id is not null) or (subject_type = 'provider' and worker_id is null))
);
create unique index provider_one_authoritative_evidence_idx on public.provider_evidence
  (provider_id, subject_type, coalesce(worker_id, '00000000-0000-0000-0000-000000000000'::uuid), evidence_type)
  where review_status = 'verified' and superseded_by_evidence_id is null and superseded_at is null;

create table public.provider_public_assertions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  approved_service_ids text[] not null,
  credential_scope text[] not null,
  evidence_checked_date date not null,
  valid_through date not null,
  status text not null default 'active' check (status in ('active','revoked')),
  superseded_by_assertion_id uuid references public.provider_public_assertions (id),
  approved_by uuid not null references auth.users (id),
  created_date timestamptz not null default now()
);
create table public.provider_review_events (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references auth.users (id) on delete cascade,
  resource_type text not null check (resource_type in ('worker','offering','evidence','public_assertion')),
  resource_id uuid not null,
  from_status text,
  to_status text not null,
  reviewer_id uuid not null references auth.users (id),
  decision_reason text not null,
  idempotency_key text not null,
  metadata jsonb not null default '{}',
  created_date timestamptz not null default now(),
  unique (reviewer_id, resource_type, resource_id, idempotency_key)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id),
  quote_id uuid not null references public.interest_requests (id),
  customer_id uuid not null references auth.users (id),
  provider_id uuid not null references auth.users (id),
  service_key text not null references public.service_definitions (service_key),
  selected_scope_ids text[] not null,
  attending_worker_id uuid not null references public.provider_workers (id),
  attending_worker_display_name text not null,
  substitution_disclosed boolean not null default false,
  customer_worker_acknowledged boolean not null default false,
  scope_decision text not null check (scope_decision in ('allowed','manual_review','blocked')),
  hazard_screen_status text not null check (hazard_screen_status in ('passed','manual_review','blocked')),
  state text not null default 'accepted' check (state in ('accepted','scheduled','in_progress','completed','cancelled','disputed','superseded')),
  scheduled_start timestamptz,
  version integer not null default 1,
  idempotency_key text not null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create unique index bookings_one_canonical_per_job_idx on public.bookings (job_id) where state <> 'superseded';
create unique index bookings_accept_idempotency_idx on public.bookings (customer_id, job_id, idempotency_key);

create table public.request_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id),
  customer_id uuid not null references auth.users (id),
  provider_id uuid references auth.users (id),
  actor_id uuid not null references auth.users (id),
  from_state text not null,
  to_state text not null,
  idempotency_key text not null,
  metadata jsonb not null default '{}',
  created_date timestamptz not null default now(),
  unique (actor_id, job_id, idempotency_key)
);
create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  job_id uuid not null references public.jobs (id),
  customer_id uuid not null references auth.users (id),
  provider_id uuid not null references auth.users (id),
  actor_id uuid not null references auth.users (id),
  from_state text not null,
  to_state text not null,
  idempotency_key text not null,
  metadata jsonb not null default '{}',
  created_date timestamptz not null default now(),
  unique (actor_id, booking_id, idempotency_key)
);
create table public.recurring_series (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id),
  provider_id uuid not null references auth.users (id),
  service_key text not null references public.service_definitions (service_key),
  selected_scope_ids text[] not null,
  state text not null default 'paused' check (state in ('paused','active','cancelled')),
  next_occurrence timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- Keep foreign keys deferred until both upgraded legacy tables exist.
alter table public.jobs add constraint jobs_booking_fk foreign key (booking_id) references public.bookings (id) deferrable initially deferred;
alter table public.jobs add constraint jobs_quote_fk foreign key (accepted_quote_id) references public.interest_requests (id) deferrable initially deferred;
alter table public.interest_requests add constraint interest_booking_fk foreign key (booking_id) references public.bookings (id) deferrable initially deferred;

create index provider_workers_owner_idx on public.provider_workers (provider_id);
create index provider_offerings_owner_service_idx on public.provider_offerings (provider_id, service_key);
create index provider_evidence_owner_worker_idx on public.provider_evidence (provider_id, worker_id);
create index provider_assertions_owner_idx on public.provider_public_assertions (provider_id);
create index invitations_expiry_idx on public.invitations (tradie_id, status, expires_at);
create index bookings_provider_state_idx on public.bookings (provider_id, state);
create index bookings_customer_state_idx on public.bookings (customer_id, state);

-- ---------------------------------------------------------------------------
-- RLS: private drafts/evidence and participant-only marketplace records.
-- No protected table has a client INSERT/UPDATE/DELETE policy.
-- ---------------------------------------------------------------------------
alter table public.provider_workers enable row level security;
alter table public.provider_offerings enable row level security;
alter table public.provider_evidence enable row level security;
alter table public.provider_public_assertions enable row level security;
alter table public.provider_review_events enable row level security;
alter table public.bookings enable row level security;
alter table public.request_events enable row level security;
alter table public.booking_events enable row level security;
alter table public.recurring_series enable row level security;

drop policy if exists "tp read own or admin" on public.tradie_profiles;
create policy "tp read own or admin" on public.tradie_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "jobs read participants" on public.jobs;
create policy "jobs read participants" on public.jobs for select to authenticated
  using (
    customer_id = auth.uid()
    or assigned_tradie_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "ir read participants" on public.interest_requests;
create policy "ir read participants" on public.interest_requests for select to authenticated
  using (customer_id = auth.uid() or tradie_id = auth.uid() or public.is_admin());

drop policy if exists "inv read participants" on public.invitations;
create policy "inv read participants" on public.invitations for select to authenticated
  using (customer_id = auth.uid() or tradie_id = auth.uid() or public.is_admin());

drop policy if exists "conv read participants" on public.conversations;
create policy "conv read participants" on public.conversations for select to authenticated
  using (customer_id = auth.uid() or tradie_id = auth.uid() or public.is_admin());

drop policy if exists "msg read participants" on public.messages;
create policy "msg read participants" on public.messages for select to authenticated
  using (customer_id = auth.uid() or tradie_id = auth.uid() or public.is_admin());

drop policy if exists "notif read own" on public.notifications;
create policy "notif read own" on public.notifications for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "rev read all" on public.reviews;
create policy "reviews participant read" on public.reviews for select to authenticated
  using (reviewer_id = auth.uid() or reviewee_id = auth.uid() or public.is_admin());

create policy "provider workers private read" on public.provider_workers for select to authenticated
  using (provider_id = auth.uid() or public.is_admin());
create policy "provider offerings private read" on public.provider_offerings for select to authenticated
  using (provider_id = auth.uid() or public.is_admin());
create policy "provider evidence private read" on public.provider_evidence for select to authenticated
  using (provider_id = auth.uid() or public.is_admin());
create policy "provider review admin read" on public.provider_review_events for select to authenticated
  using (public.is_admin());

create policy "bounded public assertions read" on public.provider_public_assertions for select to anon, authenticated
  using (
    (status = 'active' and superseded_by_assertion_id is null and valid_through >= current_date
      and exists (
        select 1 from public.service_definitions sd
        where sd.service_key = any (approved_service_ids)
          and sd.publicly_visible and sd.public_release_enabled
      ))
    or provider_id = auth.uid()
    or public.is_admin()
  );

create policy "bookings participant read" on public.bookings for select to authenticated
  using (customer_id = auth.uid() or provider_id = auth.uid() or public.is_admin());
create policy "request events participant read" on public.request_events for select to authenticated
  using (customer_id = auth.uid() or provider_id = auth.uid() or public.is_admin());
create policy "booking events participant read" on public.booking_events for select to authenticated
  using (customer_id = auth.uid() or provider_id = auth.uid() or public.is_admin());
create policy "recurring series participant read" on public.recurring_series for select to authenticated
  using (customer_id = auth.uid() or provider_id = auth.uid() or public.is_admin());

create trigger provider_workers_updated before update on public.provider_workers
  for each row execute function public.set_updated_date();
create trigger provider_offerings_updated before update on public.provider_offerings
  for each row execute function public.set_updated_date();
create trigger provider_evidence_updated before update on public.provider_evidence
  for each row execute function public.set_updated_date();
create trigger bookings_updated before update on public.bookings
  for each row execute function public.set_updated_date();
create trigger recurring_series_updated before update on public.recurring_series
  for each row execute function public.set_updated_date();

create or replace function public.oneforall_reject_immutable_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'OneForAll audit events are append-only';
end;
$$;
create trigger request_events_immutable before update or delete on public.request_events
  for each row execute function public.oneforall_reject_immutable_mutation();
create trigger booking_events_immutable before update or delete on public.booking_events
  for each row execute function public.oneforall_reject_immutable_mutation();
create trigger provider_review_events_immutable before update or delete on public.provider_review_events
  for each row execute function public.oneforall_reject_immutable_mutation();

-- Defence in depth: RLS has no write policies and table privileges are also
-- revoked. SECURITY DEFINER RPCs below are the only application write path.
revoke insert, update, delete on
  public.app_users, public.customer_profiles, public.tradie_profiles,
  public.jobs, public.interest_requests, public.invitations,
  public.conversations, public.messages, public.notifications, public.reviews,
  public.subscriptions, public.boosts, public.service_categories,
  public.service_definitions, public.provider_workers, public.provider_offerings,
  public.provider_evidence, public.provider_public_assertions,
  public.provider_review_events, public.bookings, public.request_events,
  public.booking_events, public.recurring_series
from anon, authenticated;

grant select on public.service_categories, public.service_definitions to anon, authenticated;
grant select on public.provider_public_assertions to anon, authenticated;
grant select on
  public.app_users, public.customer_profiles, public.tradie_profiles,
  public.jobs, public.interest_requests, public.invitations,
  public.conversations, public.messages, public.notifications, public.reviews,
  public.subscriptions, public.boosts, public.provider_workers,
  public.provider_offerings, public.provider_evidence, public.provider_review_events,
  public.bookings, public.request_events, public.booking_events,
  public.recurring_series
to authenticated;

-- ---------------------------------------------------------------------------
-- Shared fail-closed gates used by every mutation RPC.
-- ---------------------------------------------------------------------------
create or replace function public.oneforall_release_open(p_service_key text, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select sd.publicly_visible
      and sd.public_release_enabled
      and case p_capability
        when 'request' then sd.request_enabled
        when 'quote' then sd.quote_enabled
        when 'booking' then sd.booking_enabled
        when 'recurrence' then sd.recurrence_enabled
        when 'provider_onboarding' then sd.provider_onboarding_enabled
        else false
      end
    from public.service_definitions sd
    where sd.service_key = p_service_key
  ), false);
$$;

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
  select * into v_service from public.service_definitions where service_key = p_service_key;
  if not found then return query select 'blocked'::text, 'service_unknown'::text; return; end if;

  select coalesce(array_agg(value), '{}'::text[]) into v_scopes
  from jsonb_array_elements_text(coalesce(p_payload->'selected_scope_ids', '[]'::jsonb));
  if cardinality(v_scopes) = 0 or not (v_service.scope_ids @> v_scopes) then
    return query select 'manual_review'::text, 'scope_unknown'::text; return;
  end if;

  v_text := lower(concat_ws(' ',
    v_description,
    p_payload->>'reported_pest',
    p_payload->>'observed_signs',
    p_payload->>'safety_considerations',
    p_payload->>'painting_property_era',
    p_payload->>'painting_surface_hazard',
    p_payload->>'painting_access_height',
    coalesce((p_payload->'pathway_data')::text, '')
  ));

  if exists (
    select 1 from unnest(array[
      'immediate danger','life threatening','life-threatening','live exposed',
      'gas leak','active fire','sewage spill','immediate structural danger',
      'snake','medical emergency','call 000'
    ]) emergency_term
    where position(emergency_term in v_text) > 0
  ) then
    return query select 'blocked'::text, 'emergency_redirect'::text; return;
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
    if p_payload->>'painting_surface_hazard' = 'lead_or_asbestos'
      or p_payload->>'painting_access_height' = 'roof' then
      return query select 'blocked'::text, 'painting_hazard_blocked'::text; return;
    end if;
    if coalesce(p_payload->>'painting_property_era','') = ''
      or coalesce(p_payload->>'painting_surface_hazard','') = ''
      or coalesce(p_payload->>'painting_access_height','') = '' then
      return query select 'manual_review'::text, 'painting_screen_incomplete'::text; return;
    end if;
  end if;

  if p_service_key = 'pest-control.pesticide_treatment'
    and coalesce(p_payload->>'diagnostic_booking_id', '') = '' then
    return query select 'manual_review'::text, 'completed_diagnostic_required'::text; return;
  end if;

  select term into v_term from unnest(v_service.blocked_terms) term
  where position(lower(term) in v_text) > 0 limit 1;
  if v_term is not null then
    return query select 'blocked'::text, 'prohibited_scope'::text; return;
  end if;

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

create or replace function public.oneforall_exact_worker_eligible(
  p_provider_id uuid,
  p_worker_id uuid,
  p_service_key text,
  p_selected_scope_ids text[],
  p_service_date date,
  p_require_booking boolean default true
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
begin
  select * into v_service from public.service_definitions where service_key = p_service_key;
  if not found or not v_service.publicly_visible or not v_service.public_release_enabled
    or not v_service.quote_enabled or (p_require_booking and not v_service.booking_enabled) then return false; end if;
  if cardinality(coalesce(p_selected_scope_ids, '{}'::text[])) = 0
    or not (v_service.scope_ids @> p_selected_scope_ids) then return false; end if;

  select * into v_offering from public.provider_offerings
  where provider_id = p_provider_id and service_key = p_service_key;
  if not found or v_offering.review_status <> 'approved' or not v_offering.active
    or not v_offering.available or v_offering.reverification_required
    or not (v_offering.approved_scope @> p_selected_scope_ids)
    or v_offering.approved_delivery_pathway is distinct from v_service.pathway
    or v_offering.approved_labour_mode is null then return false; end if;

  select * into v_worker from public.provider_workers
  where id = p_worker_id and provider_id = p_provider_id;
  if not found or not v_worker.active or not v_worker.identity_verified
    or not v_worker.relationship_verified
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
      and evidence.superseded_by_evidence_id is null
      and evidence.superseded_at is null
      and (evidence.service_scopes @> array[p_service_key] or evidence.service_scopes @> array['*'])
      and (evidence.approved_scope_ids @> p_selected_scope_ids or evidence.approved_scope_ids @> array['*'])
      and (coalesce((v_requirement->>'expiry_required')::boolean, false) is false
        or (evidence.expires_date is not null and evidence.expires_date::date >= p_service_date))
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
  where assertion.provider_id = p_provider_id
    and assertion.status = 'active'
    and assertion.superseded_by_assertion_id is null
    and assertion.valid_through >= p_service_date
    and assertion.approved_service_ids @> array[p_service_key]
    and (assertion.credential_scope @> p_selected_scope_ids or assertion.credential_scope @> array['*']);
  return v_assertion_count = 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account and customer-support RPCs used by the current local UI.
-- ---------------------------------------------------------------------------
create or replace function public.oneforall_set_account_type(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_target text := p_payload->>'account_type';
  v_existing_provider boolean;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if v_target not in ('customer','tradie') then raise exception 'Invalid account type'; end if;
  if v_target = 'tradie' then
    select exists (select 1 from public.tradie_profiles where user_id = v_actor)
      or exists (select 1 from public.provider_offerings where provider_id = v_actor and review_status = 'approved')
    into v_existing_provider;
    if not v_existing_provider
      and not exists (select 1 from public.service_definitions where provider_onboarding_enabled and public_release_enabled) then
      raise exception 'Provider onboarding is not currently available';
    end if;
  end if;
  update public.app_users set account_type = v_target where id = v_actor;
  if not found then raise exception 'Account record unavailable'; end if;
  return jsonb_build_object('account_type', v_target);
end;
$$;

create or replace function public.oneforall_ensure_customer_profile(p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_profile public.customer_profiles%rowtype;
  v_name text;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.app_users where id = v_actor and account_type = 'customer') then
    raise exception 'Customer account required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('customer-profile:' || v_actor::text, 0));
  select * into v_profile from public.customer_profiles where user_id = v_actor order by created_date limit 1;
  if not found then
    select coalesce(nullif(full_name,''), 'OneForAll customer') into v_name from public.app_users where id = v_actor;
    insert into public.customer_profiles (user_id, full_name, suburb, created_by)
    values (v_actor, v_name, 'Ballarat', v_actor)
    returning * into v_profile;
  end if;
  return jsonb_build_object('id', v_profile.id);
end;
$$;

-- Request submission is deliberately not wired into the client while flags are
-- off. If called directly it checks release controls before any authoritative
-- write, then keeps allowed/manual-review requests private and never notifies.
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
  v_fingerprint text := md5((p_payload - 'idempotency_key')::text);
  v_existing public.jobs%rowtype;
  v_job public.jobs%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if char_length(v_idempotency) < 8 or char_length(v_idempotency) > 120 then raise exception 'Valid idempotency key required'; end if;
  select * into v_existing from public.jobs where customer_id = v_actor and request_idempotency_key = v_idempotency;
  if found then
    if v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'Idempotency key was already used with a different request';
    end if;
    return jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'idempotent', true);
  end if;

  select * into v_service from public.service_definitions where service_key = p_payload->>'service_key';
  if not found or not public.oneforall_release_open(p_payload->>'service_key', 'request') then
    raise exception 'Service requests are not released';
  end if;

  select classified.decision, classified.reason into v_decision, v_reason
  from public.oneforall_classify_request(v_service.service_key, p_payload) classified;
  if v_decision = 'blocked' then raise exception 'Request is restricted: %', v_reason; end if;

  select coalesce(array_agg(value), '{}'::text[]) into v_scopes
  from jsonb_array_elements_text(coalesce(p_payload->'selected_scope_ids', '[]'::jsonb));
  insert into public.jobs (
    customer_id, title, description, category_slug, category_name, suburb,
    preferred_date, urgency, service_key, pathway, selected_scope_ids,
    scope_decision, hazard_screen_status, private_review_reason,
    request_idempotency_key, request_fingerprint, policy_version, status, created_by,
    indicative_low, indicative_high
  ) values (
    v_actor, v_service.name, left(btrim(coalesce(p_payload->>'scope_description','')), 3000),
    v_service.category_slug, v_service.name, left(btrim(coalesce(p_payload->>'suburb','')), 100),
    nullif(p_payload->>'preferred_date','')::date, 'flexible', v_service.service_key,
    v_service.pathway, v_scopes, v_decision,
    case when v_decision = 'manual_review' then 'manual_review' else 'passed' end,
    case when v_decision = 'manual_review' then v_reason else null end,
    v_idempotency, v_fingerprint, v_service.policy_version,
    case when v_decision = 'manual_review' then 'manual_review' else 'submitted' end,
    v_actor, null, null
  ) returning * into v_job;
  insert into public.request_events (job_id, customer_id, actor_id, from_state, to_state, idempotency_key, metadata)
  values (v_job.id, v_actor, v_actor, 'none', v_job.status, v_idempotency, jsonb_build_object('scope_decision', v_decision, 'reason', v_reason));
  return jsonb_build_object('id', v_job.id, 'status', v_job.status, 'scope_decision', v_decision);
end;
$$;

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
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if char_length(v_key) < 8 or v_to <> 'cancelled' then raise exception 'Invalid request transition'; end if;
  select * into v_event from public.request_events where actor_id = v_actor and job_id = v_job_id and idempotency_key = v_key;
  if found then return jsonb_build_object('job_id', v_job_id, 'status', v_event.to_state, 'idempotent', true); end if;
  select * into v_job from public.jobs where id = v_job_id for update;
  if not found or v_job.customer_id <> v_actor then raise exception 'Request unavailable'; end if;
  if v_job.status not in ('draft','manual_review','submitted','published') or v_job.booking_id is not null then
    raise exception 'This request cannot be cancelled from its current state';
  end if;
  insert into public.request_events (job_id, customer_id, provider_id, actor_id, from_state, to_state, idempotency_key)
  values (v_job.id, v_job.customer_id, v_job.assigned_tradie_id, v_actor, v_job.status, 'cancelled', v_key);
  update public.jobs set status = 'cancelled', version = version + 1 where id = v_job.id;
  return jsonb_build_object('job_id', v_job.id, 'status', 'cancelled');
end;
$$;

create or replace function public.oneforall_send_message(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_conversation public.conversations%rowtype;
  v_message public.messages%rowtype;
  v_body text := btrim(coalesce(p_payload->>'body',''));
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if char_length(v_body) < 1 or char_length(v_body) > 2000 then raise exception 'Message must be 1 to 2000 characters'; end if;
  select * into v_conversation from public.conversations where id = (p_payload->>'conversation_id')::uuid;
  if not found or v_actor not in (v_conversation.customer_id, v_conversation.tradie_id) then
    raise exception 'Conversation unavailable';
  end if;
  if not v_conversation.contact_unlocked and (
    v_body ~* '(https?://|www\.|[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,})'
    or regexp_replace(v_body, '[^0-9]', '', 'g') ~ '[0-9]{8,}'
  ) then raise exception 'Contact details remain locked'; end if;
  insert into public.messages (conversation_id, customer_id, tradie_id, sender_id, sender_name, body, created_by)
  values (v_conversation.id, v_conversation.customer_id, v_conversation.tradie_id, v_actor, 'OneForAll member', v_body, v_actor)
  returning * into v_message;
  return jsonb_build_object('message', to_jsonb(v_message));
end;
$$;

-- Invitation lifecycle events are append-only and participant-readable.
alter table public.invitations add column if not exists idempotency_key text;
create unique index if not exists invitations_route_idempotency_idx
  on public.invitations (job_id, tradie_id, idempotency_key) where idempotency_key is not null;
create table public.invitation_events (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations (id),
  job_id uuid not null references public.jobs (id),
  customer_id uuid not null references auth.users (id),
  provider_id uuid not null references auth.users (id),
  actor_id uuid not null references auth.users (id),
  from_status text not null,
  to_status text not null,
  idempotency_key text not null,
  metadata jsonb not null default '{}',
  created_date timestamptz not null default now(),
  unique (actor_id, invitation_id, idempotency_key)
);
alter table public.invitation_events enable row level security;
create policy "invitation events participant read" on public.invitation_events for select to authenticated
  using (customer_id = auth.uid() or provider_id = auth.uid() or public.is_admin());
create trigger invitation_events_immutable before update or delete on public.invitation_events
  for each row execute function public.oneforall_reject_immutable_mutation();
revoke insert, update, delete on public.invitation_events from anon, authenticated;
grant select on public.invitation_events to authenticated;

-- Admin-only managed routing. The invitation contains a bounded snapshot, not
-- the private request row, access notes, customer name or raw safety answers.
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
  v_key text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_existing public.invitations%rowtype;
  v_invitation public.invitations%rowtype;
  v_assertion_id uuid;
  v_hours integer := least(greatest(coalesce((p_payload->>'expiry_hours')::integer, 48), 1), 72);
begin
  if v_actor is null or not public.is_admin() then raise exception 'Admin review required'; end if;
  if char_length(v_key) < 8 then raise exception 'Valid idempotency key required'; end if;
  select * into v_existing from public.invitations
    where job_id = (p_payload->>'job_id')::uuid and tradie_id = v_provider and idempotency_key = v_key;
  if found then return jsonb_build_object('invitation_id', v_existing.id, 'idempotent', true); end if;
  select * into v_job from public.jobs where id = (p_payload->>'job_id')::uuid for update;
  if not found or v_job.status <> 'submitted' or v_job.scope_decision <> 'allowed'
    or v_job.hazard_screen_status <> 'passed' then raise exception 'Request is not approved for routing'; end if;
  if not public.oneforall_release_open(v_job.service_key, 'quote') then raise exception 'Quote routing is not released'; end if;
  select assertion.id into v_assertion_id from public.provider_public_assertions assertion
  where assertion.provider_id = v_provider and assertion.status = 'active'
    and assertion.superseded_by_assertion_id is null
    and assertion.valid_through >= coalesce(v_job.preferred_date, current_date)
    and assertion.approved_service_ids @> array[v_job.service_key]
    and (assertion.credential_scope @> v_job.selected_scope_ids or assertion.credential_scope @> array['*'])
  order by assertion.evidence_checked_date desc, assertion.id
  limit 1;
  if v_assertion_id is null then raise exception 'Provider has no current bounded assertion for this request'; end if;
  insert into public.invitations (
    job_id, job_title, customer_id, customer_name, tradie_id, tradie_name,
    status, service_key, selected_scope_ids, selected_scope_labels,
    service_area, preferred_date, provider_assertion_id, expires_at,
    idempotency_key, created_by
  ) values (
    v_job.id, v_job.category_name, v_job.customer_id, null, v_provider, null,
    'pending', v_job.service_key, v_job.selected_scope_ids, '{}'::text[],
    v_job.suburb, v_job.preferred_date, v_assertion_id, now() + make_interval(hours => v_hours),
    v_key, v_actor
  ) returning * into v_invitation;
  insert into public.invitation_events (invitation_id, job_id, customer_id, provider_id, actor_id, from_status, to_status, idempotency_key)
  values (v_invitation.id, v_job.id, v_job.customer_id, v_provider, v_actor, 'none', 'pending', v_key);
  insert into public.request_events (job_id, customer_id, provider_id, actor_id, from_state, to_state, idempotency_key, metadata)
  values (v_job.id, v_job.customer_id, v_provider, v_actor, 'submitted', 'published', v_key, jsonb_build_object('invitation_id', v_invitation.id));
  update public.jobs set status = 'published', version = version + 1 where id = v_job.id;
  return jsonb_build_object('invitation_id', v_invitation.id, 'expires_at', v_invitation.expires_at);
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
  v_action text := p_payload->>'action';
  v_key text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_event public.invitation_events%rowtype;
  v_worker public.provider_workers%rowtype;
  v_quote public.interest_requests%rowtype;
  v_low numeric;
  v_high numeric;
  v_service_date date;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if v_action not in ('quote','decline') or char_length(v_key) < 8 then raise exception 'Invalid invitation response'; end if;
  select * into v_invitation from public.invitations where id = (p_payload->>'invitation_id')::uuid for update;
  if not found or v_invitation.tradie_id <> v_actor then raise exception 'Invitation unavailable'; end if;
  select * into v_event from public.invitation_events where invitation_id = v_invitation.id and actor_id = v_actor and idempotency_key = v_key;
  if found then return jsonb_build_object('invitation_id', v_invitation.id, 'status', v_event.to_status, 'idempotent', true); end if;
  if v_invitation.status <> 'pending' or v_invitation.expires_at <= now() then raise exception 'Invitation expired or closed'; end if;
  if not public.oneforall_release_open(v_invitation.service_key, 'quote') then raise exception 'Quote actions are not released'; end if;

  if v_action = 'decline' then
    insert into public.invitation_events (invitation_id, job_id, customer_id, provider_id, actor_id, from_status, to_status, idempotency_key)
    values (v_invitation.id, v_invitation.job_id, v_invitation.customer_id, v_actor, v_actor, 'pending', 'declined', v_key);
    update public.invitations set status = 'declined' where id = v_invitation.id;
    return jsonb_build_object('invitation_id', v_invitation.id, 'status', 'declined');
  end if;

  if coalesce((p_payload->>'substitution_disclosed')::boolean, false) is not true then
    raise exception 'Exact attending worker disclosure is required';
  end if;
  v_low := (p_payload->>'quote_low')::numeric;
  v_high := (p_payload->>'quote_high')::numeric;
  if v_low < 0 or v_high < v_low then raise exception 'Invalid quote range'; end if;
  v_service_date := greatest(coalesce(v_invitation.preferred_date, current_date), (p_payload->>'earliest_availability')::date);
  select * into v_worker from public.provider_workers
    where id = (p_payload->>'attending_worker_id')::uuid and provider_id = v_actor;
  if not found or not public.oneforall_exact_worker_eligible(
    v_actor, v_worker.id, v_invitation.service_key, v_invitation.selected_scope_ids, v_service_date, false
  ) then raise exception 'Exact worker, evidence, offering or assertion gate failed'; end if;

  insert into public.interest_requests (
    job_id, job_title, customer_id, tradie_id, quote_low, quote_high,
    earliest_availability, message, status, response_deadline, service_key,
    selected_scope_ids, attending_worker_id, attending_worker_display_name,
    substitution_disclosed, provider_assertion_id, invitation_id,
    idempotency_key, created_by
  ) values (
    v_invitation.job_id, v_invitation.job_title, v_invitation.customer_id, v_actor,
    v_low, v_high, (p_payload->>'earliest_availability')::date,
    left(btrim(coalesce(p_payload->>'message','')), 1000), 'pending',
    least(v_invitation.expires_at, now() + interval '48 hours'),
    v_invitation.service_key, v_invitation.selected_scope_ids,
    v_worker.id, v_worker.display_name, true, v_invitation.provider_assertion_id,
    v_invitation.id, v_key, v_actor
  ) returning * into v_quote;
  insert into public.invitation_events (invitation_id, job_id, customer_id, provider_id, actor_id, from_status, to_status, idempotency_key, metadata)
  values (v_invitation.id, v_invitation.job_id, v_invitation.customer_id, v_actor, v_actor, 'pending', 'responded', v_key, jsonb_build_object('quote_id', v_quote.id));
  update public.invitations set status = 'responded' where id = v_invitation.id;
  insert into public.notifications (user_id, type, title, body, link, created_by)
  values (v_invitation.customer_id, 'managed_quote', 'A managed quote is ready', v_invitation.job_title, '/bookings', v_actor);
  return jsonb_build_object('quote_id', v_quote.id, 'status', 'pending');
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
  v_service_date date;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if char_length(v_key) < 8 or coalesce((p_payload->>'worker_acknowledged')::boolean, false) is not true then
    raise exception 'Idempotency key and worker acknowledgement are required';
  end if;
  select * into v_booking from public.bookings where customer_id = v_actor and job_id = (p_payload->>'job_id')::uuid and idempotency_key = v_key;
  if found then return jsonb_build_object('booking_id', v_booking.id, 'idempotent', true); end if;
  select * into v_job from public.jobs where id = (p_payload->>'job_id')::uuid for update;
  select * into v_quote from public.interest_requests where id = (p_payload->>'quote_id')::uuid for update;
  if v_job.id is null or v_quote.id is null or v_job.customer_id <> v_actor or v_quote.customer_id <> v_actor
    or v_quote.job_id <> v_job.id or v_quote.status <> 'pending'
    or v_quote.response_deadline <= now() or v_job.status <> 'published'
    or v_job.scope_decision <> 'allowed' or v_job.hazard_screen_status <> 'passed' then
    raise exception 'Quote cannot be accepted';
  end if;
  if not public.oneforall_release_open(v_job.service_key, 'booking') then raise exception 'Booking is not released'; end if;
  if not v_quote.substitution_disclosed or v_quote.attending_worker_id is null then raise exception 'Exact attending worker is not disclosed'; end if;
  v_service_date := greatest(coalesce(v_job.preferred_date, current_date), coalesce(v_quote.earliest_availability, current_date));
  if not public.oneforall_exact_worker_eligible(
    v_quote.tradie_id, v_quote.attending_worker_id, v_job.service_key, v_job.selected_scope_ids, v_service_date, true
  ) then raise exception 'Exact worker, evidence, offering or assertion gate failed'; end if;
  select * into v_worker from public.provider_workers where id = v_quote.attending_worker_id;

  insert into public.bookings (
    job_id, quote_id, customer_id, provider_id, service_key, selected_scope_ids,
    attending_worker_id, attending_worker_display_name, substitution_disclosed,
    customer_worker_acknowledged, scope_decision, hazard_screen_status,
    state, idempotency_key
  ) values (
    v_job.id, v_quote.id, v_actor, v_quote.tradie_id, v_job.service_key,
    v_job.selected_scope_ids, v_worker.id, v_worker.display_name, true, true,
    v_job.scope_decision, v_job.hazard_screen_status, 'accepted', v_key
  ) returning * into v_booking;
  update public.interest_requests set status = case when id = v_quote.id then 'accepted' else 'declined' end,
    booking_id = case when id = v_quote.id then v_booking.id else booking_id end
    where job_id = v_job.id and status = 'pending';
  update public.invitations set status = 'expired' where job_id = v_job.id and status in ('pending','responded');
  update public.jobs set status = 'matched', booking_id = v_booking.id,
    accepted_quote_id = v_quote.id, assigned_tradie_id = v_quote.tradie_id,
    version = version + 1 where id = v_job.id;
  insert into public.booking_events (booking_id, job_id, customer_id, provider_id, actor_id, from_state, to_state, idempotency_key)
  values (v_booking.id, v_job.id, v_actor, v_quote.tradie_id, v_actor, 'none', 'accepted', v_key);
  insert into public.conversations (job_id, job_title, customer_id, tradie_id, contact_unlocked, created_by)
  select v_job.id, v_job.category_name, v_actor, v_quote.tradie_id, true, v_actor
  where not exists (select 1 from public.conversations where job_id = v_job.id and tradie_id = v_quote.tradie_id);
  insert into public.notifications (user_id, type, title, body, link, created_by)
  values (v_quote.tradie_id, 'booking_confirmed', 'Booking confirmed', v_job.category_name, '/provider/jobs', v_actor);
  return jsonb_build_object('booking_id', v_booking.id, 'state', 'accepted');
end;
$$;

-- ---------------------------------------------------------------------------
-- Founder and manual-review approval boundaries.
-- No release-control mutation RPC exists in this checkpoint.
-- ---------------------------------------------------------------------------
create table public.founder_approval_decisions (
  id uuid primary key default gen_random_uuid(),
  decision_key text not null,
  scope_type text not null check (scope_type in ('service_release','provider_assertion','regulated_service','public_claim')),
  scope_id text not null,
  decision text not null check (decision in ('approved','rejected')),
  payload_fingerprint text not null,
  decision_reason text not null,
  founder_user_id uuid not null references auth.users (id),
  supersedes_decision_id uuid references public.founder_approval_decisions (id),
  idempotency_key text not null,
  created_date timestamptz not null default now(),
  unique (founder_user_id, idempotency_key)
);
alter table public.founder_approval_decisions enable row level security;
create policy "founder decisions founder read" on public.founder_approval_decisions for select to authenticated
  using (founder_user_id = auth.uid() or public.is_admin());
create trigger founder_approval_decisions_immutable before update or delete on public.founder_approval_decisions
  for each row execute function public.oneforall_reject_immutable_mutation();
revoke insert, update, delete on public.founder_approval_decisions from anon, authenticated;
grant select on public.founder_approval_decisions to authenticated;

create or replace function public.oneforall_is_founder()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and public.is_admin()
    and coalesce(auth.jwt()->'app_metadata'->>'oneforall_founder', 'false') = 'true';
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
  select * into v_existing from public.founder_approval_decisions where founder_user_id = v_actor and idempotency_key = v_key;
  if found then
    if v_existing.payload_fingerprint is distinct from p_payload->>'payload_fingerprint'
      or v_existing.decision is distinct from p_payload->>'decision'
      or v_existing.scope_id is distinct from p_payload->>'scope_id' then
      raise exception 'Founder decision idempotency conflict';
    end if;
    return jsonb_build_object('decision_id', v_existing.id, 'idempotent', true);
  end if;
  insert into public.founder_approval_decisions (
    decision_key, scope_type, scope_id, decision, payload_fingerprint,
    decision_reason, founder_user_id, supersedes_decision_id, idempotency_key
  ) values (
    left(p_payload->>'decision_key', 160), p_payload->>'scope_type', left(p_payload->>'scope_id', 200),
    p_payload->>'decision', p_payload->>'payload_fingerprint', left(p_payload->>'decision_reason', 2000),
    v_actor, nullif(p_payload->>'supersedes_decision_id','')::uuid, v_key
  ) returning * into v_decision;
  return jsonb_build_object('decision_id', v_decision.id, 'decision', v_decision.decision);
end;
$$;

-- An operations/admin reviewer may resolve a private manual-review request, but
-- cannot override an emergency/prohibited classification, publish it, notify a
-- provider, or act while the target request pathway is unreleased.
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
  v_scopes text[];
  v_classification text;
  v_class_reason text;
  v_screen jsonb;
  v_event public.request_events%rowtype;
begin
  if v_actor is null or not public.is_admin() then raise exception 'Admin review required'; end if;
  if v_action not in ('approve','reclassify','restrict') or char_length(v_reason) < 10 or char_length(v_key) < 8 then
    raise exception 'Complete review decision required';
  end if;
  select * into v_job from public.jobs where id = (p_payload->>'job_id')::uuid for update;
  if not found or v_job.status <> 'manual_review' then raise exception 'Manual-review request unavailable'; end if;
  select * into v_event from public.request_events where actor_id = v_actor and job_id = v_job.id and idempotency_key = v_key;
  if found then return jsonb_build_object('job_id', v_job.id, 'status', v_event.to_state, 'idempotent', true); end if;
  select * into v_target from public.service_definitions
    where service_key = coalesce(nullif(p_payload->>'target_service_key',''), v_job.service_key);
  if not found or not public.oneforall_release_open(v_target.service_key, 'request') then raise exception 'Target request pathway is not released'; end if;
  select coalesce(array_agg(value), v_job.selected_scope_ids) into v_scopes
  from jsonb_array_elements_text(coalesce(p_payload->'selected_scope_ids', to_jsonb(v_job.selected_scope_ids)));
  v_screen := p_payload || jsonb_build_object(
    'service_key', v_target.service_key,
    'selected_scope_ids', to_jsonb(v_scopes),
    'scope_description', v_job.description,
    'suburb', v_job.suburb
  );
  select classified.decision, classified.reason into v_classification, v_class_reason
  from public.oneforall_classify_request(v_target.service_key, v_screen) classified;
  if v_classification = 'blocked' and v_action <> 'restrict' then
    raise exception 'Admin review cannot override blocked or emergency scope';
  end if;
  if v_action in ('approve','reclassify') and v_classification <> 'allowed' then
    raise exception 'Manual-review override is not enabled; an exact bounded founder decision and dedicated consumption flow are required';
  end if;
  if v_action = 'restrict' then
    insert into public.request_events (job_id, customer_id, actor_id, from_state, to_state, idempotency_key, metadata)
    values (v_job.id, v_job.customer_id, v_actor, 'manual_review', 'cancelled', v_key,
      jsonb_build_object('decision','restricted','reason',v_reason,'classification_reason',v_class_reason));
    update public.jobs set status = 'cancelled', scope_decision = 'blocked',
      hazard_screen_status = 'blocked', private_review_reason = v_reason, version = version + 1
    where id = v_job.id;
    return jsonb_build_object('job_id', v_job.id, 'status', 'cancelled');
  end if;
  update public.jobs set service_key = v_target.service_key, category_slug = v_target.category_slug,
    category_name = v_target.name, pathway = v_target.pathway, selected_scope_ids = v_scopes,
    scope_decision = 'allowed', hazard_screen_status = 'passed', status = 'submitted',
    private_review_reason = v_reason, policy_version = v_target.policy_version, version = version + 1
  where id = v_job.id;
  insert into public.request_events (job_id, customer_id, actor_id, from_state, to_state, idempotency_key, metadata)
  values (v_job.id, v_job.customer_id, v_actor, 'manual_review', 'submitted', v_key,
    jsonb_build_object('decision',v_action,'reason',v_reason,'from_service',v_job.service_key,'to_service',v_target.service_key,'classification_reason',v_class_reason));
  return jsonb_build_object('job_id', v_job.id, 'status', 'submitted', 'service_key', v_target.service_key);
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
  v_required_expiry boolean;
begin
  if v_actor is null or not public.is_admin() then raise exception 'Admin review required'; end if;
  if v_decision not in ('verified','rejected') or char_length(v_reason) < 10 or char_length(v_key) < 8 then
    raise exception 'Complete evidence decision required';
  end if;
  select * into v_evidence from public.provider_evidence where id = (p_payload->>'evidence_id')::uuid for update;
  if not found or v_evidence.provider_id = v_actor then raise exception 'Independent evidence review required'; end if;
  select * into v_event from public.provider_review_events
    where reviewer_id = v_actor and resource_type = 'evidence' and resource_id = v_evidence.id and idempotency_key = v_key;
  if found then return jsonb_build_object('evidence_id', v_evidence.id, 'status', v_event.to_status, 'idempotent', true); end if;
  if v_evidence.submission_status not in ('submitted','under_review') or v_evidence.superseded_by_evidence_id is not null then
    raise exception 'Evidence is not reviewable';
  end if;
  select coalesce(bool_or((requirement->>'expiry_required')::boolean), false) into v_required_expiry
  from public.service_definitions service,
    lateral jsonb_array_elements(service.evidence_requirements) requirement
  where service.service_key = v_evidence.submitted_service_key
    and requirement->>'evidence_type' = v_evidence.evidence_type
    and requirement->>'subject' = v_evidence.subject_type;
  if v_decision = 'verified' and (
    v_evidence.submitted_service_key is null
    or cardinality(v_evidence.submitted_scope_ids) = 0
    or (v_required_expiry and (v_evidence.expires_date is null or v_evidence.expires_date <= now()))
    or (v_evidence.evidence_type = 'abn_entity_match' and v_evidence.abn_entity_match is not true)
  ) then raise exception 'Evidence does not meet exact configured requirements'; end if;
  insert into public.provider_review_events (provider_id, resource_type, resource_id, from_status, to_status, reviewer_id, decision_reason, idempotency_key)
  values (v_evidence.provider_id, 'evidence', v_evidence.id, v_evidence.review_status, v_decision, v_actor, v_reason, v_key);
  update public.provider_evidence set review_status = v_decision,
    submission_status = case when v_decision = 'rejected' then 'changes_required' else 'under_review' end,
    service_scopes = case when v_decision = 'verified' then array[v_evidence.submitted_service_key] else service_scopes end,
    approved_scope_ids = case when v_decision = 'verified' then v_evidence.submitted_scope_ids else approved_scope_ids end,
    version = version + 1
  where id = v_evidence.id;
  return jsonb_build_object('evidence_id', v_evidence.id, 'status', v_decision);
end;
$$;

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
  v_to text := p_payload->>'to_state';
  v_key text := btrim(coalesce(p_payload->>'idempotency_key',''));
  v_expected integer := (p_payload->>'expected_version')::integer;
  v_role text;
  v_scheduled timestamptz;
  v_service_date date;
  v_job_status text;
  v_reason text := btrim(coalesce(p_payload->>'reason',''));
begin
  if v_actor is null or char_length(v_key) < 8 then raise exception 'Authentication and idempotency key required'; end if;
  select * into v_booking from public.bookings where id = (p_payload->>'booking_id')::uuid for update;
  if not found then raise exception 'Booking unavailable'; end if;
  select * into v_event from public.booking_events where booking_id = v_booking.id and actor_id = v_actor and idempotency_key = v_key;
  if found then
    if v_event.to_state is distinct from v_to then raise exception 'Booking idempotency conflict'; end if;
    return jsonb_build_object('booking_id', v_booking.id, 'state', v_event.to_state, 'idempotent', true);
  end if;
  if public.is_admin() then v_role := 'admin';
  elsif v_actor = v_booking.customer_id then v_role := 'customer';
  elsif v_actor = v_booking.provider_id then v_role := 'provider';
  else raise exception 'Booking unavailable';
  end if;
  if v_expected is distinct from v_booking.version then raise exception 'Booking changed; reload before retrying'; end if;
  if not public.oneforall_release_open(v_booking.service_key, 'booking') then raise exception 'Booking actions are not released'; end if;
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
    v_scheduled := (p_payload->>'scheduled_start')::timestamptz;
    if v_scheduled <= now() then raise exception 'Confirmed schedule must be in the future'; end if;
  else
    v_scheduled := v_booking.scheduled_start;
  end if;
  if v_to = 'in_progress' and (v_booking.scheduled_start is null or now() < v_booking.scheduled_start) then
    raise exception 'Work cannot start before the confirmed schedule';
  end if;
  if v_to in ('scheduled','in_progress') then
    v_service_date := coalesce(
      (v_scheduled at time zone 'Australia/Melbourne')::date,
      (now() at time zone 'Australia/Melbourne')::date
    );
    if not public.oneforall_exact_worker_eligible(
      v_booking.provider_id, v_booking.attending_worker_id, v_booking.service_key,
      v_booking.selected_scope_ids, v_service_date, true
    ) then raise exception 'Exact worker or evidence is no longer eligible'; end if;
  end if;
  insert into public.booking_events (
    booking_id, job_id, customer_id, provider_id, actor_id,
    from_state, to_state, idempotency_key, metadata
  ) values (
    v_booking.id, v_booking.job_id, v_booking.customer_id, v_booking.provider_id,
    v_actor, v_booking.state, v_to, v_key,
    case
      when v_to = 'scheduled' then jsonb_build_object('scheduled_start',v_scheduled)
      when v_to in ('cancelled','disputed') then jsonb_build_object('reason',v_reason)
      else '{}'::jsonb
    end
  );
  update public.bookings set state = v_to, scheduled_start = v_scheduled, version = version + 1 where id = v_booking.id;
  v_job_status := case v_to when 'in_progress' then 'in_progress' when 'disputed' then 'in_progress'
    when 'completed' then 'completed' when 'cancelled' then 'cancelled' else 'matched' end;
  update public.jobs set status = v_job_status, version = version + 1 where id = v_booking.job_id;
  return jsonb_build_object('booking_id', v_booking.id, 'state', v_to, 'version', v_booking.version + 1);
end;
$$;

-- Explicit function privileges. SECURITY DEFINER does not mean public access:
-- helpers/trigger functions remain unavailable, and every callable RPC still
-- performs its own participant/admin/founder check.
revoke execute on function public.set_updated_date() from public, anon, authenticated;
revoke execute on function public.prevent_role_escalation() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon, authenticated;
revoke execute on function public.oneforall_reject_immutable_mutation() from public, anon, authenticated;
revoke execute on function public.oneforall_release_open(text, text) from public, anon, authenticated;
revoke execute on function public.oneforall_classify_request(text, jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_exact_worker_eligible(uuid, uuid, text, text[], date, boolean) from public, anon, authenticated;
revoke execute on function public.oneforall_is_founder() from public, anon, authenticated;

revoke execute on function public.oneforall_set_account_type(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_ensure_customer_profile(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_submit_request(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_transition_request(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_send_message(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_invite_provider(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_respond_invitation(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_accept_quote(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_record_founder_decision(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_review_request(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_review_provider_evidence(jsonb) from public, anon, authenticated;
revoke execute on function public.oneforall_transition_booking(jsonb) from public, anon, authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.oneforall_set_account_type(jsonb) to authenticated;
grant execute on function public.oneforall_ensure_customer_profile(jsonb) to authenticated;
grant execute on function public.oneforall_submit_request(jsonb) to authenticated;
grant execute on function public.oneforall_transition_request(jsonb) to authenticated;
grant execute on function public.oneforall_send_message(jsonb) to authenticated;
grant execute on function public.oneforall_invite_provider(jsonb) to authenticated;
grant execute on function public.oneforall_respond_invitation(jsonb) to authenticated;
grant execute on function public.oneforall_accept_quote(jsonb) to authenticated;
grant execute on function public.oneforall_record_founder_decision(jsonb) to authenticated;
grant execute on function public.oneforall_review_request(jsonb) to authenticated;
grant execute on function public.oneforall_review_provider_evidence(jsonb) to authenticated;
grant execute on function public.oneforall_transition_booking(jsonb) to authenticated;

comment on table public.founder_approval_decisions is
  'Immutable founder decisions. This checkpoint intentionally exposes no RPC that changes service release flags or publishes provider assertions; those remain release blockers.';
comment on function public.oneforall_review_request(jsonb) is
  'Fail-closed manual review: only a reclassification that the canonical classifier now marks allowed can progress. Manual/regulated override remains a release blocker.';
