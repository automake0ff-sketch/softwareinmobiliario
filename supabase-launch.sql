-- Supabase launch schema for softwareinmobiliario.
-- Run this in Supabase SQL Editor before deploying Vercel with:
-- VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
-- VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
--
-- Important for immediate launch:
-- Authentication > Providers > Email > disable "Confirm email" while testing,
-- or the app cannot create agency/profile rows until the user confirms email.

create extension if not exists pgcrypto;

create table if not exists public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  email text,
  phone text,
  whatsapp_number text,
  address text,
  city text,
  province text,
  country text default 'ES',
  website text,
  instagram text,
  facebook text,
  linkedin text,
  tiktok text,
  logo_url text,
  primary_color text default '#6366f1',
  secondary_color text default '#8b5cf6',
  custom_domain text,
  plan text default 'starter',
  plan_status text default 'trialing',
  timezone text default 'Europe/Madrid',
  language text default 'es',
  bot_name text default 'Asistente IA',
  bot_tone text default 'profesional',
  onboarding_completed boolean default false,
  onboarding_step integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create table if not exists public.offices (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  city text,
  address text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  name text not null,
  role text not null default 'admin' check (role in ('admin','manager','comercial','ia_agent')),
  agency_id uuid references public.agencies(id) on delete set null,
  office_id uuid references public.offices(id) on delete set null,
  avatar text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  assigned_to uuid references public.users(id) on delete set null,
  name text not null,
  phone text,
  email text,
  budget numeric,
  zone text,
  property_interest text,
  source text default 'manual',
  status text not null default 'nuevo',
  ia_score numeric default 0,
  ia_score_label text,
  ia_insight text,
  ia_insights text,
  ia_summary text,
  ia_next_action text,
  pipeline_stage text,
  pipeline_stage_updated_at timestamptz,
  last_activity timestamptz,
  last_contact_at timestamptz,
  operation_type text,
  budget_max numeric,
  zones text,
  urgency text,
  property_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  title text not null,
  description text,
  price numeric not null default 0,
  type text not null default 'apartment',
  operation_type text default 'sale',
  city text not null default 'Pendiente',
  zone text,
  address text,
  province text,
  postal_code text,
  bedrooms integer default 0,
  bathrooms integer default 0,
  surface numeric,
  floor text,
  has_elevator boolean default false,
  has_terrace boolean default false,
  has_garage boolean default false,
  condition text,
  features text,
  images text,
  status text not null default 'disponible',
  source text default 'manual',
  external_source text,
  external_id text,
  external_url text,
  imported_at timestamptz,
  assigned_to uuid references public.users(id) on delete set null,
  quality_score integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  agent_id uuid references public.users(id) on delete set null,
  channel text default 'web',
  messages text,
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  type text not null,
  title text,
  description text not null,
  metadata text,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade unique,
  plan_id text not null default 'starter',
  status text default 'trialing',
  billing_cycle text default 'monthly',
  trial_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade unique,
  leads_this_month integer default 0,
  ai_calls_this_month integer default 0,
  whatsapp_messages_this_month integer default 0,
  automations_run_this_month integer default 0,
  period_start date default date_trunc('month', now())::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_users_agency on public.users(agency_id);
create index if not exists idx_leads_agency on public.leads(agency_id);
create index if not exists idx_properties_agency on public.properties(agency_id);
create index if not exists idx_activities_agency on public.activities(agency_id);
create index if not exists idx_conversations_agency on public.conversations(agency_id);

alter table public.agencies enable row level security;
alter table public.offices enable row level security;
alter table public.users enable row level security;
alter table public.leads enable row level security;
alter table public.properties enable row level security;
alter table public.conversations enable row level security;
alter table public.activities enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_counters enable row level security;

drop policy if exists "authenticated can create agency" on public.agencies;
create policy "authenticated can create agency"
on public.agencies for insert
to authenticated
with check (true);

drop policy if exists "agency members can read agencies" on public.agencies;
create policy "agency members can read agencies"
on public.agencies for select
to authenticated
using (id in (select agency_id from public.users where users.id = auth.uid()));

drop policy if exists "agency admins can update agency" on public.agencies;
create policy "agency admins can update agency"
on public.agencies for update
to authenticated
using (id in (select agency_id from public.users where users.id = auth.uid()))
with check (id in (select agency_id from public.users where users.id = auth.uid()));

drop policy if exists "users can create own profile" on public.users;
create policy "users can create own profile"
on public.users for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "agency members can read users" on public.users;
create policy "agency members can read users"
on public.users for select
to authenticated
using (
  id = auth.uid()
  or agency_id in (select agency_id from public.users where users.id = auth.uid())
);

drop policy if exists "users can update own profile" on public.users;
create policy "users can update own profile"
on public.users for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create or replace function public.current_agency_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select agency_id from public.users where id = auth.uid()
$$;

drop policy if exists "agency members can manage offices" on public.offices;
create policy "agency members can manage offices"
on public.offices for all
to authenticated
using (agency_id = public.current_agency_id())
with check (agency_id = public.current_agency_id());

drop policy if exists "agency members can manage leads" on public.leads;
create policy "agency members can manage leads"
on public.leads for all
to authenticated
using (agency_id = public.current_agency_id())
with check (agency_id = public.current_agency_id());

drop policy if exists "agency members can manage properties" on public.properties;
create policy "agency members can manage properties"
on public.properties for all
to authenticated
using (agency_id = public.current_agency_id())
with check (agency_id = public.current_agency_id());

drop policy if exists "agency members can manage conversations" on public.conversations;
create policy "agency members can manage conversations"
on public.conversations for all
to authenticated
using (agency_id = public.current_agency_id())
with check (agency_id = public.current_agency_id());

drop policy if exists "agency members can manage activities" on public.activities;
create policy "agency members can manage activities"
on public.activities for all
to authenticated
using (agency_id = public.current_agency_id())
with check (agency_id = public.current_agency_id());

drop policy if exists "agency members can manage subscriptions" on public.subscriptions;
create policy "agency members can manage subscriptions"
on public.subscriptions for all
to authenticated
using (agency_id = public.current_agency_id())
with check (agency_id = public.current_agency_id());

drop policy if exists "agency members can manage usage counters" on public.usage_counters;
create policy "agency members can manage usage counters"
on public.usage_counters for all
to authenticated
using (agency_id = public.current_agency_id())
with check (agency_id = public.current_agency_id());