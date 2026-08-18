-- OneForAll — initial Supabase schema
-- Base tables, defaults and row-level security for the Supabase runtime.
-- Run this in the Supabase SQL editor (or `supabase db push`).

-- ============================================================
-- Helpers
-- ============================================================

create or replace function public.set_updated_date()
returns trigger language plpgsql as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

-- ============================================================
-- App users (account_type + role live here; auth itself is in auth.users)
-- ============================================================

create table public.app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  account_type text check (account_type in ('customer', 'tradie')),
  role text not null default 'user' check (role in ('admin', 'user')),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.app_users enable row level security;

create policy "read own user row" on public.app_users
  for select to authenticated using (id = auth.uid());

-- Users must not be able to grant themselves admin.
create or replace function public.prevent_role_escalation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.role is distinct from old.role then
    if not exists (select 1 from public.app_users where id = auth.uid() and role = 'admin') then
      new.role := old.role;
    end if;
  end if;
  return new;
end;
$$;

create trigger app_users_role_guard before update on public.app_users
  for each row execute function public.prevent_role_escalation();

create trigger app_users_updated before update on public.app_users
  for each row execute function public.set_updated_date();

-- Create the app_users row automatically when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.app_users (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.app_users where id = auth.uid() and role = 'admin');
$$;

-- ============================================================
-- Entity tables
-- Every table carries consistent application columns:
-- id, created_date, updated_date, created_by
-- ============================================================

-- ---------- customer_profiles ----------
create table public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null,
  suburb text,
  state text default 'VIC',
  mobile text,
  mobile_verified boolean default false,
  email_verified boolean default true,
  response_rate numeric default 100,
  avg_response_minutes numeric default 60,
  completed_jobs numeric default 0,
  abandoned_posts numeric default 0,
  created_by uuid default auth.uid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.customer_profiles enable row level security;
create policy "cp read own" on public.customer_profiles for select to authenticated using (user_id = auth.uid());
create trigger customer_profiles_updated before update on public.customer_profiles
  for each row execute function public.set_updated_date();

-- ---------- tradie_profiles ----------
create table public.tradie_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null,
  business_name text,
  abn text,
  trade_categories text[] default '{}',
  licence_number text,
  licence_type text,
  insurance_provider text,
  insurance_policy_number text,
  public_liability boolean default false,
  qualifications text,
  experience_years numeric default 0,
  service_areas text[] default '{}',
  service_radius_km numeric default 20,
  open_to_work boolean default true,
  bio text,
  portfolio_photos text[] default '{}',
  avatar_url text,
  verified boolean default false,
  founding_badge boolean default false,
  rating_avg numeric default 0,
  rating_count numeric default 0,
  suburb text,
  state text default 'VIC',
  created_by uuid default auth.uid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.tradie_profiles enable row level security;
create policy "tp read own or admin" on public.tradie_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create trigger tradie_profiles_updated before update on public.tradie_profiles
  for each row execute function public.set_updated_date();

-- ---------- jobs ----------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  customer_name text,
  customer_suburb text,
  title text not null,
  description text,
  category_slug text not null,
  category_name text,
  suburb text,
  state text default 'VIC',
  preferred_date date,
  urgency text default 'flexible' check (urgency in ('flexible', 'this_week', 'urgent')),
  access_notes text,
  parking text default 'on_street' check (parking in ('on_street', 'driveway', 'none')),
  safety_info text,
  budget numeric,
  indicative_low numeric,
  indicative_high numeric,
  photos text[] default '{}',
  status text default 'draft' check (status in ('draft', 'published', 'matched', 'in_progress', 'completed', 'cancelled')),
  boosted boolean default false,
  assigned_tradie_id uuid,
  created_by uuid default auth.uid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.jobs enable row level security;
-- Requests are private. Providers receive bounded invitation snapshots instead
-- of an authenticated open Job feed. Authoritative writes use RPC functions.
create policy "jobs read participants" on public.jobs for select to authenticated
  using (customer_id = auth.uid() or assigned_tradie_id = auth.uid() or public.is_admin());
create trigger jobs_updated before update on public.jobs
  for each row execute function public.set_updated_date();

-- ---------- interest_requests ----------
create table public.interest_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  job_title text,
  customer_id uuid,
  tradie_id uuid not null,
  tradie_name text,
  tradie_business text,
  quote_low numeric,
  quote_high numeric,
  earliest_availability date,
  message text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  response_deadline timestamptz,
  created_by uuid default auth.uid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.interest_requests enable row level security;
create policy "ir read participants" on public.interest_requests for select to authenticated
  using (customer_id = auth.uid() or tradie_id = auth.uid());
create trigger interest_requests_updated before update on public.interest_requests
  for each row execute function public.set_updated_date();

-- ---------- invitations ----------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  job_title text,
  customer_id uuid not null,
  customer_name text,
  tradie_id uuid not null,
  tradie_name text,
  status text not null default 'pending' check (status in ('pending', 'responded', 'declined')),
  quote_low numeric,
  quote_high numeric,
  earliest_availability date,
  message text,
  created_by uuid default auth.uid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.invitations enable row level security;
create policy "inv read participants" on public.invitations for select to authenticated
  using (customer_id = auth.uid() or tradie_id = auth.uid());
