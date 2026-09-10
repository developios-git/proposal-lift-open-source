-- ============================================================================
-- ProposalLift (open source) — baseline schema
--
-- Creates the entire database on a fresh Supabase project. Self-hosters apply
-- it by pasting this whole file into the Supabase SQL editor once, before the
-- first start (README.md). Contributors get it from
-- `npm run db:reset` against a local stack.
--
-- Single-user model: every row is owned by a user via `user_id` and isolated
-- with RLS (`user_id = auth.uid()`). There are no organizations, teams,
-- memberships, billing, credits, or plans.
--
-- Do not edit or rename this file after release. Its version string is
-- recorded in each install's supabase_migrations.schema_migrations table;
-- ship schema changes as new timestamped migrations alongside it.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Extensions
--
-- pgvector must live in `public` — public.projects.embedding and
-- public.match_portfolio_projects() are both typed against public.vector.
-- pgcrypto (gen_random_uuid) and uuid-ossp are provisioned by Supabase.
--
-- pg_cron / pg_net are deliberately absent. Scheduled job alerts only work on
-- a publicly reachable deployment, so that setup ships as a copy-paste snippet
-- in docs/cron.md rather than as schema.
-- ----------------------------------------------------------------------------

create extension if not exists "vector" with schema "public";


-- ----------------------------------------------------------------------------
-- 2. Types
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'onboarding_flow_status') then
    create type public.onboarding_flow_status as enum (
      'not_started',
      'in_progress',
      'completed',
      'skipped'
    );
  end if;
end
$$;


-- ----------------------------------------------------------------------------
-- 3. Tables
-- ----------------------------------------------------------------------------

-- Profile data for the signed-in user. Feeds proposal generation.
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  full_name           text,
  avatar_url          text,
  bio                 text,
  role_title          text,
  location            text,
  timezone            text,
  years_of_experience integer,
  skills              text[] default '{}'::text[],
  specializations     text[] default '{}'::text[],
  certifications      text[] default '{}'::text[],
  upwork_url          text,
  linkedin_url        text,
  website_url         text,
  github_url          text,
  is_verified         boolean default false not null
);

comment on column public.profiles.is_verified is 'Email confirmed (mirrors auth.users.email_confirmed_at).';


-- Per-user AI keys, Upwork OAuth credentials, and feed preferences.
-- API keys are BYOK: there is no platform fallback key.
create table if not exists public.user_settings (
  id                                  uuid primary key default gen_random_uuid(),
  user_id                             uuid not null unique references auth.users (id) on delete cascade,
  created_at                          timestamptz default now() not null,
  updated_at                          timestamptz default now() not null,
  openai_api_key                      text,
  openai_model                        text default 'gpt-5.5'::text,
  openai_effort                       text default 'medium'::text,
  openai_max_tokens                   integer default 2000,
  anthropic_api_key                   text,
  anthropic_model                     text default 'claude-sonnet-5'::text,
  anthropic_effort                    text default 'medium'::text,
  anthropic_max_tokens                integer default 2000,
  fallback_model                      text default 'gpt-5.5'::text,
  system_prompt                       text,
  knowledge_base                      text,
  upwork_client_id                    text,
  upwork_client_secret_encrypted      text,
  upwork_oauth_credentials_updated_at timestamptz,
  upwork_access_token                 text,
  upwork_refresh_token                text,
  upwork_token_expires_at             timestamptz,
  upwork_connected_at                 timestamptz,
  upwork_search_terms                 text default 'web development'::text,
  job_feed_auto_refresh_enabled       boolean default false not null,
  upwork_vendor_orgs                  jsonb,
  upwork_vendor_orgs_client_only      boolean,
  upwork_vendor_orgs_fetched_at       timestamptz,
  constraint user_settings_openai_effort_check
    check (openai_effort in ('low', 'medium', 'high')),
  constraint user_settings_anthropic_effort_check
    check (anthropic_effort in ('low', 'medium', 'high'))
);

comment on column public.user_settings.openai_api_key is 'Required. Every AI feature resolves the key from here; there is no platform fallback.';
comment on column public.user_settings.openai_effort is 'Reasoning effort: low | medium | high. Replaced openai_temperature, which the current model generations reject.';
comment on column public.user_settings.upwork_vendor_orgs is 'Cached Upwork vendor organizations. Refreshed on a timer; see upwork_vendor_orgs_fetched_at.';


