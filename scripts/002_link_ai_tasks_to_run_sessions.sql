-- Links ai_tasks rows to the run_sessions they produced (Phase 7).
-- Already applied to Supabase as migration `udd_ai_tasks_link_run_sessions`.
-- This file exists so the /scripts folder stays in sync with the live schema
-- for reproducible environments and code review. Safe to re-run: idempotent.

alter table public.ai_tasks
  add column if not exists run_session_id uuid
  references public.run_sessions(id) on delete set null;

create index if not exists ai_tasks_run_session_idx
  on public.ai_tasks(run_session_id)
  where run_session_id is not null;
