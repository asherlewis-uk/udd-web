-- Document forward-looking schema surface that has no application-code
-- callers yet, so future contributors understand the intent and don't treat
-- the unused surface as drift. Pure metadata — no data or behavior changes.

comment on table public.exports is
  'Forward-looking: project artifact exports (zip bundle, GitHub push, download). '
  'Schema + RLS are in place; no application code reads or writes this table yet. '
  'Kept so the export feature can land without a migration.';

comment on column public.provider_configs.secret_ref is
  'Forward-looking: opaque reference to an external secret manager (e.g. Vercel '
  'encrypted env, a KMS key id). Always null today — credentials come from env. '
  'Never store raw secrets in this column.';