-- React Joyride onboarding progress, one row per user per flow.
create table if not exists public.user_onboarding_state (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  flow_id      text not null,
  flow_version integer default 1 not null,
  status       public.onboarding_flow_status default 'not_started'::public.onboarding_flow_status not null,
  current_step integer default 0 not null,
  completed_at timestamptz,
  skipped_at   timestamptz,
  created_at   timestamptz default now() not null,
  updated_at   timestamptz default now() not null,
  constraint user_onboarding_state_user_flow_unique unique (user_id, flow_id)
);


-- Last browser ping per user. The job-alert cron reads this under the service
-- role to skip webhook delivery while the user is already online.
create table if not exists public.user_presence (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  last_seen_at timestamptz default now() not null,
  updated_at   timestamptz default now() not null
);


-- Short-lived handoff codes for the Chrome extension sign-in flow.
create table if not exists public.extension_auth_handoffs (
  handoff_id  text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz default now() not null
);


-- Writing personas. Optionally imported from an Upwork profile.
create table if not exists public.personas (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  created_at          timestamptz default now() not null,
  updated_at          timestamptz default now() not null,
  full_name           text,
  avatar_url          text,
  bio                 text,
  role_title          text,
  location            text,
  timezone            text,
  years_of_experience integer,
  skills              text[] default '{}'::text[] not null,
  specializations     text[] default '{}'::text[] not null,
  certifications      text[] default '{}'::text[] not null,
  upwork_url          text,
  linkedin_url        text,
  website_url         text,
  github_url          text,
  upwork_person_id    text
);

comment on column public.personas.upwork_person_id is 'Upwork Staff.user.id / TalentProfile.personId this persona was imported from. NULL when created manually. Used for import dedup.';


create table if not exists public.portfolio_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  slug       text not null,
  color      text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


create table if not exists public.portfolio_tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


-- Portfolio projects. `embedding` powers pgvector similarity matching at
-- proposal-generation time and is populated by POST /api/projects/embed.
create table if not exists public.projects (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now(),
  name                     text not null,
  url                      text,
  category                 text not null,
  description              text,
  technologies             text[] default '{}'::text[],
  client_name              text,
  image_url                text,
  is_featured              boolean default false,
  embedding                public.vector(1536),
  upwork_portfolio_item_id text
);

comment on column public.projects.embedding is 'text-embedding-3-small vector. NULL until embedded; NULL rows are excluded from portfolio matching.';


-- Junction: one tag per project (enforced by the unique constraint on project_id).
create table if not exists public.project_portfolio_tags (
  project_id uuid not null references public.projects (id) on delete cascade,
  tag_id     uuid not null references public.portfolio_tags (id) on delete cascade,
  created_at timestamptz default now(),
  primary key (project_id, tag_id),
  constraint project_portfolio_tags_project_id_key unique (project_id)
);


create table if not exists public.templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  name        text not null,
  category    text not null,
  content     text not null,
  description text,
  variables   text[] default '{}'::text[],
  is_default  boolean default false
);


-- Reusable opening hooks for proposals.
create table if not exists public.hooks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null,
  description text not null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);


create table if not exists public.proposals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  client_name       text not null,
  job_title         text not null,
  job_description   text,
  job_url           text,
  proposal_content  text not null,
  selected_projects text[] default '{}'::text[],
  status            text default 'draft'::text,
  template_id       uuid references public.templates (id) on delete set null,
  persona_id        uuid references public.personas (id) on delete set null,
  notes             text,
  ai_model          text,
  ai_provider       text,
  constraint proposals_status_check
    check (status = any (array['draft'::text, 'sent'::text, 'won'::text, 'lost'::text]))
);


-- Saved Upwork job-feed filters, including AI Job Qualify criteria.
create table if not exists public.saved_job_filters (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users (id) on delete cascade,
  created_at                timestamptz default now(),
  name                      text not null,
  filters                   jsonb default '{}'::jsonb not null,
  is_default                boolean default false,
  notification_enabled      boolean default false,
  auto_refresh_jobs_enabled boolean default false not null,
  qualify_criteria          text,
  qualify_enabled           boolean default false not null,
  is_enabled                boolean default true not null
);

comment on column public.saved_job_filters.qualify_criteria is 'Free-text niche criteria used by AI Job Qualify to grade individual jobs.';
comment on column public.saved_job_filters.is_enabled is 'When false the filter is inert: hidden from the job feed, its page redirects, and no Upwork call is made for it.';


-- Daily Upwork API call counter, used to stay inside Upwork''s own quota.
create table if not exists public.upwork_api_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       date default current_date not null,
  call_count integer default 0 not null,
  updated_at timestamptz default now() not null,
  constraint upwork_api_usage_user_date unique (user_id, date)
);