create trigger invitations_updated before update on public.invitations
  for each row execute function public.set_updated_date();

-- ---------- conversations ----------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  job_title text,
  customer_id uuid not null,
  tradie_id uuid not null,
  contact_unlocked boolean default false,
  created_by uuid default auth.uid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.conversations enable row level security;
create policy "conv read participants" on public.conversations for select to authenticated
  using (customer_id = auth.uid() or tradie_id = auth.uid());
create trigger conversations_updated before update on public.conversations
  for each row execute function public.set_updated_date();

-- ---------- messages ----------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  customer_id uuid,
  tradie_id uuid,
  sender_id uuid not null,
  sender_name text,
  body text not null,
  created_by uuid default auth.uid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.messages enable row level security;
create policy "msg read participants" on public.messages for select to authenticated
  using (customer_id = auth.uid() or tradie_id = auth.uid());
create trigger messages_updated before update on public.messages
  for each row execute function public.set_updated_date();

-- ---------- notifications ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read boolean default false,
  created_by uuid default auth.uid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.notifications enable row level security;
create policy "notif read own" on public.notifications for select to authenticated using (user_id = auth.uid());
create trigger notifications_updated before update on public.notifications
  for each row execute function public.set_updated_date();

-- ---------- reviews ----------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  reviewer_id uuid not null,
  reviewer_name text,
  reviewee_id uuid not null,
  rating numeric not null check (rating >= 1 and rating <= 5),
  body text,
  role text check (role in ('customer_to_tradie', 'tradie_to_customer')),
  created_by uuid default auth.uid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.reviews enable row level security;
create policy "rev read all" on public.reviews for select to authenticated using (true);
create trigger reviews_updated before update on public.reviews
  for each row execute function public.set_updated_date();

-- ---------- subscriptions ----------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tradie_id uuid not null references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'local', 'pro')),
  status text default 'trial' check (status in ('active', 'expired', 'cancelled', 'trial')),
  started_date timestamptz,
  expires_date timestamptz,
  founding_trial boolean default false,
  cancel_at_period_end boolean default false,
  created_by uuid default auth.uid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create policy "sub read own" on public.subscriptions for select to authenticated using (tradie_id = auth.uid());
create trigger subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_date();

-- ---------- boosts ----------
create table public.boosts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  customer_id uuid not null,
  type text not null default 'free' check (type in ('free', 'paid')),
  created_by uuid default auth.uid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.boosts enable row level security;
create policy "boost read own" on public.boosts for select to authenticated using (customer_id = auth.uid());
create trigger boosts_updated before update on public.boosts
  for each row execute function public.set_updated_date();

-- ---------- service_categories ----------
create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  icon text,
  description text,
  sort_order numeric default 0,
  is_active boolean default true,
  created_by uuid default auth.uid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
alter table public.service_categories enable row level security;
create policy "cat read all" on public.service_categories for select to anon, authenticated using (true);
create policy "cat admin insert" on public.service_categories for insert to authenticated with check (public.is_admin());
create policy "cat admin update" on public.service_categories for update to authenticated using (public.is_admin());
create policy "cat admin delete" on public.service_categories for delete to authenticated using (public.is_admin());
create trigger service_categories_updated before update on public.service_categories
  for each row execute function public.set_updated_date();

insert into public.service_categories (name, slug, icon, sort_order) values
  ('Electrical', 'electrical', 'Zap', 1),
  ('Plumbing', 'plumbing', 'Droplets', 2),
  ('Carpentry', 'carpentry', 'Hammer', 3),
  ('Building & Renovation', 'building', 'HardHat', 4),
  ('Painting', 'painting', 'PaintRoller', 5),
  ('Gardening & Outdoor', 'gardening', 'Trees', 6),
  ('Cleaning', 'cleaning', 'Sparkles', 7),
  ('General Maintenance', 'maintenance', 'Wrench', 8),
  ('Not sure what I need', 'unsure', 'HelpCircle', 9);

-- ============================================================
-- Useful indexes
-- ============================================================

create index jobs_status_idx on public.jobs (status);
create index jobs_customer_idx on public.jobs (customer_id);
create index interest_requests_job_idx on public.interest_requests (job_id);
create index interest_requests_tradie_idx on public.interest_requests (tradie_id);
create index invitations_tradie_idx on public.invitations (tradie_id);
create index conversations_customer_idx on public.conversations (customer_id);
create index conversations_tradie_idx on public.conversations (tradie_id);
create index messages_conversation_idx on public.messages (conversation_id);
create index notifications_user_idx on public.notifications (user_id);
create index reviews_job_idx on public.reviews (job_id);
create index subscriptions_tradie_idx on public.subscriptions (tradie_id);
create index tradie_profiles_user_idx on public.tradie_profiles (user_id);
create index customer_profiles_user_idx on public.customer_profiles (user_id);

-- ============================================================
-- Storage: private owner-readable bucket. Upload writes stay unavailable until
-- a bounded evidence/request upload operation is approved.
-- ============================================================

insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false)
on conflict (id) do nothing;

create policy "uploads owner read" on storage.objects
  for select to authenticated using (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);
