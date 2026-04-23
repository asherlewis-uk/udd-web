-- UDD initial schema
-- Solo-first, project-centered data model.
-- All tables are owned by a single user (owner_id = auth.users.id).

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- projects
-- Status lifecycle: draft -> active -> archived (or error)
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  idea text,
  status text not null default 'draft'
    check (status in ('draft','active','archived','error')),
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create index if not exists projects_owner_idx on public.projects(owner_id);
create index if not exists projects_status_idx on public.projects(owner_id, status);

alter table public.projects enable row level security;

drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;

create policy "projects_select_own" on public.projects
  for select using (auth.uid() = owner_id);
create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = owner_id);
create policy "projects_update_own" on public.projects
  for update using (auth.uid() = owner_id);
create policy "projects_delete_own" on public.projects
  for delete using (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- project_files
-- Minimal file tree persisted in DB. content is text for v1.
-- ----------------------------------------------------------------------------
create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  content text not null default '',
  language text,
  size_bytes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, path)
);

create index if not exists project_files_project_idx on public.project_files(project_id);

alter table public.project_files enable row level security;

drop policy if exists "project_files_select_own" on public.project_files;
drop policy if exists "project_files_insert_own" on public.project_files;
drop policy if exists "project_files_update_own" on public.project_files;
drop policy if exists "project_files_delete_own" on public.project_files;

create policy "project_files_select_own" on public.project_files
  for select using (auth.uid() = owner_id);
create policy "project_files_insert_own" on public.project_files
  for insert with check (auth.uid() = owner_id);
create policy "project_files_update_own" on public.project_files
  for update using (auth.uid() = owner_id);