-- Outbound webhook targets for new-job alerts.
create table if not exists public.webhook_configurations (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  name                 text not null,
  platform_hint        text default 'custom'::text not null,
  url                  text not null,
  is_active            boolean default true not null,
  consecutive_failures integer default 0 not null,
  last_failure_at      timestamptz,
  created_at           timestamptz default now() not null,
  updated_at           timestamptz default now() not null,
  constraint webhook_configurations_platform_hint_check
    check (platform_hint = any (array['make'::text, 'n8n'::text, 'custom'::text]))
);

comment on column public.webhook_configurations.platform_hint is 'UI hint only. All platforms receive the same JSON payload.';


-- Per-filter dedup state for the job-alert cron.
create table if not exists public.filter_webhook_state (
  id               uuid primary key default gen_random_uuid(),
  filter_id        uuid not null unique references public.saved_job_filters (id) on delete cascade,
  notified_job_ids text[] default '{}'::text[] not null,
  baseline_pending boolean default true not null,
  last_notified_at timestamptz,
  last_checked_at  timestamptz default now() not null,
  created_at       timestamptz default now() not null,
  updated_at       timestamptz default now() not null
);

comment on column public.filter_webhook_state.notified_job_ids is 'Upwork job IDs already notified. Capped at the 500 most recent to bound growth.';
comment on column public.filter_webhook_state.baseline_pending is 'true = first cron run for this filter: record job IDs without sending, then set false. Reset to true when filter criteria change.';


create table if not exists public.webhook_delivery_log (
  id            uuid primary key default gen_random_uuid(),
  webhook_id    uuid not null references public.webhook_configurations (id) on delete cascade,
  filter_id     uuid not null references public.saved_job_filters (id) on delete cascade,
  run_id        text not null,
  job_count     integer not null,
  status_code   integer,
  response_body text,
  delivered_at  timestamptz default now() not null
);

comment on column public.webhook_delivery_log.run_id is 'Deterministic ID: "{filter_id}:{5-min epoch bucket}". Allows downstream deduplication.';


-- ----------------------------------------------------------------------------
-- 4. Indexes
-- ----------------------------------------------------------------------------

create index if not exists idx_personas_user_id
  on public.personas using btree (user_id);
create unique index if not exists idx_personas_user_upwork_person
  on public.personas using btree (user_id, upwork_person_id)
  where (upwork_person_id is not null);

create index if not exists idx_portfolio_categories_user_id
  on public.portfolio_categories using btree (user_id);
create unique index if not exists idx_portfolio_categories_user_slug
  on public.portfolio_categories using btree (user_id, slug);

create index if not exists idx_portfolio_tags_user_id
  on public.portfolio_tags using btree (user_id);
create unique index if not exists idx_portfolio_tags_user_name
  on public.portfolio_tags using btree (user_id, name);

create index if not exists idx_projects_user_id
  on public.projects using btree (user_id);
create index if not exists idx_projects_category
  on public.projects using btree (category);
create index if not exists idx_projects_is_featured
  on public.projects using btree (is_featured);
create index if not exists idx_projects_upwork_portfolio_item_id
  on public.projects using btree (upwork_portfolio_item_id)
  where (upwork_portfolio_item_id is not null);
create index if not exists projects_embedding_hnsw_idx
  on public.projects using hnsw (embedding public.vector_cosine_ops);

create index if not exists idx_project_portfolio_tags_project_id
  on public.project_portfolio_tags using btree (project_id);
create index if not exists idx_project_portfolio_tags_tag_id
  on public.project_portfolio_tags using btree (tag_id);

create index if not exists idx_templates_user_id
  on public.templates using btree (user_id);
create index if not exists idx_templates_category
  on public.templates using btree (category);

create index if not exists idx_hooks_user_id
  on public.hooks using btree (user_id);

create index if not exists idx_proposals_user_id
  on public.proposals using btree (user_id);
create index if not exists idx_proposals_created_at
  on public.proposals using btree (created_at desc);
create index if not exists idx_proposals_status
  on public.proposals using btree (status);
create index if not exists idx_proposals_persona_id
  on public.proposals using btree (persona_id);

create index if not exists idx_saved_job_filters_user_id
  on public.saved_job_filters using btree (user_id);

create index if not exists upwork_api_usage_date_idx
  on public.upwork_api_usage using btree (date);

create index if not exists idx_user_settings_user_id
  on public.user_settings using btree (user_id);

create index if not exists user_onboarding_state_user_id_idx
  on public.user_onboarding_state using btree (user_id);

create index if not exists extension_auth_handoffs_user_id_idx
  on public.extension_auth_handoffs using btree (user_id);
