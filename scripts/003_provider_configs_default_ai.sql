-- Adds default-provider selection for per-user AI provider configs.
-- Safe to re-run.

alter table public.provider_configs
  add column if not exists is_default boolean not null default false;

create unique index if not exists provider_configs_one_default_ai_per_owner_idx
  on public.provider_configs(owner_id)
  where kind = 'ai' and is_default = true;