create policy "project_files_delete_own" on public.project_files
  for delete using (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- prompts
-- User-authored prompts associated with a project (history log).
-- ----------------------------------------------------------------------------
create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists prompts_project_idx on public.prompts(project_id, created_at desc);

alter table public.prompts enable row level security;

drop policy if exists "prompts_select_own" on public.prompts;
drop policy if exists "prompts_insert_own" on public.prompts;
drop policy if exists "prompts_update_own" on public.prompts;
drop policy if exists "prompts_delete_own" on public.prompts;

create policy "prompts_select_own" on public.prompts
  for select using (auth.uid() = owner_id);
create policy "prompts_insert_own" on public.prompts
  for insert with check (auth.uid() = owner_id);
create policy "prompts_update_own" on public.prompts
  for update using (auth.uid() = owner_id);
create policy "prompts_delete_own" on public.prompts
  for delete using (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- ai_tasks
-- A unit of AI-driven work (scaffold, edit, refactor, etc.).
-- ----------------------------------------------------------------------------
create table if not exists public.ai_tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  prompt_id uuid references public.prompts(id) on delete set null,
  kind text not null default 'edit'
    check (kind in ('scaffold','edit','refactor','explain','other')),
  title text not null,
  status text not null default 'pending'
    check (status in ('pending','running','completed','failed','cancelled')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists ai_tasks_project_idx on public.ai_tasks(project_id, created_at desc);
create index if not exists ai_tasks_status_idx on public.ai_tasks(owner_id, status);

alter table public.ai_tasks enable row level security;

drop policy if exists "ai_tasks_select_own" on public.ai_tasks;
drop policy if exists "ai_tasks_insert_own" on public.ai_tasks;
drop policy if exists "ai_tasks_update_own" on public.ai_tasks;
drop policy if exists "ai_tasks_delete_own" on public.ai_tasks;

create policy "ai_tasks_select_own" on public.ai_tasks
  for select using (auth.uid() = owner_id);
create policy "ai_tasks_insert_own" on public.ai_tasks
  for insert with check (auth.uid() = owner_id);
create policy "ai_tasks_update_own" on public.ai_tasks
  for update using (auth.uid() = owner_id);
create policy "ai_tasks_delete_own" on public.ai_tasks
  for delete using (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- ai_task_events
-- Streamed events from an AI task (thinking, tool call, diff, message).
-- ----------------------------------------------------------------------------
create table if not exists public.ai_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.ai_tasks(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_task_events_task_idx on public.ai_task_events(task_id, created_at);

alter table public.ai_task_events enable row level security;

drop policy if exists "ai_task_events_select_own" on public.ai_task_events;
drop policy if exists "ai_task_events_insert_own" on public.ai_task_events;
drop policy if exists "ai_task_events_delete_own" on public.ai_task_events;

create policy "ai_task_events_select_own" on public.ai_task_events
  for select using (auth.uid() = owner_id);
create policy "ai_task_events_insert_own" on public.ai_task_events
  for insert with check (auth.uid() = owner_id);
create policy "ai_task_events_delete_own" on public.ai_task_events
  for delete using (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- run_sessions
-- A hosted run/preview session for a project.
-- ----------------------------------------------------------------------------
create table if not exists public.run_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'idle'
    check (status in ('idle','starting','running','stopping','stopped','error')),
  preview_url text,
  started_at timestamptz,
  stopped_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists run_sessions_project_idx on public.run_sessions(project_id, created_at desc);

alter table public.run_sessions enable row level security;

drop policy if exists "run_sessions_select_own" on public.run_sessions;
drop policy if exists "run_sessions_insert_own" on public.run_sessions;
drop policy if exists "run_sessions_update_own" on public.run_sessions;
drop policy if exists "run_sessions_delete_own" on public.run_sessions;

create policy "run_sessions_select_own" on public.run_sessions
  for select using (auth.uid() = owner_id);
create policy "run_sessions_insert_own" on public.run_sessions
  for insert with check (auth.uid() = owner_id);
create policy "run_sessions_update_own" on public.run_sessions
  for update using (auth.uid() = owner_id);
create policy "run_sessions_delete_own" on public.run_sessions
  for delete using (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- run_events
-- Log / stdout / stderr / system events from a run session.
-- ----------------------------------------------------------------------------
create table if not exists public.run_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.run_sessions(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  level text not null default 'info'
    check (level in ('info','warn','error','system')),
  source text not null default 'system'
    check (source in ('system','stdout','stderr','build')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists run_events_session_idx on public.run_events(session_id, created_at);

alter table public.run_events enable row level security;

drop policy if exists "run_events_select_own" on public.run_events;
drop policy if exists "run_events_insert_own" on public.run_events;
drop policy if exists "run_events_delete_own" on public.run_events;

create policy "run_events_select_own" on public.run_events
  for select using (auth.uid() = owner_id);
create policy "run_events_insert_own" on public.run_events
  for insert with check (auth.uid() = owner_id);
create policy "run_events_delete_own" on public.run_events
  for delete using (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- previews
-- Saved preview snapshots (thumbnail, public url, associated run session).
-- ----------------------------------------------------------------------------
create table if not exists public.previews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.run_sessions(id) on delete set null,
  url text,
  thumbnail_url text,
  created_at timestamptz not null default now()
);

create index if not exists previews_project_idx on public.previews(project_id, created_at desc);

alter table public.previews enable row level security;

drop policy if exists "previews_select_own" on public.previews;
drop policy if exists "previews_insert_own" on public.previews;
drop policy if exists "previews_update_own" on public.previews;
drop policy if exists "previews_delete_own" on public.previews;

create policy "previews_select_own" on public.previews
  for select using (auth.uid() = owner_id);
create policy "previews_insert_own" on public.previews
  for insert with check (auth.uid() = owner_id);
create policy "previews_update_own" on public.previews
  for update using (auth.uid() = owner_id);
create policy "previews_delete_own" on public.previews
  for delete using (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- exports
-- Project artifact exports (zip bundle, git push, etc.).
-- ----------------------------------------------------------------------------
create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'zip'
    check (kind in ('zip','github','download')),
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed')),
  artifact_url text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists exports_project_idx on public.exports(project_id, created_at desc);

alter table public.exports enable row level security;

drop policy if exists "exports_select_own" on public.exports;
drop policy if exists "exports_insert_own" on public.exports;
drop policy if exists "exports_update_own" on public.exports;
drop policy if exists "exports_delete_own" on public.exports;

create policy "exports_select_own" on public.exports
  for select using (auth.uid() = owner_id);
create policy "exports_insert_own" on public.exports
  for insert with check (auth.uid() = owner_id);
create policy "exports_update_own" on public.exports
  for update using (auth.uid() = owner_id);
create policy "exports_delete_own" on public.exports
  for delete using (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- provider_configs
-- Per-user configured providers (AI, export target, etc.).
-- Never expose `secret_ref` raw secret values in client responses.
-- ----------------------------------------------------------------------------
create table if not exists public.provider_configs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('ai','export','runtime','other')),
  name text not null,
  config jsonb not null default '{}'::jsonb,
  secret_ref text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, kind, name)
);

alter table public.provider_configs enable row level security;

drop policy if exists "provider_configs_select_own" on public.provider_configs;
drop policy if exists "provider_configs_insert_own" on public.provider_configs;
drop policy if exists "provider_configs_update_own" on public.provider_configs;
drop policy if exists "provider_configs_delete_own" on public.provider_configs;

create policy "provider_configs_select_own" on public.provider_configs
  for select using (auth.uid() = owner_id);
create policy "provider_configs_insert_own" on public.provider_configs
  for insert with check (auth.uid() = owner_id);
create policy "provider_configs_update_own" on public.provider_configs
  for update using (auth.uid() = owner_id);
create policy "provider_configs_delete_own" on public.provider_configs
  for delete using (auth.uid() = owner_id);

-- ----------------------------------------------------------------------------
-- Auto-create profile on signup
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists project_files_set_updated_at on public.project_files;
create trigger project_files_set_updated_at
  before update on public.project_files
  for each row execute function public.set_updated_at();

drop trigger if exists run_sessions_set_updated_at on public.run_sessions;
create trigger run_sessions_set_updated_at
  before update on public.run_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists provider_configs_set_updated_at on public.provider_configs;
create trigger provider_configs_set_updated_at
  before update on public.provider_configs
  for each row execute function public.set_updated_at();