create index if not exists extension_auth_handoffs_expires_idx
  on public.extension_auth_handoffs using btree (expires_at);

create index if not exists idx_webhook_configurations_user
  on public.webhook_configurations using btree (user_id);

create index if not exists idx_filter_webhook_state_last_checked
  on public.filter_webhook_state using btree (last_checked_at);

create index if not exists idx_webhook_delivery_log_webhook_id
  on public.webhook_delivery_log using btree (webhook_id, delivered_at desc);


-- ----------------------------------------------------------------------------
-- 5. Functions
--
-- Declared after the tables because match_portfolio_projects is LANGUAGE sql,
-- which Postgres validates at creation time against public.projects.
-- ----------------------------------------------------------------------------

-- Creates the profiles row when a user signs up. Wired to auth.users below.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  user_name text;
begin
  user_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    user_name,
    coalesce(new.raw_user_meta_data->>'avatar_url', null)
  );

  return new;
exception when others then
  raise log 'handle_new_user error for %: % %', new.email, sqlerrm, sqlstate;
  return new;
end;
$$;


create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


create or replace function public.set_user_onboarding_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- Defence in depth: stamp the owner when the client omits user_id on insert.
create or replace function public.projects_set_user_id()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;


-- Atomic daily Upwork API call counter. Returns the new count so callers can
-- compare it against the quota ceiling.
create or replace function public.increment_upwork_api_usage(
  p_user_id uuid,
  p_date    date
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  insert into public.upwork_api_usage (user_id, date, call_count)
  values (p_user_id, p_date, 1)
  on conflict (user_id, date)
  do update set
    call_count = upwork_api_usage.call_count + 1,
    updated_at = now()
  returning call_count into v_count;

  return v_count;
end;
$$;


-- pgvector cosine similarity search over the user's portfolio.
create or replace function public.match_portfolio_projects(
  query_embedding public.vector,
  p_user_id       uuid,
  match_count     integer default 3
)
returns table (
  id           uuid,
  name         text,
  url          text,
  category     text,
  description  text,
  technologies text[],
  similarity   double precision
)
language sql
stable
set search_path to 'public'
as $$
  select
    id,
    name,
    url,
    category,
    description,
    technologies,
    1 - (embedding <=> query_embedding) as similarity
  from public.projects
  where user_id = p_user_id
    and embedding is not null
  order by embedding <=> query_embedding
  limit match_count;
$$;


-- ----------------------------------------------------------------------------
-- 6. Triggers
-- ----------------------------------------------------------------------------

-- REQUIRED. Without this, signup creates no profiles row and the app is broken
-- with nothing in the schema to explain why. It cannot come from a pg_dump of
-- the public schema, because the trigger lives on auth.users.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace trigger projects_set_user_id
  before insert on public.projects
  for each row execute function public.projects_set_user_id();

create or replace trigger user_onboarding_state_set_updated_at
  before update on public.user_onboarding_state
  for each row execute function public.set_user_onboarding_state_updated_at();

create or replace trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at_column();

create or replace trigger update_projects_updated_at
  before update on public.projects
  for each row execute function public.update_updated_at_column();

create or replace trigger update_proposals_updated_at
  before update on public.proposals
  for each row execute function public.update_updated_at_column();

create or replace trigger update_templates_updated_at
  before update on public.templates
  for each row execute function public.update_updated_at_column();


-- ----------------------------------------------------------------------------
-- 7. Row level security
--
-- Owner-scoped tables reduce to `user_id = auth.uid()`. Child tables inherit
-- visibility from their parent. The service_role bypasses RLS, which is how the
-- job-alert cron reads user_presence and webhook state.
-- ----------------------------------------------------------------------------

alter table public.profiles                enable row level security;
alter table public.user_settings           enable row level security;
alter table public.user_onboarding_state   enable row level security;
alter table public.user_presence           enable row level security;
alter table public.extension_auth_handoffs enable row level security;
alter table public.personas                enable row level security;
alter table public.portfolio_categories    enable row level security;
alter table public.portfolio_tags          enable row level security;
alter table public.projects                enable row level security;
alter table public.project_portfolio_tags  enable row level security;
alter table public.templates               enable row level security;
alter table public.hooks                   enable row level security;
alter table public.proposals               enable row level security;
alter table public.saved_job_filters       enable row level security;
alter table public.upwork_api_usage        enable row level security;
alter table public.webhook_configurations  enable row level security;
alter table public.filter_webhook_state    enable row level security;
alter table public.webhook_delivery_log    enable row level security;

-- profiles is keyed by auth.users.id rather than a user_id column.
-- No DELETE policy: profile rows are removed by the auth.users cascade.
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "profiles_insert" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No DELETE: settings live and die with the account.
create policy "user_settings_select" on public.user_settings
  for select to authenticated
  using (user_id = auth.uid());

create policy "user_settings_insert" on public.user_settings
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "user_settings_update" on public.user_settings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_onboarding_state_owner" on public.user_onboarding_state
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No DELETE: presence is a single upserted heartbeat row.
create policy "user_presence_select" on public.user_presence
  for select to authenticated
  using (user_id = auth.uid());

create policy "user_presence_insert" on public.user_presence
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "user_presence_update" on public.user_presence
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- extension_auth_handoffs intentionally has RLS enabled and NO policies.
-- Every access path (/api/extension/handoff/{create,redeem}) uses the service
-- role, which bypasses RLS. Clients must never read or write handoff codes
-- directly, so granting them a policy here would widen access for no reason.

create policy "personas_owner" on public.personas
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "portfolio_categories_owner" on public.portfolio_categories
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "portfolio_tags_owner" on public.portfolio_tags
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "projects_owner" on public.projects
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "templates_owner" on public.templates
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "hooks_owner" on public.hooks
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "proposals_owner" on public.proposals
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "saved_job_filters_owner" on public.saved_job_filters
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- SELECT only. Writes go exclusively through the SECURITY DEFINER RPC
-- increment_upwork_api_usage(), so a client cannot tamper with its own
-- quota counter.
create policy "upwork_api_usage_select" on public.upwork_api_usage
  for select to authenticated
  using (user_id = auth.uid());

create policy "webhook_configurations_owner" on public.webhook_configurations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Child tables: ownership is derived from the parent row.
create policy "project_portfolio_tags_owner" on public.project_portfolio_tags
  for all to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_portfolio_tags.project_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_portfolio_tags.project_id
        and p.user_id = auth.uid()
    )
  );

