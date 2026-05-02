# DB Query Rewrite Catalog

## 1. Scope and source baseline

This catalog is a docs-only implementation guide for replacing UDD's current Supabase SSR/PostgREST data access with Drizzle plus Better Auth. It does not modify application code, SQL, package manifests, lockfiles, env files, or deployment config.

Baseline snapshot:

| Field | Value |
| --- | --- |
| Date | 2026-05-02 |
| Branch | `main` |
| Commit | `279aedd` |
| Package scripts | `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm lint`, `pnpm typecheck` |
| Current data/auth layer | Supabase SSR wrappers plus PostgREST `.from(...)` calls |
| Target data/auth layer | Drizzle over Postgres plus Better Auth app-owned tables |

Authoritative prior specs consumed:

| Spec | Role in this catalog |
| --- | --- |
| `docs/migration/env-lockdown.md` | Locked env model. Supabase and Vercel AI Gateway env vars are retired; `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, and UDD default AI env vars become the target. |
| `docs/migration/drizzle-schema.md` | Locked Drizzle schema translation, Better Auth table definitions, app table ownership model, and RLS removal direction. |
| `docs/migration/better-auth-integration.md` | Locked Better Auth integration plan, replacement auth helpers, middleware replacement, client auth flow changes, and mechanical `auth.getUser()` replacement map. |

Locked source baseline from Hermes audit:

| Surface | Baseline |
| --- | --- |
| Supabase import files | 32 code files |
| Code `.from(...)` calls | 124 total, including non-Supabase `Array.from` false positives |
| `supabase.auth.getUser()` calls | 24 |
| Dominant table surfaces | `projects`, `ai_tasks`, `run_sessions`, `project_files`, `profiles`, `ai_task_events`, `provider_configs`, `run_events`, `prompts`, dynamic `user_secrets` usage |
| Main wrappers | `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/proxy.ts`, `lib/supabase/service.ts` |
| High-risk action areas | `app/actions/ai.ts`, `app/actions/run.ts`, `app/actions/projects.ts`, `app/actions/profile.ts`, `app/actions/provider-configs.ts`, `app/actions/secrets.ts`, `app/(app)/projects/[id]/*` |

Additional locked stack and dependency facts:

| Fact | Evidence |
| --- | --- |
| App shape | Next.js App Router with root folders `app/`, `components/`, `lib/`, `hooks/`, and `scripts/`; no `src/` directory in the locked Hermes audit. |
| Runtime/package baseline | `package.json:6-10` defines `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm lint`, and `pnpm typecheck`. |
| Framework versions | `package.json:53-57` pins Next `16.2.0`, React `19.2.4`, and React DOM `19.2.4`. |
| TypeScript strict mode | `tsconfig.json:7` sets `strict: true`; `tsconfig.json:21-23` maps `@/*` to the repo root. |
| Tailwind v4 | `package.json:67` and `package.json:72` include `@tailwindcss/postcss` and `tailwindcss` `^4.2.0`. |
| Current implemented deps | `package.json:42-44` includes `@supabase/ssr`, `@vercel/analytics`, and `ai`. |
| Planned deps absent today | `package.json:12-75` contains no `drizzle-orm`, `drizzle-kit`, `postgres`, `better-auth`, or `@better-auth/cli`; do not write implementation instructions that assume those packages are already installed. |
| Lint status | `pnpm lint` exists as a script, but the locked Hermes audit says `pnpm exec eslint --version` currently fails with `Command "eslint" not found`; this catalog must not claim lint passes. |

Current SQL/RLS baseline:

| Source | Evidence |
| --- | --- |
| Current schema is Supabase Auth-shaped | `scripts/001_init_schema.sql:14`, `scripts/001_init_schema.sql:43`, and `scripts/001_init_schema.sql:82` reference `auth.users`. |
| RLS relies on Supabase identity | `scripts/001_init_schema.sql:28-35` and `scripts/001_init_schema.sql:66-73` use `auth.uid()`. |
| Signup profile creation is trigger-based | `scripts/001_init_schema.sql:382-403` defines the new-user trigger flow. |
| AI task to run session link is additive | `scripts/002_link_ai_tasks_to_run_sessions.sql:6-12` adds `ai_tasks.run_session_id`. |
| Provider default handling is additive | `scripts/003_provider_configs_default_ai.sql:4-9` adds `provider_configs.is_default` and a unique default index. |
| User secret storage is additive | `scripts/005_user_secrets.sql:7-16` creates `user_secrets`; `scripts/005_user_secrets.sql:18-21` documents ciphertext constraints. |

## 2. Existing Supabase access patterns

Supabase wrapper inventory:

| Wrapper | Evidence | Current pattern | Rewrite destination |
| --- | --- | --- | --- |
| Server client | `lib/supabase/server.ts:4-25` | `createServerClient()` with `cookies()`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. | Delete wrapper. Server auth uses `getSession()` from the planned Better Auth utility. Server data uses Drizzle `db` and table-specific query helpers. |
| Browser client | `lib/supabase/client.ts:3-12` | Browser singleton around `createBrowserClient()`. | Delete wrapper. Browser auth uses `authClient`, `signIn`, `signUp`, `signOut`, and `useSession` from `lib/auth-client.ts`. |
| Middleware/proxy client | `lib/supabase/proxy.ts:11-53` | Request-time session refresh and redirect gate; `supabase.auth.getUser()` at `lib/supabase/proxy.ts:33-35`. | Delete wrapper. Middleware uses `auth.api.getSession({ headers: request.headers })` and the redirect behavior locked in `docs/migration/better-auth-integration.md`. |
| Service-role client | `lib/supabase/service.ts:3-16` | `createServerClient()` using `SUPABASE_SERVICE_ROLE_KEY` for privileged admin operations. | Delete wrapper. Privileged behavior becomes explicit server-only Drizzle transactions or Better Auth server APIs. |

`supabase.auth.getUser()` usage classes:

| Class | Source examples | Target pattern |
| --- | --- | --- |
| Protected RSC page/layout gate | `app/(app)/layout.tsx`, `app/(app)/projects/page.tsx`, `app/(app)/projects/[id]/page.tsx`, `app/(app)/settings/page.tsx` | `const session = await getSession()`; redirect or `notFound()` using the existing behavior. |
| Public-page redirect | `app/page.tsx` | Redirect authenticated sessions using Better Auth session data. |
| Server action authentication | `app/actions/projects.ts`, `app/actions/ai.ts`, `app/actions/run.ts`, `app/actions/profile.ts`, `app/actions/provider-configs.ts`, `app/actions/secrets.ts` | Use `getSession()` and preserve each action's current error or redirect contract. |
| Shared component session/profile load | `components/app/top-nav.tsx` | Use `getSession()` then read `profiles` by `profiles.id = session.user.id`. |
| Middleware session gate | `lib/supabase/proxy.ts`, `middleware.ts` | Use Better Auth server session lookup directly in middleware. |

Supabase `.from(...)` query shapes:

| Shape | Evidence | Target Drizzle shape |
| --- | --- | --- |
| Simple select | `app/(app)/projects/[id]/page.tsx:83-132`, `app/(app)/settings/page.tsx:26-44` | `db.select().from(table).where(and(eq(table.ownerId, session.user.id), ...))`. |
| Insert | `app/actions/projects.ts:45-56`, `app/actions/ai.ts:80-105`, `lib/runtime/service.ts:49-60` | `db.insert(table).values(...).returning(...)`, with `ownerId` or `id` ownership populated from `session.user.id`. |
| Update | `app/actions/projects.ts:65-78`, `app/actions/ai.ts:165-197`, `lib/runtime/service.ts:221-231` | `db.update(table).set(...).where(and(eq(table.id, id), eq(table.ownerId, session.user.id), ...)).returning(...)` when race detection is needed. |
| Delete | `app/actions/projects.ts:86-108`, `app/actions/ai.ts:221-244`, `app/actions/secrets.ts:117-130` | `db.delete(table).where(and(eq(table.id, id), eq(table.ownerId, session.user.id)))`; use cascades only where the schema explicitly owns the child lifecycle. |
| Upsert | `lib/secrets/index.ts:17-22`, `app/actions/provider-configs.ts:87-98`, `lib/ai/service.ts:378-380` | `db.insert(table).values(...).onConflictDoUpdate(...)`; wrap multi-step default updates in a transaction. |
| Count/head query | `app/(app)/projects/[id]/ai/page.tsx:80-84`, `app/(app)/projects/[id]/files/page.tsx:93-98` | `select({ count: count() })` from Drizzle, scoped by owner and parent id. |
| `maybeSingle()` | `app/(app)/projects/[id]/page.tsx:91-96`, `app/(app)/settings/page.tsx:26-30` | `limit(1)` and use `rows.length ? rows[0] : null`. |
| `single()` | `app/actions/ai.ts:93-105`, `app/actions/run.ts:59-64` | `.returning()` and require one row for inserts/updates; `limit(1)` plus explicit not-found handling for reads. |
| PostgREST `or(...)` | `app/(app)/projects/page.tsx:47-51`, `lib/ai/service.ts:338-350` | Drizzle `or(...)` and nested `and(...)` expressions. |
| Embedded relationship select | `lib/ai/service.ts:74-80`, `lib/runtime/service.ts:155-159` | Explicit Drizzle joins or separate reads when that is simpler and keeps ownership filters obvious. |
| Dynamic table access | `lib/secrets/index.ts:15-95` uses `TABLE = "user_secrets"` | Replace dynamic string table usage with the typed `userSecrets` schema object. |

## 3. Target Drizzle / Better Auth access patterns

Target conventions:

| Concern | Convention |
| --- | --- |
| DB connection | Server DB access uses Drizzle over `DATABASE_URL`, with `postgres` as the driver and schema exports under `lib/db/schema/*`. |
| Query location | Reusable reads and writes live in `lib/db/queries/*`; page-local projections can stay local only when not reused. |
| Auth/session | Server components and server actions use `getSession()` from planned `lib/auth-session.ts`. Middleware uses the Better Auth server API directly. |
| Browser auth | Login, signup, logout, and session UI use Better Auth client utilities from planned `lib/auth-client.ts`. |
| Ownership | Supabase RLS is removed. Every app-table Drizzle query carries explicit ownership predicates. |
| Privilege | Service-role behavior is not replaced with a generic bypass client. It becomes named, explicit, server-only privileged operations. |
| Error shape | Preserve existing action return shapes at boundaries; convert Drizzle exceptions to the same user-facing messages the current actions expose. |
| Naming | Use Drizzle camelCase properties mapped to snake_case DB columns, matching `docs/migration/drizzle-schema.md`. |

Canonical protected server helper shape:

```ts
const session = await getSession()

if (!session) {
  redirect("/auth/login")
}

const rows = await db
  .select()
  .from(projects)
  .where(eq(projects.ownerId, session.user.id))
```

Canonical server action shape:

```ts
const session = await getSession()

if (!session) {
  return { error: "Not authenticated" }
}

await db
  .update(projects)
  .set({ name })
  .where(and(eq(projects.id, projectId), eq(projects.ownerId, session.user.id)))
```

## 4. Table-by-table rewrite catalog

### profiles

- Current source files:
- `scripts/001_init_schema.sql:13-19` creates `profiles` with `id uuid references auth.users(id)`.
- `scripts/001_init_schema.sql:28-35` permits reads and updates through `auth.uid() = id`.
- `scripts/001_init_schema.sql:382-403` creates the signup trigger that inserts a profile from `auth.users`.
- `components/app/top-nav.tsx:14-18` reads profile data for navigation.
- `app/(app)/settings/page.tsx:26-30` reads the current user's profile.
- `app/actions/profile.ts:7-19` updates profile display data.
- Current Supabase patterns:
- Owner-scoped `select`, `update`, and trigger-driven `insert`.
- Target Drizzle shape:
- `profiles.id` references Better Auth `user.id`.
- Reads and writes use `where(eq(profiles.id, session.user.id))`.
- Profile creation moves from SQL trigger to Better Auth user-create hook in `lib/auth.ts`.
- Auth/authorization rule:
- A user can read and update only the row whose `profiles.id` equals `session.user.id`.
- Risks:
- Signup must fail or compensate if the Better Auth user is created but the profile insert fails.
- Email display must come from Better Auth `user.email`; the current `profiles` table does not store email.

### projects

- Current source files:
- `scripts/001_init_schema.sql:41-54` creates `projects` with `owner_id references auth.users(id)`.
- `scripts/001_init_schema.sql:66-73` applies `auth.uid() = owner_id` RLS.
- `app/actions/projects.ts:18-33` generates unique slugs.
- `app/actions/projects.ts:45-78` creates and updates projects.
- `app/actions/projects.ts:86-108` deletes projects.
- `app/(app)/projects/page.tsx:39-60` lists projects.
- `app/(app)/projects/[id]/page.tsx:83-96` loads project detail.
- Current Supabase patterns:
- `select`, `insert`, `update`, `delete`, ordered lists, and search filters.
- Target Drizzle shape:
- Use `projects.ownerId = session.user.id` on every read/write/delete.
- Preserve unique `(ownerId, slug)` behavior from the current slug loop.
- Use `returning()` to detect failed updates and deletes.
- Auth/authorization rule:
- A project is accessible only when `projects.ownerId` equals `session.user.id`.
- Risks:
- Slug generation can race under concurrent project creation and must rely on the DB unique constraint plus retry or visible error.
- Project deletion depends on cascade behavior for children and should be verified against the Drizzle schema.

### project_files

- Current source files:
- `scripts/001_init_schema.sql:79-90` creates `project_files` with project and owner references.
- `app/(app)/projects/[id]/files/page.tsx:93-114` lists files and loads selected file content.
- `app/(app)/projects/[id]/page.tsx:115-120` loads recent files for project detail.
- `lib/ai/service.ts:355-433` persists generated file contents and removes stale scaffold files.
- `lib/runtime/executor.ts:36-85` loads files for preview execution.
- Current Supabase patterns:
- Owner-scoped `select`, path-ordered lists, `upsert`, and delete-by-stale-path cleanup.
- Target Drizzle shape:
- Use `projectFiles.ownerId = session.user.id` for user-facing reads.
- Background persistence must carry `ownerId` from an already-owned task or project.
- Preserve unique `(projectId, path)` upsert behavior with `onConflictDoUpdate`.
- Auth/authorization rule:
- A file is accessible only when both its project and file ownership chain belongs to the same user.
- Risks:
- File upsert plus stale cleanup should be transactional to avoid losing files during partial writes.
- Path uniqueness is project-scoped, so implementation must not rely on globally unique paths.

### prompts

- Current source files:
- `scripts/001_init_schema.sql:114-120` creates `prompts`.
- `app/actions/ai.ts:80-88` inserts prompts before task creation.
- `app/(app)/projects/[id]/page.tsx:155-162` reads prompt text for recent tasks.
- Current Supabase patterns:
- `insert` during AI task creation and `select` for display.
- Target Drizzle shape:
- Insert prompt and matching task in a single transaction.
- Read prompts only through an owner-scoped project/task path or a direct `prompts.ownerId = session.user.id` predicate if present in schema.
- Auth/authorization rule:
- A prompt belongs to the user that owns the task and project it was created for.
- Risks:
- Creating a prompt without a matching task leaves orphan conversational input.
- Prompt text can be large and should not be selected when the page only needs task metadata.

### ai_tasks

- Current source files:
- `scripts/001_init_schema.sql:144-160` creates `ai_tasks`.
- `scripts/002_link_ai_tasks_to_run_sessions.sql:6-12` adds `run_session_id`.
- `app/actions/ai.ts:41-56` counts live tasks for concurrency control.
- `app/actions/ai.ts:93-113` inserts a task and touches the project.
- `app/actions/ai.ts:165-197`, `app/actions/ai.ts:221-244`, and `app/actions/ai.ts:279-363` cancel, delete, retry, and repair tasks.
- `lib/ai/service.ts:68-315` loads tasks and applies status transitions.
- Current Supabase patterns:
- Owner-scoped `select`, `insert`, conditional `update`, `delete`, count queries, and relation reads.
- Target Drizzle shape:
- Use `aiTasks.ownerId = session.user.id` for all user-initiated operations.
- Preserve conditional state transitions with `where(and(eq(aiTasks.id, taskId), eq(aiTasks.ownerId, userId), eq(aiTasks.status, expectedStatus)))`.
- Use `returning()` row count to detect race losses.
- Auth/authorization rule:
- A task is accessible only when `aiTasks.ownerId` equals `session.user.id`; background runners must preserve the task's stored owner id.
- Risks:
- Status races are expected and must not be converted into unconditional updates.
- Task creation should become transactional with prompt insert and project activity touch.

### ai_task_events

- Current source files:
- `scripts/001_init_schema.sql:185-192` creates `ai_task_events`.
- `scripts/001_init_schema.sql:198-207` grants select, insert, and delete RLS but no update policy; active app usage is append/read only.
- `lib/ai/service.ts:109-119` appends task events.
- `app/(app)/projects/[id]/ai/page.tsx:91-132` reads task events for display.
- Current Supabase patterns:
- Append-only `insert` and owner-scoped `select`.
- Target Drizzle shape:
- Use `db.insert(aiTaskEvents).values({ ownerId, taskId, ... })` for appends.
- Reads include `aiTaskEvents.ownerId = session.user.id` and task/project scoping.
- No update helper should be introduced.
- Auth/authorization rule:
- A user may read events for their own tasks and may only cause event inserts through server-owned task execution paths.
- Risks:
- Event ordering must remain stable by creation time or id.
- Missing owner id on event insert would break the replacement for RLS.

### run_sessions

- Current source files:
- `scripts/001_init_schema.sql:213-225` creates `run_sessions`.
- `app/actions/run.ts:53-130` starts runs from AI tasks and claims `run_session_id`.
- `lib/runtime/service.ts:49-79`, `lib/runtime/service.ts:85-146`, and `lib/runtime/service.ts:152-340` create sessions and drive status transitions.
- `app/(app)/projects/[id]/run/page.tsx:69-109` reads active sessions and events.
- Current Supabase patterns:
- `insert`, owner-scoped `select`, conditional `update`, and status-gated transitions.
- Target Drizzle shape:
- Use `runSessions.ownerId = session.user.id` for user reads.
- Start-session flows should insert session, initial event, and project touch in a transaction.
- Preserve status gates such as `starting`, `running`, `stopping`, and terminal states.
- Auth/authorization rule:
- A run session belongs to the owner of its project and linked task, when linked.
- Risks:
- Preview process cleanup must still happen when a conditional DB update loses a race.
- Linking a task to a session must keep the current `run_session_id IS NULL` claim semantics.

### run_events

- Current source files:
- `scripts/001_init_schema.sql:249-260` creates `run_events`.
- `scripts/001_init_schema.sql:266-275` grants select, insert, and delete RLS but no update policy; active app usage is append/read only.
- `lib/runtime/service.ts:443-447` appends run events.
- `app/(app)/projects/[id]/logs/page.tsx:94-100` reads recent events.
- Current Supabase patterns:
- Append-only `insert` and owner-scoped `select`.
- Target Drizzle shape:
- Insert events with `ownerId`, `projectId`, and `sessionId`.
- Reads include `runEvents.ownerId = session.user.id` and project/session filters as appropriate.
- No update helper should be introduced.
- Auth/authorization rule:
- A user may read events only for run sessions they own.
- Risks:
- Log pages reverse event ordering for presentation and must preserve that behavior.
- Event inserts from background runtime code must not depend on a request session.

### previews

- Current source files:
- `scripts/001_init_schema.sql:281-289` creates `previews`.
- `docs/migration/drizzle-schema.md` records this as a schema table with no active query sites.
- Current Supabase patterns:
- No active source query sites in the locked audit.
- Target Drizzle shape:
- Create the typed table and ownership predicates for future use.
- Keep writes server-only if preview records are added later.
- Auth/authorization rule:
- Future preview records must be scoped by `previews.ownerId = session.user.id` and project ownership.
- Risks:
- Do not infer deployment preview URL behavior from this table; current preview URLs are runtime-generated.

### exports

- Current source files:
- `scripts/001_init_schema.sql:313-325` creates `exports`.
- `docs/migration/drizzle-schema.md` records this as a schema table with no active query sites.
- Current Supabase patterns:
- No active source query sites in the locked audit.
- Target Drizzle shape:
- Create the typed table and ownership predicates for future use.
- Auth/authorization rule:
- Future export rows must use `exports.ownerId = session.user.id` and project ownership.
- Risks:
- Export artifacts may have filesystem or object-storage lifecycle concerns outside the current DB rewrite.

### provider_configs

- Current source files:
- `scripts/001_init_schema.sql:350-361` creates `provider_configs`.
- `scripts/003_provider_configs_default_ai.sql:4-9` adds `is_default` and a unique default index.
- `app/actions/provider-configs.ts:78-98` saves provider configs.
- `app/actions/provider-configs.ts:100-118` handles default-provider conflicts.
- `lib/ai/providers/server.ts:24-33` reads the default provider config.
- Current Supabase patterns:
- Owner-scoped `select`, `upsert`, update-default clearing, and unique-conflict handling.
- Target Drizzle shape:
- Use `providerConfigs.ownerId = session.user.id` in UI actions.
- Wrap unset-default plus upsert in a transaction.
- Preserve the unique partial index behavior for one default provider per user.
- Auth/authorization rule:
- Users can read and mutate only their own provider configs.
- Risks:
- Default selection can race without a transaction.
- Provider metadata must remain sanitized and must not expose secrets.

### user_secrets

- Current source files:
- `scripts/005_user_secrets.sql:7-16` creates `user_secrets`.
- `scripts/005_user_secrets.sql:18-21` documents encrypted value constraints.
- `scripts/005_user_secrets.sql:26-40` applies `auth.uid()` RLS policies.
- `lib/secrets/index.ts:15-95` saves, reads, checks, and deletes encrypted secrets.
- `app/actions/secrets.ts:85-130` validates and invokes secret helpers.
- Current Supabase patterns:
- Dynamic table access through `TABLE = "user_secrets"`, `upsert`, `select`, and `delete`.
- Target Drizzle shape:
- Replace dynamic string table usage with typed `userSecrets` schema import.
- Use `onConflictDoUpdate` for `(ownerId, kind, name)`.
- Keep `encryptedValue` as `text`; do not normalize, decode, re-encode, trim, or JSON-wrap ciphertext.
- Auth/authorization rule:
- A user can manage only secrets with `userSecrets.ownerId = session.user.id`.
- Risks:
- Changing `UDD_SECRET_KEY` breaks decryptability of existing secrets.
- Any ciphertext transformation can corrupt AES-GCM payloads.

### user

- Current source files:
- `scripts/001_init_schema.sql:14`, `scripts/001_init_schema.sql:43`, and `scripts/001_init_schema.sql:82` currently point app FKs at Supabase `auth.users`.
- `docs/migration/drizzle-schema.md` defines the Better Auth `user` table as the target owner table.
- Current Supabase patterns:
- Supabase owns identity rows outside app schema.
- Target Drizzle shape:
- Better Auth owns `user`; app FKs point to `user.id`.
- Auth/authorization rule:
- App code should not read the `user` table for session gating; it should use Better Auth session APIs.
- Risks:
- Deleting a user must intentionally cascade or explicitly clean up app-owned rows.

### session

- Current source files:
- `docs/migration/drizzle-schema.md` defines the Better Auth `session` table.
- `docs/migration/better-auth-integration.md` defines `getSession()` as the server access path.
- Current Supabase patterns:
- Supabase session cookies and middleware refresh.
- Target Drizzle shape:
- Better Auth manages session rows through its Drizzle adapter.
- Auth/authorization rule:
- Application code treats `getSession()` as the authorization boundary and does not hand-roll session table queries.
- Risks:
- Cookie-format cutover is atomic; existing Supabase sessions will not survive the auth migration.

### account

- Current source files:
- `docs/migration/drizzle-schema.md` defines the Better Auth `account` table.
- `docs/migration/better-auth-integration.md` locks the initial auth scope to email/password.
- Current Supabase patterns:
- Supabase Auth owns account credentials.
- Target Drizzle shape:
- Better Auth manages account rows through its adapter.
- Auth/authorization rule:
- App code does not query account rows for authorization.
- Risks:
- Future OAuth work must not be mixed into this migration batch.

### verification

- Current source files:
- `docs/migration/drizzle-schema.md` defines the Better Auth `verification` table.
- `docs/migration/better-auth-integration.md` disables email verification for the current target flow.
- Current Supabase patterns:
- Supabase Auth callback and verification flow.
- Target Drizzle shape:
- Better Auth manages verification rows when enabled.
- Auth/authorization rule:
- No app-table ownership rule depends on verification rows.
- Risks:
- Current callback route must be removed when Better Auth routes replace Supabase Auth.

## 5. File-by-file rewrite catalog

| File | Current dependency/pattern | Target dependency/pattern | Better Auth before/after | Ordering | Verification marker |
| --- | --- | --- | --- | --- | --- |
| `lib/supabase/server.ts` | Server Supabase client using cookies and public Supabase env vars; evidence `lib/supabase/server.ts:1-25`. | Delete after server session and DB call sites use Better Auth and Drizzle. | Before: server code imports Supabase `createClient()`. After: server code imports `getSession()` and Drizzle query helpers. | After Better Auth helpers and Drizzle query helpers exist. | `rg "@/lib/supabase/server|lib/supabase/server" app components lib` returns zero active hits. |
| `lib/supabase/client.ts` | Browser singleton around `createBrowserClient()`; evidence `lib/supabase/client.ts:1-13`. | Delete after auth forms use `lib/auth-client.ts`. | Before: client forms create a Supabase browser client. After: client forms use Better Auth `authClient`, `signIn.email`, `signUp.email`, and optional `useSession`. | After Better Auth client integration. | `rg "@/lib/supabase/client|lib/supabase/client" app components lib` returns zero active hits. |
| `lib/supabase/proxy.ts` | Middleware Supabase session refresh and route gate; evidence `lib/supabase/proxy.ts:11-53`. | Delete after `middleware.ts` uses Better Auth session lookup. | Before: `supabase.auth.getUser()` refreshes/gates requests. After: middleware calls `auth.api.getSession({ headers: request.headers })`. | During Better Auth integration before app route rewrites are complete. | `rg "updateSession|lib/supabase/proxy" .` returns zero active hits. |
| `lib/supabase/service.ts` | Supabase service-role admin client using `SUPABASE_SERVICE_ROLE_KEY`; evidence `lib/supabase/service.ts:1-16`. | Delete after account deletion and privileged cleanup use explicit server Drizzle/Better Auth operations. | Before: service-role client bypasses RLS. After: Better Auth user deletion plus named Drizzle transactions replace bypass behavior. | After profile/account deletion rewrite. | `rg "SUPABASE_SERVICE_ROLE_KEY|createServiceClient" app lib` returns zero hits. |
| `middleware.ts` | Imports Supabase proxy and delegates all gating to it. | Direct Better Auth middleware gate for protected routes and auth pages. | Before: Supabase cookie mutation and `getUser()`. After: Better Auth session read, no Supabase cookie refresh, same `/auth/login?redirect=` behavior. | With Better Auth integration before deleting proxy. | `rg "@/lib/supabase/proxy|updateSession" middleware.ts` returns zero hits. |
| `app/(app)/layout.tsx` | Protected layout authenticates through Supabase server client. | `getSession()` gate, preserving redirect semantics. | Before: `supabase.auth.getUser()`. After: Better Auth `getSession()` and `session.user.id` for downstream ownership. | After `lib/auth-session.ts` exists. | `rg "auth.getUser|@/lib/supabase" 'app/(app)/layout.tsx'` returns zero hits. |
| `components/auth/login-form.tsx` | Supabase browser sign-in flow; evidence `components/auth/login-form.tsx:27-28`. | Better Auth `signIn.email` flow from `lib/auth-client.ts`. | Before: `supabase.auth.signInWithPassword({ email, password })`. After: `authClient.signIn.email({ email, password })`, then existing redirect/refresh. | During Better Auth integration. | `rg "supabase|signInWithPassword|NEXT_PUBLIC_SUPABASE" components/auth/login-form.tsx` returns zero hits. |
| `components/auth/sign-up-form.tsx` | Supabase browser signup plus Supabase redirect env; evidence `components/auth/sign-up-form.tsx:29-35`. | Better Auth `signUp.email`; no Supabase callback redirect env. | Before: `supabase.auth.signUp()` and confirmation callback. After: `authClient.signUp.email({ email, password, name })`; profile creation happens in Better Auth hook. | During Better Auth integration. | `rg "supabase|NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL|signUp\(" components/auth/sign-up-form.tsx` shows only Better Auth signup, no Supabase/env hits. |
| `app/auth/callback/route.ts` | Supabase Auth code exchange callback; evidence `app/auth/callback/route.ts:10-11`. | Delete; Better Auth route handles auth endpoints. | Before: Supabase exchange-code callback. After: `app/api/auth/[...all]/route.ts` owns Better Auth handlers; no callback route needed for unlocked email/password target. | After `app/api/auth/[...all]/route.ts` exists. | File absent and `rg "exchangeCodeForSession" app` returns zero hits. |
| `app/auth/logout/route.ts` | Supabase server sign-out; evidence `app/auth/logout/route.ts:5-6`. | Better Auth `auth.api.signOut` or client sign-out path per prior spec. | Before: Supabase `auth.signOut()`. After: Better Auth sign-out clears Better Auth cookies and redirects to login. | During Better Auth integration. | `rg "supabase|auth.signOut" app/auth/logout/route.ts` returns zero Supabase hits; Better Auth `auth.api.signOut` may remain. |
| `app/actions/projects.ts` | Supabase auth helper, project CRUD, slug uniqueness checks; evidence `app/actions/projects.ts:13`, `app/actions/projects.ts:25`, `app/actions/projects.ts:46`, `app/actions/projects.ts:66`, `app/actions/projects.ts:78`. | `getSession()` plus Drizzle project helpers. | Before: Supabase `user.id` and RLS enforce ownership. After: Better Auth `session.user.id` is passed into every Drizzle project predicate. | After DB query helpers. | `rg "@/lib/supabase|\.from\(" app/actions/projects.ts` returns zero hits. |
| `app/actions/ai.ts` | Supabase auth helper, prompt/task/project writes, task status actions; evidence `app/actions/ai.ts:27`, `app/actions/ai.ts:81`, `app/actions/ai.ts:94`, `app/actions/ai.ts:166`, `app/actions/ai.ts:294`. | `getSession()` plus Drizzle prompt/task/event/project helpers and transactions. | Before: Supabase session plus PostgREST status mutations. After: Better Auth `session.user.id` drives owner predicates; background workers use stored owner ids. | After AI task/event helpers. | `rg "@/lib/supabase|\.from\(" app/actions/ai.ts` returns zero hits. |
| `app/actions/run.ts` | Supabase task read/claim and run-session creation; evidence `app/actions/run.ts:56`, `app/actions/run.ts:60`, `app/actions/run.ts:99`, `app/actions/run.ts:118`, `app/actions/run.ts:125`. | `getSession()` plus Drizzle conditional task claim and run-session helpers. | Before: Supabase user plus RLS. After: Better Auth `session.user.id` scopes task claim and session creation. | After run session and AI task helpers. | `rg "@/lib/supabase|\.from\(" app/actions/run.ts` returns zero hits. |
| `app/actions/profile.ts` | Supabase auth profile update and service-role account deletion; evidence `app/actions/profile.ts:11`, `app/actions/profile.ts:15`, `app/actions/profile.ts:31`, `app/actions/profile.ts:36`. | `getSession()`, Drizzle profile update, Better Auth/Drizzle account delete. | Before: Supabase user plus admin delete. After: Better Auth session validates caller; Better Auth user deletion or Drizzle `user` delete clears owned data. | After Better Auth integration and service-role removal. | `rg "createServiceClient|@/lib/supabase|SUPABASE_SERVICE_ROLE_KEY" app/actions/profile.ts` returns zero hits. |
| `app/actions/provider-configs.ts` | Supabase config save/default handling; evidence `app/actions/provider-configs.ts:61`, `app/actions/provider-configs.ts:80`, `app/actions/provider-configs.ts:87`, `app/actions/provider-configs.ts:100-118`. | Drizzle transaction for default clearing plus upsert. | Before: Supabase user id scopes config rows. After: Better Auth `session.user.id` scopes config rows; no credential storage claims change. | After provider config schema/helper. | `rg "@/lib/supabase|\.from\(" app/actions/provider-configs.ts` returns zero hits. |
| `app/actions/secrets.ts` | Supabase-authenticated calls into secret helpers; evidence `app/actions/secrets.ts:88`, `app/actions/secrets.ts:110`, `app/actions/secrets.ts:130`. | `getSession()` plus Drizzle-backed secret helpers. | Before: Supabase user id is passed to secret helpers. After: Better Auth `session.user.id` is passed; encryption code remains unchanged. | After `lib/secrets/index.ts` rewrite. | `rg "@/lib/supabase|auth.getUser" app/actions/secrets.ts` returns zero hits. |
| `app/(app)/projects/[id]/layout.tsx` | Nested protected project layout imports Supabase, calls `supabase.auth.getUser()`, checks owned project existence through `.from("projects")`, then fire-and-forget touches open time; evidence `app/(app)/projects/[id]/layout.tsx:2`, `app/(app)/projects/[id]/layout.tsx:13-16`, `app/(app)/projects/[id]/layout.tsx:19-24`, `app/(app)/projects/[id]/layout.tsx:29`. | `getSession()` plus a Drizzle `projectExistsForOwner(projectId, session.user.id)`/touch helper. | Before: layout reads Supabase user and project ownership directly. After: Better Auth session gates access and Drizzle ownership predicate replaces RLS. | Before child project pages rely on migrated loaders. | `rg "@/lib/supabase|auth.getUser|\.from\(" 'app/(app)/projects/[id]/layout.tsx'` returns zero hits. |
| `app/(app)/projects/[id]/page.tsx` | Project detail page loads project, recent files, tasks, prompts, and run sessions through Supabase; evidence `app/(app)/projects/[id]/page.tsx:80-174`. | `getSession()` plus owner-scoped Drizzle detail loaders. | Before: Supabase user and RLS/owner filters. After: Better Auth `session.user.id` is included in every loader predicate. | After project, file, task, prompt, and run helpers. | `rg "@/lib/supabase|auth.getUser|\.from\(" 'app/(app)/projects/[id]/page.tsx'` returns zero hits. |
| `app/(app)/projects/[id]/run/page.tsx` | Run page loads project, sessions, events, and runnable task context through Supabase; evidence `app/(app)/projects/[id]/run/page.tsx:37-103`. | `getSession()` plus owner-scoped Drizzle run/session/event loaders. | Before: Supabase user gates page reads. After: Better Auth `session.user.id` scopes project and run reads. | After run/session/event helpers. | `rg "@/lib/supabase|auth.getUser|\.from\(" 'app/(app)/projects/[id]/run/page.tsx'` returns zero hits. |
| `app/(app)/projects/[id]/files/page.tsx` | Files page loads project/file records through Supabase; evidence `app/(app)/projects/[id]/files/page.tsx:54-109`. | `getSession()` plus owner-scoped Drizzle file loaders. | Before: Supabase user plus RLS/owner filters. After: Better Auth `session.user.id` scopes project and file reads. | After project file helpers. | `rg "@/lib/supabase|auth.getUser|\.from\(" 'app/(app)/projects/[id]/files/page.tsx'` returns zero hits. |
| `app/(app)/projects/[id]/ai/page.tsx` | AI page loads project, tasks, event counts/events, and related prompt data through Supabase; evidence `app/(app)/projects/[id]/ai/page.tsx:40-127`. | `getSession()` plus owner-scoped Drizzle task/event/prompt loaders. | Before: Supabase user plus PostgREST count/select patterns. After: Better Auth `session.user.id` scopes task, event, and prompt reads. | After AI task/event/prompt helpers. | `rg "@/lib/supabase|auth.getUser|\.from\(" 'app/(app)/projects/[id]/ai/page.tsx'` returns zero hits. |
| `app/(app)/projects/[id]/logs/page.tsx` | Logs page reads recent run events through Supabase; evidence `app/(app)/projects/[id]/logs/page.tsx:48-95`. | `getSession()` plus owner-scoped Drizzle run event loaders. | Before: Supabase user gates log reads. After: Better Auth `session.user.id` scopes project and run event reads. | After run event helpers. | `rg "@/lib/supabase|auth.getUser|\.from\(" 'app/(app)/projects/[id]/logs/page.tsx'` returns zero hits. |
| `app/(app)/projects/[id]/settings/page.tsx` | Project settings page loads and updates project-owned metadata through Supabase-backed actions/readers; evidence `app/(app)/projects/[id]/settings/page.tsx:28-66`. | `getSession()` plus owner-scoped Drizzle project/settings loaders and actions. | Before: Supabase user and project ownership checks. After: Better Auth `session.user.id` scopes reads and writes. | After project helpers/actions. | `rg "@/lib/supabase|auth.getUser|\.from\(" 'app/(app)/projects/[id]/settings/page.tsx'` returns zero hits. |
| `app/(app)/projects/page.tsx` | Project list and recent activity through Supabase; evidence `app/(app)/projects/page.tsx:37-84`. | `getSession()` plus Drizzle list/search/activity loaders. | Before: Supabase user gates list. After: Better Auth `session.user.id` scopes list, search, and recent activity queries. | After project, task, and run helpers. | `rg "@/lib/supabase|\.from\(" 'app/(app)/projects/page.tsx'` returns zero hits. |
| `app/(app)/settings/page.tsx` | Profile and provider config reads through Supabase; evidence `app/(app)/settings/page.tsx:23-44`. | `getSession()` plus Drizzle profile/provider loaders. | Before: Supabase user id reads profile/config. After: Better Auth session id reads profile/config. | After profile/provider helpers. | `rg "@/lib/supabase|\.from\(" 'app/(app)/settings/page.tsx'` returns zero hits. |
| `app/page.tsx` | Public landing page redirects authenticated Supabase users. | Use Better Auth `getSession()` to preserve authenticated redirect/render split. | Before: Supabase `getUser()` decides redirect. After: Better Auth `getSession()` decides redirect. | With layout/session migration. | `rg "@/lib/supabase|auth.getUser" app/page.tsx` returns zero hits. |
| `components/app/top-nav.tsx` | Session and profile read through Supabase; evidence `components/app/top-nav.tsx:10-18`. | `getSession()` plus Drizzle profile read. | Before: Supabase user and profile table. After: Better Auth session plus `profiles.id = session.user.id`; email comes from `session.user.email`. | After profile helper. | `rg "@/lib/supabase|auth.getUser|\.from\(" components/app/top-nav.tsx` returns zero hits. |
| `lib/secrets/index.ts` | Supabase dynamic `user_secrets` helper; evidence `lib/secrets/index.ts:5`, `lib/secrets/index.ts:15-95`. | Drizzle `userSecrets` helper preserving ciphertext text. | Before: caller supplies Supabase-authenticated owner id. After: caller supplies Better Auth `session.user.id`; helper has no browser/session dependency. | Before `app/actions/secrets.ts` final verification. | `rg "@/lib/supabase|\.from\(" lib/secrets/index.ts` returns zero hits; `rg "encryptedValue|encrypted_value" lib/secrets/index.ts` confirms ciphertext handling remains. |
| `lib/ai/providers/server.ts` | Supabase provider config lookup and Vercel AI Gateway env assumptions; evidence `lib/ai/providers/server.ts:24-33` and `docs/migration/env-lockdown.md:11-13`. | Drizzle provider config lookup and direct configurable provider env. | Before: Supabase-backed provider config read. After: Drizzle read scoped by explicit owner when per-user, with no Better Auth dependency in background-only paths unless a request user is required. | After provider config helper and env-lockdown changes. | `rg "supabase|AI_GATEWAY_API_KEY|VERCEL" lib/ai/providers/server.ts` returns zero active hits. |
| `lib/ai/service.ts` | Supabase task, event, file, and stale-reaper flows; evidence `lib/ai/service.ts:74-80`, `lib/ai/service.ts:113`, `lib/ai/service.ts:126`, `lib/ai/service.ts:379`, `lib/ai/service.ts:402-418`. | Drizzle service with conditional updates and transactions where noted. | Before: service uses stored task owner ids plus RLS comments. After: background service reads task owner ids from Drizzle and never trusts cookies. | After core Drizzle helpers. | `rg "@/lib/supabase|\.from\(" lib/ai/service.ts` returns zero hits except allowed `Array.from` false positives if present. |
| `lib/runtime/service.ts` | Supabase run session, run event, project, and file flows; evidence `lib/runtime/service.ts:25`, `lib/runtime/service.ts:50`, `lib/runtime/service.ts:155-159`, `lib/runtime/service.ts:447`. | Drizzle runtime service preserving status gates and event append behavior. | Before: user-initiated entrypoints call Supabase auth; background drive uses stored session owner ids. After: Better Auth only at user entrypoints; background drive uses stored owner ids. | After run/session/event helpers. | `rg "@/lib/supabase|\.from\(" lib/runtime/service.ts` returns zero hits. |
| `lib/runtime/executor.ts` | Supabase project file loading for previews; evidence `lib/runtime/executor.ts:42`, `lib/runtime/executor.ts:60`. | Drizzle project file loader or injected read interface. | Before: no direct auth, relies on caller-provided project/task context and Supabase access. After: no Better Auth dependency; callers must pass already-authorized identifiers or stored owner ids. | After project file helper. | `rg "@/lib/supabase|\.from\(" lib/runtime/executor.ts` returns zero hits. |

## 6. Auth/session rewrite catalog

| Flow | Current behavior | Target behavior |
| --- | --- | --- |
| Login | `components/auth/login-form.tsx` uses Supabase browser auth. | Use Better Auth `signIn.email` from `lib/auth-client.ts`; preserve redirect handling and form validation. |
| Signup | `components/auth/sign-up-form.tsx` uses Supabase signup and `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL`. | Use Better Auth `signUp.email`; no Supabase callback redirect env. Better Auth hook creates `profiles`. |
| Callback | `app/auth/callback/route.ts` exchanges Supabase auth codes. | Delete the route. Better Auth route handler under `app/api/auth/[...all]/route.ts` handles auth endpoints. |
| Logout | `app/auth/logout/route.ts` signs out through Supabase. | Use Better Auth sign-out and redirect to login or prior destination as locked in the prior integration doc. |
| Protected app layout | `app/(app)/layout.tsx` gates through `supabase.auth.getUser()`. | Gate through `getSession()`. Redirect unauthenticated users to `/auth/login`. |
| Middleware session gating | `middleware.ts` delegates to Supabase proxy. | Use Better Auth `auth.api.getSession({ headers: request.headers })` and preserve protected/auth route redirects. |
| Profile creation | SQL trigger on `auth.users` inserts `profiles`. | Better Auth `databaseHooks.user.create.after` inserts the profile row through Drizzle. |
| Account deletion | `app/actions/profile.ts` uses a service-role Supabase admin delete. | Use explicit server-only Better Auth/Drizzle deletion. Deleting `user` should cascade app rows according to the Drizzle schema. |

Mechanical replacement rule:

```ts
const session = await getSession()
const user = session ? session.user : null
```

Use `session.user.id` everywhere existing code uses `user.id` for owner filters. Use `session.user.email` only where the current UI needs an email string.

## 7. Service-role and privileged operation rewrite catalog

| Privileged surface | Current evidence | Target explicit operation |
| --- | --- | --- |
| Generic service-role client | `lib/supabase/service.ts:3-16` creates a service-role Supabase client. | Delete the generic bypass client. No replacement generic privileged client is allowed. |
| Account deletion | `app/actions/profile.ts:27-39` deletes the authenticated user through Supabase admin APIs. | Server action validates current session, deletes the Better Auth user or invokes Better Auth deletion API, signs out, and relies on app-table cascades or explicit transactional cleanup. |
| Cross-table cleanup | Current DB relies on FK cascades tied to Supabase `auth.users`. | Drizzle schema FKs point to Better Auth `user.id`; account deletion must be verified to remove `profiles`, projects, tasks, events, sessions, provider configs, and secrets. |
| Encrypted user secrets | `lib/secrets/index.ts:15-95` manages encrypted user secret rows. | Server-only Drizzle helpers manage ciphertext. Account deletion must delete secret rows without attempting to decrypt them. |
| Signup profile creation | `scripts/001_init_schema.sql:382-403` uses a database trigger. | Better Auth database hook inserts `profiles` as part of auth-owned user creation flow. |

Target transaction approach for account deletion:

1. Load `session` through Better Auth.
2. Start an explicit DB transaction if the Better Auth API path does not provide an atomic cascade boundary.
3. Delete app-owned rows that are not covered by FK cascade.
4. Delete the Better Auth `user` row or invoke the Better Auth delete-user API.
5. Sign out and clear cookies.
6. Redirect to `/auth/login`.

## 8. RLS-to-application-authorization migration notes

RLS is not retained in the self-hosted Drizzle target. Every place that currently depends on `auth.uid()` must become an explicit Drizzle predicate or server-side precondition.

| Current RLS assumption | Replacement rule |
| --- | --- |
| `profiles.id = auth.uid()` | `profiles.id = session.user.id`. |
| Owner tables use `owner_id = auth.uid()` | `table.ownerId = session.user.id` on every user-facing read/write/delete. |
| Project child rows are protected by their own `owner_id` and project relationship. | Query child rows with both `child.ownerId = session.user.id` and the parent id where possible. |
| Append-only event tables have no update policy. | Provide insert and read helpers only. Do not add update helpers for `ai_task_events` or `run_events`. |
| Service role bypasses RLS for admin actions. | Replace each bypass with a named privileged operation that validates the caller and documents its cascade behavior. |

Authorization predicates by operation:

| Operation | Required predicate |
| --- | --- |
| Read current profile | `eq(profiles.id, session.user.id)` |
| Read project by id | `and(eq(projects.id, projectId), eq(projects.ownerId, session.user.id))` |
| List projects | `eq(projects.ownerId, session.user.id)` |
| Read project child rows | `and(eq(child.projectId, projectId), eq(child.ownerId, session.user.id))` |
| Update/delete owned row | `and(eq(table.id, id), eq(table.ownerId, session.user.id))` |
| Link task to run session | `and(eq(aiTasks.id, taskId), eq(aiTasks.ownerId, session.user.id), isNull(aiTasks.runSessionId))` |
| Background task or runtime writes | Use the stored owner id from the already-loaded task/session, not a request cookie. |

## 9. Transaction and concurrency notes

| Flow | Current behavior | Required Drizzle behavior |
| --- | --- | --- |
| Account deletion cleanup | Service-role delete depends on Supabase admin behavior and DB cascades. | Use explicit transaction or verified Better Auth cascade path. Never leave secrets or provider configs orphaned. |
| Project deletion cleanup | `app/actions/projects.ts:86-108` deletes a project after owner check. | Verify FK cascade covers files, prompts, tasks, events, sessions, previews, exports, provider links if any. If not, delete children in a transaction. |
| AI task creation/event append | `app/actions/ai.ts:80-113` inserts prompt/task and touches project as separate calls; `lib/ai/service.ts:109-119` appends events. | Use transaction for prompt insert, task insert, and project touch. Event appends remain isolated append-only writes but include `ownerId`. |
| AI task claiming | `lib/ai/service.ts:121-142` conditionally updates pending tasks. | Preserve conditional `status = 'pending'` update with `returning()` row count. |
| AI task cancel/delete/retry | `app/actions/ai.ts:165-197`, `app/actions/ai.ts:221-244`, and `app/actions/ai.ts:279-363` use status and owner guards. | Preserve status and owner predicates exactly. Race losses should remain non-fatal where current behavior treats them as stale state. |
| Project file persistence | `lib/ai/service.ts:374-433` upserts files and prunes stale scaffold files. | Wrap file upsert plus prune in one transaction. Keep path allowlist behavior for stale deletion. |
| Run session creation/event append | `lib/runtime/service.ts:49-79` creates session, event, and project touch. | Use transaction for session insert, initial event insert, and project activity touch. |
| Run session transitions | `lib/runtime/service.ts:101-145` and `lib/runtime/service.ts:281-298` use conditional transitions. | Preserve status-gated updates and cleanup when the transition loses a race. |
| Run from task | `app/actions/run.ts:94-130` claims a task with `run_session_id IS NULL`. | Preserve `isNull(aiTasks.runSessionId)` in the Drizzle `where` clause and use `returning()` to detect an already-started run. |
| Provider config updates | `app/actions/provider-configs.ts:100-118` handles default conflicts after the fact. | Use a transaction for clearing old default plus upsert. Keep the unique default index as the hard stop. |
| Secret updates | `lib/secrets/index.ts:17-22` upserts encrypted values. | Use one `onConflictDoUpdate` statement. Do not log, inspect, or transform encrypted values. |

## 10. Implementation ordering

1. Add Drizzle dependencies, `drizzle.config.ts`, `lib/db/index.ts`, and schema files from `docs/migration/drizzle-schema.md`.
2. Add Better Auth dependencies and files from `docs/migration/better-auth-integration.md`: `lib/auth.ts`, `lib/auth-client.ts`, `lib/auth-session.ts`, and `app/api/auth/[...all]/route.ts`.
3. Generate and reconcile Better Auth schema against the locked Drizzle schema.
4. Add reusable query helpers in `lib/db/queries/` for `profiles`, `projects`, `project_files`, `prompts`, `ai_tasks`, `ai_task_events`, `run_sessions`, `run_events`, `provider_configs`, and `user_secrets`.
5. Replace middleware and auth forms with Better Auth so session acquisition no longer depends on Supabase.
6. Migrate protected layout, public auth redirects, and shared session/profile readers to `getSession()`.
7. Migrate profile/user flows, including profile creation and account deletion, before removing service-role code.
8. Migrate project CRUD in `app/actions/projects.ts` and project listing/detail pages.
9. Migrate AI task, prompt, event, project-file, and provider lookup flows in `app/actions/ai.ts`, `lib/ai/service.ts`, and `lib/ai/providers/server.ts`.
10. Migrate run session, run event, and preview file-loading flows in `app/actions/run.ts`, `lib/runtime/service.ts`, and `lib/runtime/executor.ts`.
11. Migrate provider config and encrypted secret flows in `app/actions/provider-configs.ts`, `app/actions/secrets.ts`, and `lib/secrets/index.ts`.
12. Delete `lib/supabase/**`, `app/auth/callback/route.ts`, and obsolete Supabase signup-success flows only after all imports are gone.
13. Remove Supabase env vars and packages after source references are eliminated.
14. Run the verification checklist below.

## 11. Verification checklist

Cheap mechanical checks after implementation:

```bash
rg "@/lib/supabase|lib/supabase" app components lib middleware.ts
rg "@supabase/ssr|@supabase/supabase-js" .
rg "createBrowserClient|createServerClient" app components lib middleware.ts
rg "supabase\.auth\.getUser\(" app components lib middleware.ts
rg "\.from\(" app components lib
rg "auth\.uid\(\)|auth\.users" scripts app components lib docs/migration
rg "NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL" .
rg "AI_GATEWAY_API_KEY|VERCEL" app components lib package.json
```

Expected interpretation:

| Check | Expected result |
| --- | --- |
| Supabase import checks | Zero active source hits. Historical docs may still mention retired names as migration evidence. |
| `.from(` check | Zero Supabase PostgREST query hits. Keep and review false positives such as `Array.from`. |
| `auth.uid()` and `auth.users` check | Zero active SQL/app hits after SQL migration. Migration docs may mention them as retired baseline evidence. |
| Env checks | Retired Supabase and Vercel AI Gateway variables absent from active source and deployment env. |

Future runtime checks after implementation:

```bash
pnpm typecheck
pnpm build
```

Functional checks after implementation:

1. Signup creates Better Auth `user`, `session`, and `profiles` rows.
2. Login, logout, protected route redirects, and middleware gates work without Supabase.
3. Project list, project detail, AI tab, files tab, run tab, logs tab, settings, and top nav show only the signed-in user's data.
4. Project create, rename, and delete preserve current redirect and revalidation behavior.
5. AI task create, cancel, retry, repair, event append, stale reap, and file persistence preserve current status behavior.
6. Run start, stop, event append, stale reap, preview exit, and run-from-task preserve current status behavior.
7. Provider config default selection remains one default per user.
8. `user_secrets.encrypted_value` round-trips through existing AES-GCM code byte-for-byte.
9. Account deletion removes the Better Auth user and all owned app rows, then clears the session.

## 12. Locked assumptions

| Assumption | Source or status |
| --- | --- |
| This is a total Supabase removal, not a compatibility layer. | Locked by `docs/migration/better-auth-integration.md`. |
| Better Auth IDs are UUID strings generated with `crypto.randomUUID()`. | Locked by prior migration decisions and `docs/migration/drizzle-schema.md`. |
| App table owner FKs point to Better Auth `user.id`, not Supabase `auth.users`. | Locked by `docs/migration/drizzle-schema.md`. |
| RLS is dropped and replaced by explicit app-side ownership filters. | Locked by `docs/migration/drizzle-schema.md`. |
| `user_secrets.encrypted_value` remains `text` and must round-trip AES-GCM ciphertext byte-for-byte. | Locked by `docs/migration/drizzle-schema.md` and `scripts/005_user_secrets.sql`. |
| `previews` and `exports` have no active current query sites and remain schema-ready until product code uses them. | Locked by Hermes audit and prior schema spec. |
| Service-role Supabase admin behavior is removed; account deletion becomes Better Auth/Drizzle-owned. | Locked by `docs/migration/better-auth-integration.md`. |
| Existing Supabase cookies do not need backward-compatible migration. | Locked by the Better Auth cutover decision for this beta migration. |
| Line numbers are source-baseline evidence for this batch; implementation prompts must revalidate them immediately if intervening code changes land. | Locked implementation guardrail. |
| `pnpm lint` is a package script, but current tooling audit says `pnpm exec eslint --version` fails with `Command "eslint" not found`; do not claim lint passes until tooling is fixed and the command is rerun. | Locked by Hermes audit. |
