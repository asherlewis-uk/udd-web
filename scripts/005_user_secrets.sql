-- Per-user encrypted credential storage (Phase 3 BYOK foundation).
-- Values are encrypted at the application layer (AES-256-GCM, lib/secrets/crypto.ts)
-- before insertion. This table stores ciphertext only — never plaintext keys.
-- Decryption requires the UDD_SECRET_KEY env var, which is server-side only.
-- Safe to re-run (all operations are idempotent).

create table if not exists public.user_secrets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  name text not null,
  encrypted_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, kind, name)
);

comment on column public.user_secrets.encrypted_value is
  'AES-256-GCM ciphertext produced by lib/secrets/crypto.ts. '
  'Never store or return plaintext API keys. '
  'Decryption requires UDD_SECRET_KEY env var (server-only).';

create index if not exists user_secrets_owner_kind_idx
  on public.user_secrets(owner_id, kind);

alter table public.user_secrets enable row level security;

drop policy if exists "user_secrets_select_own" on public.user_secrets;
drop policy if exists "user_secrets_insert_own" on public.user_secrets;
drop policy if exists "user_secrets_update_own" on public.user_secrets;
drop policy if exists "user_secrets_delete_own" on public.user_secrets;

create policy "user_secrets_select_own" on public.user_secrets
  for select using (auth.uid() = owner_id);
create policy "user_secrets_insert_own" on public.user_secrets
  for insert with check (auth.uid() = owner_id);
create policy "user_secrets_update_own" on public.user_secrets
  for update using (auth.uid() = owner_id);
create policy "user_secrets_delete_own" on public.user_secrets
  for delete using (auth.uid() = owner_id);

drop trigger if exists user_secrets_set_updated_at on public.user_secrets;
create trigger user_secrets_set_updated_at
  before update on public.user_secrets
  for each row execute function public.set_updated_at();