-- SELECT only for both: the job-alert cron owns all writes and runs under the
-- service role. Clients read their own delivery history but cannot forge it or
-- reset the dedup state that stops duplicate alerts.
create policy "filter_webhook_state_select" on public.filter_webhook_state
  for select to authenticated
  using (
    exists (
      select 1 from public.saved_job_filters f
      where f.id = filter_webhook_state.filter_id
        and f.user_id = auth.uid()
    )
  );

create policy "webhook_delivery_log_select" on public.webhook_delivery_log
  for select to authenticated
  using (
    exists (
      select 1 from public.webhook_configurations w
      where w.id = webhook_delivery_log.webhook_id
        and w.user_id = auth.uid()
    )
  );


-- ----------------------------------------------------------------------------
-- 8. Grants
--
-- Without these PostgREST cannot see the tables and every API call 404s.
-- RLS above is what actually restricts access; these only make the objects
-- visible to the Supabase roles.
-- ----------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant all on table public.profiles                to anon, authenticated, service_role;
grant all on table public.user_settings           to anon, authenticated, service_role;
grant all on table public.user_onboarding_state   to anon, authenticated, service_role;
grant all on table public.user_presence           to anon, authenticated, service_role;
grant all on table public.extension_auth_handoffs to anon, authenticated, service_role;
grant all on table public.personas                to anon, authenticated, service_role;
grant all on table public.portfolio_categories    to anon, authenticated, service_role;
grant all on table public.portfolio_tags          to anon, authenticated, service_role;
grant all on table public.projects                to anon, authenticated, service_role;
grant all on table public.project_portfolio_tags  to anon, authenticated, service_role;
grant all on table public.templates               to anon, authenticated, service_role;
grant all on table public.hooks                   to anon, authenticated, service_role;
grant all on table public.proposals               to anon, authenticated, service_role;
grant all on table public.saved_job_filters       to anon, authenticated, service_role;
grant all on table public.upwork_api_usage        to anon, authenticated, service_role;
grant all on table public.webhook_configurations  to anon, authenticated, service_role;
grant all on table public.filter_webhook_state    to anon, authenticated, service_role;
grant all on table public.webhook_delivery_log    to anon, authenticated, service_role;

grant all on function public.handle_new_user()                        to anon, authenticated, service_role;
grant all on function public.update_updated_at_column()               to anon, authenticated, service_role;
grant all on function public.set_user_onboarding_state_updated_at()   to anon, authenticated, service_role;
grant all on function public.projects_set_user_id()                   to anon, authenticated, service_role;
grant all on function public.increment_upwork_api_usage(uuid, date)   to anon, authenticated, service_role;
grant all on function public.match_portfolio_projects(public.vector, uuid, integer)
  to anon, authenticated, service_role;
