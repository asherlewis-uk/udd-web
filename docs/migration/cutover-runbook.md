# Cutover Runbook

## 1. Scope and cutover strategy

This runbook is the operator-facing cutover plan for moving UDD from the current Vercel + Supabase baseline to self-hosted Legion + Cloudflare Tunnel + app-owned Postgres through Drizzle and Better Auth.

It applies after the implementation migration branch has landed and passed verification. It is not a claim that current `main` is already deployable in the target shape. Current source still includes Supabase SSR, Vercel Analytics, Vercel AI Gateway assumptions, and Supabase Auth/RLS-shaped SQL (`package.json:42-44`, `next.config.mjs:2-15`, `scripts/001_init_schema.sql:3-14`, `scripts/001_init_schema.sql:21-35`; see also `docs/migration/legion-deployment-runbook.md:41-58`).

The cutover strategy is staged:

1. Complete docs and implementation planning.
2. Land the implementation migration branch and verify it against the gates in this runbook.
3. Create source and target backups and rehearse restore.
4. Deploy the Legion image and verify the local container.
5. Verify Cloudflare Tunnel and public origin behavior through caddy.
6. Switch public traffic.
7. Monitor the rollback window before cleanup.

Implementation migration and production cutover are separate events. The implementation migration removes Supabase/Vercel runtime dependencies and adds Drizzle, Better Auth, direct provider config, and the Docker-Compose-on-Legion runtime artifacts. Production cutover uses the verified migrated build, backups, target Postgres role, the `legion-internal` Docker network, and Cloudflare Tunnel through caddy to move user traffic.

## 2. Source baseline and authoritative inputs

Current baseline from source and committed docs:

| Surface | Baseline evidence | Cutover implication |
| --- | --- | --- |
| App shape | Next.js App Router with `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm lint`, and `pnpm typecheck` scripts in `package.json:5-10`; Next `16.2.0`, React `19.2.4`, and React DOM `19.2.4` in `package.json:53-57`. | The image build is upstream (CI). The Legion host runs only Docker. |
| Current auth/data layer | `@supabase/ssr`, `@vercel/analytics`, and `ai` are current dependencies in `package.json:42-44`. | Supabase and Vercel Analytics removal must be complete before cutover. |
| Target deps absent from baseline | The committed package dependency range in `package.json:12-75` does not include Drizzle, Postgres, Better Auth, or the Better Auth CLI; the query catalog records the same absence at `docs/migration/db-query-rewrite-catalog.md:46-48`. | Do not cut over until the implementation branch adds the target deps and rewrites imports. |
| Build config | `next.config.mjs` currently contains only `typescript.ignoreBuildErrors: false` and `images.unoptimized: true` at `next.config.mjs:2-15`; the Legion runbook records the same absence at `docs/migration/legion-deployment-runbook.md:43-44`. | `output: 'standalone'`, `experimental.after`, `Dockerfile`, and `.dockerignore` are hard gates. |
| SQL shape | `scripts/001_init_schema.sql:3-14` and `scripts/001_init_schema.sql:43` reference `auth.users`; RLS policies use `auth.uid()` at `scripts/001_init_schema.sql:28-35` and `scripts/001_init_schema.sql:66-73`. | Target Postgres schema must reference Better Auth users and enforce ownership in app queries, not Supabase RLS. |
| User secrets | `scripts/005_user_secrets.sql:7-16` creates `user_secrets`; `scripts/005_user_secrets.sql:18-21` says `encrypted_value` is ciphertext requiring `UDD_SECRET_KEY`. | Preserve `UDD_SECRET_KEY` or execute a proven re-encryption plan before any cutover. |
| Deployment scaffold | The Legion runbook lists missing scaffold (`Dockerfile`, `.dockerignore`, `docker-compose.yml`, `app/api/health/route.ts`, Forgejo Actions workflow) at `docs/migration/legion-deployment-runbook.md:55-58` and the required Docker-side prerequisites at `docs/migration/legion-deployment-runbook.md:61-91`. | Operators must use implementation-provided artifacts and fill host-specific placeholders. |

Authoritative migration inputs:

| Input | Purpose |
| --- | --- |
| `docs/migration/env-lockdown.md` | Defines current env reads, retired Supabase/Vercel variables, target Legion variables, and secret caveats (`docs/migration/env-lockdown.md:1-57`). |
| `docs/migration/drizzle-schema.md` | Defines Drizzle config, Better Auth tables, app table translations, RLS replacement, profile hook replacement, and migration sequencing (`docs/migration/drizzle-schema.md:1-8`, `docs/migration/drizzle-schema.md:10-85`, `docs/migration/drizzle-schema.md:505-557`). |
| `docs/migration/better-auth-integration.md` | Defines Better Auth server/client/session helpers, auth route handler, middleware replacement, form rewrites, logout, account deletion, and Supabase auth sweep (`docs/migration/better-auth-integration.md:1-84`, `docs/migration/better-auth-integration.md:87-130`, `docs/migration/better-auth-integration.md:316-390`). |
| `docs/migration/db-query-rewrite-catalog.md` | Defines the query rewrite inventory, Supabase wrapper deletion plan, Drizzle ownership conventions, table-by-table rewrite catalog, and high-risk files (`docs/migration/db-query-rewrite-catalog.md:1-60`, `docs/migration/db-query-rewrite-catalog.md:61-112`). |
| `docs/migration/docker-compose-architecture.md` | Defines runtime topology, image build, registry shape, the compose file layout, Postgres reuse, caddy integration, secrets file contract, healthcheck, Portainer contract, and rollback contract (`docs/migration/docker-compose-architecture.md:12-49`, `docs/migration/docker-compose-architecture.md:81-145`, `docs/migration/docker-compose-architecture.md:266-376`, `docs/migration/docker-compose-architecture.md:378-434`, `docs/migration/docker-compose-architecture.md:436-490`, `docs/migration/docker-compose-architecture.md:492-571`, `docs/migration/docker-compose-architecture.md:608-692`). |
| `docs/migration/legion-deployment-runbook.md` | Defines the Legion-host operator procedure for first deployment, routine operations, rollback, smoke tests, and verification (`docs/migration/legion-deployment-runbook.md:13-39`, `docs/migration/legion-deployment-runbook.md:123-163`, `docs/migration/legion-deployment-runbook.md:191-219`, `docs/migration/legion-deployment-runbook.md:290-381`, `docs/migration/legion-deployment-runbook.md:383-452`, `docs/migration/legion-deployment-runbook.md:454-520`, `docs/migration/legion-deployment-runbook.md:522-598`). |

`docs/user_bring_back_agent_response_to_hermes.md` is a report artifact that may exist locally. It is not committed migration truth and is not part of this deliverable.

## 3. Cutover gates

Do not switch public traffic until every gate below is complete.

- [ ] Code migration complete: implementation branch merged to the target release branch and reviewed against the migration docs in Section 2.
- [ ] Supabase imports removed from active source: zero active-source matches for `@/lib/supabase`, `lib/supabase`, `@supabase/ssr`, `@supabase/supabase-js`, `createBrowserClient`, and `createServerClient` outside migration docs.
- [ ] Drizzle schema and migrations generated from implementation source, reviewed, and applied to target Postgres using the implementation-defined migration command.
- [ ] Better Auth route handler, server auth helper, client auth helper, middleware/session gate, login, signup, logout, and protected route behavior verified.
- [ ] `pnpm typecheck` passes on the migration-complete branch.
- [ ] `pnpm build` passes and produces the Next standalone artifact after `output: 'standalone'` is enabled.
- [ ] Lint is either fixed and passing or explicitly waived in the release record with the reason. Do not assume lint passes from baseline because `pnpm lint` exists in `package.json:9`; the query catalog records current ESLint tooling as missing at `docs/migration/db-query-rewrite-catalog.md:48`.
- [ ] Env audit passes: future vars are present in the redacted production env inventory and retired vars are absent.
- [ ] `UDD_SECRET_KEY` is preserved from the source environment or a tested re-encryption plan has already migrated every encrypted value.
- [ ] Legion Docker Compose stack starts, stops, and restarts cleanly via `docker compose -f /srv/udd/docker-compose.yml`.
- [ ] Cloudflare Tunnel public HTTPS origin reaches the Legion `udd-web` container through the existing caddy reverse proxy.
- [ ] DB backup and restore rehearsal completed against disposable target data.
- [ ] Rollback path rehearsed, including the decision point for app-only rollback vs DB restore.

## 4. Pre-cutover implementation readiness

This section is the "do not cut over until implementation proves these" gate. Run these checks against the migration-complete implementation branch, targeting active source/config paths and excluding migration docs that intentionally preserve historical names.

- [ ] `next.config.mjs` contains `output: 'standalone'` AND a `Dockerfile` and `.dockerignore` exist at the repository root per `docs/migration/docker-compose-architecture.md:694-733`. Current baseline lacks all three at `next.config.mjs:2-15` and `docs/migration/legion-deployment-runbook.md:43-44`.
- [ ] `next.config.mjs` contains the required self-hosted `after()` handling; current baseline lacks this at `next.config.mjs:2-15` and long-running actions depend on `after()` per `docs/migration/legion-deployment-runbook.md:46-49`.
- [ ] `app/api/health/route.ts` exists and matches the contract at `docs/migration/docker-compose-architecture.md:515-571`: returns `200` with `{ "ok": true }`, does not touch the database, and does not call any auth or AI surface.
- [ ] Vercel Analytics import/render path removed from `app/layout.tsx` and `@vercel/analytics` removed from `package.json`; current dependency is at `package.json:43` and the removal requirement is in `docs/migration/env-lockdown.md:56-57`.
- [ ] Hardcoded preview host replaced with `UDD_PREVIEW_HOST` for externally presented preview URLs; the deployment runbook records the preview-URL concern at `docs/migration/legion-deployment-runbook.md:191-219`.
- [ ] Supabase wrappers/imports removed from active source: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/proxy.ts`, and `lib/supabase/service.ts` are deleted or unused per `docs/migration/db-query-rewrite-catalog.md:63-70`.
- [ ] Supabase packages removed from `package.json` and lockfile after references are gone.
- [ ] Better Auth server, client, and session utilities added using the shapes in `docs/migration/better-auth-integration.md:1-72`.
- [ ] Better Auth route handler added under `/api/auth/*` using the shape in `docs/migration/better-auth-integration.md:74-84`.
- [ ] Drizzle config, schema, DB client, query helpers, and migration files added per `docs/migration/drizzle-schema.md:1-8` and `docs/migration/drizzle-schema.md:540-557`.
- [ ] Supabase SQL/RLS dependency removed or replaced by Drizzle migrations; the target removes RLS and enforces ownership in app queries per `docs/migration/drizzle-schema.md:505-522`.
- [ ] AI Gateway env assumptions replaced with direct configurable provider vars; retired vars are defined in `docs/migration/env-lockdown.md:27-36`, target AI vars in `docs/migration/env-lockdown.md:46-48`, and Legion target AI behavior in `docs/migration/legion-deployment-runbook.md:123-163`.
- [ ] Query rewrite catalog completed across all high-risk files listed in `docs/migration/db-query-rewrite-catalog.md:26-36`.
- [ ] Forgejo Actions workflow (or equivalent CI trigger) builds the image and pushes both `<forgejo-registry-host>/<owner>/udd-web:<git-sha>` and `:prod` per `docs/migration/docker-compose-architecture.md:227-264`.

Useful active-source zero-hit checks:

```bash
rg "@/lib/supabase|lib/supabase" app components lib middleware.ts
rg "@supabase/ssr|@supabase/supabase-js" package.json pnpm-lock.yaml app components lib middleware.ts
rg "createBrowserClient|createServerClient" app components lib middleware.ts
rg "supabase\.auth\.getUser\(" app components lib middleware.ts
rg "\.from\(" app components lib
rg "auth\.uid\(\)|auth\.users" scripts app components lib drizzle
rg "AI_GATEWAY_API_KEY|process\.env\.VERCEL" app components lib package.json
```

Expected result after implementation: the Supabase, Supabase Auth/RLS, and Vercel AI Gateway checks return no active runtime hits. `.from(` may still find non-Supabase false positives such as `Array.from`; each remaining hit must be reviewed.

## 5. Data migration and backup plan

Because current docs do not define the final implementation migration command, this plan defines gates and templates. Fill placeholders from the implementation branch and operator environment before executing.

1. Announce and enter a freeze/write-quiescence window.
   - Disable or pause user-facing writes in the old production path.
   - Confirm no AI tasks, run sessions, provider config writes, account deletion, or project mutations are in progress.
   - Record source release commit, target release commit, source DB identifier, target DB identifier, and env file version.
2. Create a source Supabase/Postgres backup/export.
   - Template only:

     ```bash
     <source-backup-command> --output <backup-dir>/udd-source-before-cutover.<format>
     ```

   - Do not print credentials. Use operator-controlled env or secret manager references.
3. Create a target Legion/Postgres backup before import. Run against the existing Postgres container per `docs/migration/legion-deployment-runbook.md:262-288` and `docs/migration/legion-deployment-runbook.md:444-452`:

     ```bash
     docker exec postgres pg_dump \
         -U <postgres-superuser> \
         -d udd_prod \
         --format=custom \
         --file=/var/lib/postgresql/backups/udd-target-before-import.dump
     docker cp postgres:/var/lib/postgresql/backups/udd-target-before-import.dump <backup-dir>/
     ```

4. Apply the implementation-defined target schema and migrations.
   - Template only:

     ```bash
     <migration-command-using-DATABASE_URL>
     ```

   - The implementation branch must define this command before cutover. Drizzle migration generation and application are required by `docs/migration/drizzle-schema.md:540-551`. The migration command must read `DATABASE_URL` from the same env file consumed by the running app, per `docs/migration/legion-deployment-runbook.md:340-349`.
5. Import migrated data into target Postgres.
   - Preserve all app table relationships and ownership ids.
   - Map Supabase `auth.users` identities to Better Auth `user.id` according to the implementation migration.
   - Create or import Better Auth `user`, `session`, `account`, and `verification` rows only through the implementation-approved path; their target schema is described at `docs/migration/drizzle-schema.md:10-85`.
6. Verify table coverage and row counts.
   - Required app tables include `profiles`, `projects`, `project_files`, `prompts`, `ai_tasks`, `ai_task_events`, `run_sessions`, `run_events`, `provider_configs`, `user_secrets`, plus forward-looking `previews` and `exports` if present in the target migration (`docs/migration/drizzle-schema.md:92-520`).
   - Verify child table counts by owner/project/session/task relationships, not only total rows.
7. Verify profile semantics.
   - The old profile trigger is Supabase `auth.users`-driven; the target replacement is the Better Auth user-create hook at `docs/migration/drizzle-schema.md:524-530` and `docs/migration/better-auth-integration.md:32-45`.
   - Existing users must have matching `profiles.id = user.id` rows after import.
8. Verify user secrets without revealing values.
   - Preserve `user_secrets.encrypted_value` byte-for-byte unless an explicit re-encryption plan is executed.
   - Preserve `UDD_SECRET_KEY`; `scripts/005_user_secrets.sql:18-21` and `docs/migration/legion-deployment-runbook.md:247-260` state decryption depends on it.
   - Validate encrypted provider config load/save paths by checking statuses and round trips, not by logging plaintext.
9. Rehearse restore before cutover.
   - Restore source backup into a disposable database and verify app-table counts.
   - Restore target pre-import backup into a disposable database and verify that rollback procedures are executable.
   - Record restore commands and backup artifact locations in the operator run sheet outside the repo.

## 6. Auth/session cutover plan

Existing Supabase sessions and cookies are not backward-compatible with Better Auth sessions. Expect users to sign in again after cutover unless the implementation branch ships and verifies a dedicated session migration path. The Better Auth plan replaces `supabase.auth.getUser()` with `getSession()` and route/middleware checks (`docs/migration/better-auth-integration.md:59-72`, `docs/migration/better-auth-integration.md:87-126`, `docs/migration/better-auth-integration.md:391-421`).

Cutover steps:

- [ ] Set `BETTER_AUTH_URL` to the public HTTPS app origin served through Cloudflare Tunnel. The Legion env model requires this at `docs/migration/legion-deployment-runbook.md:151-163` and the canonical value shape is at `docs/migration/env-lockdown.md:43`.
- [ ] Confirm `/auth/login` loads publicly and signs in with Better Auth email/password.
- [ ] Confirm signup creates a Better Auth user and a matching profile row. The target replacement moves profile creation from Supabase trigger to Better Auth hook (`docs/migration/drizzle-schema.md:524-530`; `docs/migration/better-auth-integration.md:32-45`).
- [ ] Confirm logout uses the Better Auth sign-out path and returns to `/auth/login` (`docs/migration/better-auth-integration.md:316-330`).
- [ ] Confirm protected routes redirect unauthenticated users and load for authenticated users.
- [ ] Confirm account deletion only after non-production rehearsal or a disposable-account production check. The target deletes the Better Auth user and relies on cascades plus explicit sign-out (`docs/migration/better-auth-integration.md:332-378`; `docs/migration/drizzle-schema.md:532-539`).

Rollback caveats:

- If traffic rolls back to Supabase/Vercel after Better Auth sessions exist, users may need to sign in again there as well.
- If the target DB has accepted writes, rollback to the old app is app-only safe only when those writes do not require DB restore. See Section 11.
- If `BETTER_AUTH_SECRET` changes during rollback, Better Auth sessions can be invalidated (`docs/migration/legion-deployment-runbook.md:247-260`).

## 7. Environment cutover plan

Retire these variables from Legion production after migration:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL
AI_GATEWAY_API_KEY
VERCEL
```

Their current reads and retirement are documented in `docs/migration/env-lockdown.md:7-16` and `docs/migration/env-lockdown.md:27-36`.

Require these variables for Legion production:

```text
NODE_ENV=production
BETTER_AUTH_SECRET=<generated-auth-secret>
BETTER_AUTH_URL=https://udd.<apex>
DATABASE_URL=postgresql://udd_app:<udd-db-password>@postgres:5432/udd_prod
UDD_PREVIEW_HOST=<preview-public-or-routable-origin>
UDD_SECRET_KEY=<existing-udd-encryption-key>
UDD_AI_PROVIDER=<default-provider-id>
UDD_DEFAULT_AI_BASE_URL=<openai-compatible-base-url>
UDD_DEFAULT_AI_MODEL=<model-id>
UDD_DEFAULT_AI_API_KEY=<provider-api-key-or-local-placeholder>
```

Target definitions are in `docs/migration/env-lockdown.md:38-48` and `docs/migration/legion-deployment-runbook.md:123-163`.

`PATH=` is intentionally **not** in the require list. The container image bakes a fixed `PATH` at build time, and setting `PATH=` in the env file would shadow it. The Legion runbook moves `PATH=` to a must-not-appear grep at `docs/migration/legion-deployment-runbook.md:588-598`.

`DATABASE_URL` resolves the database host as `postgres` (Docker DNS on `legion-internal`) per `docs/migration/legion-deployment-runbook.md:151-163` and `docs/migration/docker-compose-architecture.md:424-434`.

Redacted env inventory method:

```bash
# Template: produce names and redacted presence only, never values.
env | sed -E 's/=.*$/=<redacted>/' | sort > <redacted-env-inventory>
```

Legion env file placement and permissions are locked by `docs/migration/docker-compose-architecture.md:492-513` and restated in `docs/migration/legion-deployment-runbook.md:135-149`:

| Property | Value                                |
| -------- | ------------------------------------ |
| Path     | `/srv/udd/.env.production`           |
| Mode     | `0640`                               |
| Owner    | `udd` (user)                         |
| Group    | `docker` (group)                     |
| Read by  | The `udd-web` container via `env_file:` |

Hard env gate:

- [ ] Future vars are present in the redacted inventory.
- [ ] Retired vars are absent from the redacted production inventory.
- [ ] No real values are printed in logs, chats, docs, or shell transcripts.
- [ ] `UDD_SECRET_KEY` matches the value used to encrypt existing app-managed credentials, unless a completed re-encryption plan is recorded.
- [ ] `BETTER_AUTH_SECRET` is generated and stored only in operator-controlled secret storage.
- [ ] `UDD_DEFAULT_AI_*` values are set for the target provider and no `AI_GATEWAY_API_KEY` dependency remains.

## 8. Legion deployment activation plan

The production process model is Docker Compose against the existing Legion stack (caddy + cloudflared + postgres:16) per `docs/migration/docker-compose-architecture.md:51-145` and `docs/migration/legion-deployment-runbook.md:13-39`. The image is built upstream by CI and pulled from the Forgejo container registry on Legion.

Activation sequence (mirrors `docs/migration/legion-deployment-runbook.md:290-381`):

1. **Image is built upstream by CI**, not on the Legion host. CI builds the multi-stage image defined at `docs/migration/docker-compose-architecture.md:147-225` and pushes two tags simultaneously: `<forgejo-registry-host>/<owner>/udd-web:<git-sha>` (immutable) and `<forgejo-registry-host>/<owner>/udd-web:prod` (moving), per `docs/migration/docker-compose-architecture.md:227-264`. The compose file pins to `<git-sha>`; never to `prod` or `latest`.

2. **Preflight on Legion.** Confirm host state per `docs/migration/legion-deployment-runbook.md:295-302`:

   ```bash
   docker network ls | grep legion-internal
   docker ps --format '{{.Names}}' | grep -E '^(caddy|cloudflared|postgres)$'
   docker login <forgejo-registry-host>
   ```

3. **Provision the application database role and database** (run once, per `docs/migration/legion-deployment-runbook.md:303-316`). Open a `psql` shell inside the existing Postgres container and run the SQL block at `docs/migration/docker-compose-architecture.md:383-409`:

   ```bash
   docker exec -it postgres psql -U <postgres-superuser>
   ```

   The block creates the `udd_app` role with no `SUPERUSER`/`CREATEDB`/`CREATEROLE`, the `udd_prod` database owned by `udd_app`, and the `pgcrypto` extension. Privilege scoping is documented at `docs/migration/docker-compose-architecture.md:411-422`.

4. **Install the production environment file** at the locked path per `docs/migration/legion-deployment-runbook.md:317-323`:

   ```bash
   install -m 0640 -o udd -g docker \
       <prepared-env-file> \
       /srv/udd/.env.production
   ```

5. **Place the compose file** at the canonical path — filesystem-as-source-of-truth per `docs/migration/docker-compose-architecture.md:608-645` and `docs/migration/legion-deployment-runbook.md:325-332`:

   ```bash
   install -m 0644 \
       <prepared-compose> \
       /srv/udd/docker-compose.yml
   ```

   The compose file pins `image:` to `<forgejo-registry-host>/<owner>/udd-web:<git-sha>` and joins the `legion-internal` external network. It does not publish a host port.

6. **Pull the SHA-pinned image:**

   ```bash
   docker compose -f /srv/udd/docker-compose.yml pull udd-web
   ```

7. **Run application database migrations** (placeholder until the implementation branch defines the exact command; see `docs/migration/legion-deployment-runbook.md:340-349`):

   ```bash
   <migration-command-using-DATABASE_URL>
   ```

   The migration command must read `DATABASE_URL` from the same env file consumed by the running app, or be invoked via a one-shot Docker container that mounts `/srv/udd/.env.production`.

8. **Bring the stack up:**

   ```bash
   docker compose -f /srv/udd/docker-compose.yml up -d udd-web
   ```

9. **Verify locally on the host** per `docs/migration/legion-deployment-runbook.md:362-372`:

   ```bash
   docker compose -f /srv/udd/docker-compose.yml ps
   docker compose -f /srv/udd/docker-compose.yml logs --tail=200 udd-web
   docker exec udd-web wget -qO- http://localhost:3000/api/health
   ```

   The `ps` output must show `udd-web` as `running` and `healthy`; the logs must show the Next standalone server bound to `0.0.0.0:3000`; the health probe must return `{"ok":true}` with status 200.

10. **Do not expose public traffic** until Section 10 local smoke tests pass.

## 9. Cloudflare Tunnel and DNS switch plan

Public HTTPS is terminated by the existing `cloudflared` container, which forwards to the existing `caddy` container, which reverse-proxies to `udd-web:3000` over the user-defined Docker bridge `legion-internal` per `docs/migration/docker-compose-architecture.md:81-145` and `docs/migration/legion-deployment-runbook.md:191-219`. UDD does not publish a host port. There is no loopback-to-127.0.0.1 ingress in the target shape; cloudflared routes to caddy, not to the application container.

Pre-switch checks:

- [ ] `udd-web` container is `running` and `healthy`: `docker compose -f /srv/udd/docker-compose.yml ps`.
- [ ] In-container health probe succeeds: `docker exec udd-web wget -qO- http://localhost:3000/api/health` returns `{"ok":true}`.
- [ ] The existing `caddy` container has the `udd.<apex>` reverse-proxy site block loaded (target `udd-web:3000` over `legion-internal`) per `docs/migration/docker-compose-architecture.md:436-475`. The Caddyfile path inside the caddy container is operator-defined; see `docs/migration/docker-compose-architecture.md:470-475` and §15.1.
- [ ] The existing `cloudflared` container ingress already covers `*.<apex>` and routes to caddy per `docs/migration/docker-compose-architecture.md:477-490`. No cloudflared configuration change is required for UDD.
- [ ] `BETTER_AUTH_URL` equals `https://udd.<apex>` exactly.
- [ ] `UDD_PREVIEW_HOST` is browser-routable for remote users; it must not be `127.0.0.1` for remote public traffic.
- [ ] Public `/`, `/auth/login`, and `/api/health` respond through the tunnel before any final route switch.

Switch sequence:

1. Freeze writes in the old production path.
2. Complete final source export, target backup, migration, and import.
3. Bring up the `udd-web` container with `docker compose -f /srv/udd/docker-compose.yml up -d udd-web`.
4. Apply or confirm the caddy `udd.<apex>` reverse-proxy site block. The reload mechanism for the operator's caddy container is operator-defined (see §15.1).
5. Verify the public route (`https://udd.<apex>`) before considering the switch complete.
6. Switch DNS or route traffic from the old origin to the Cloudflare-fronted hostname, if any external DNS step is required outside the wildcard ingress assumption.
7. Run public smoke tests immediately.
8. Keep old Vercel/Supabase fallback frozen and available during the rollback window.

Rollback of tunnel/DNS route is operator-defined: revert the caddy `udd.<apex>` site block (or restore the previous Caddyfile from operator-managed backups) and reload the caddy container. If DNS was changed outside cloudflared/caddy, restore the previous DNS record according to the operator's DNS change record. There are no `systemctl <cloudflared-service>` commands; cloudflared runs as a container per `docs/migration/docker-compose-architecture.md:51-145`.

## 10. Smoke test plan

Run smoke tests locally on Legion first, then through the public Cloudflare hostname. Do not declare cutover complete until both surfaces pass.

Local route checks (in-container, per `docs/migration/legion-deployment-runbook.md:524-535`):

```bash
docker exec udd-web wget -qO- http://localhost:3000/api/health
docker exec udd-web wget -qO- http://localhost:3000/
docker exec udd-web wget -qO- http://localhost:3000/auth/login >/dev/null
```

Public route checks:

```bash
curl -fsS https://udd.<apex>/
curl -fsS https://udd.<apex>/auth/login
curl -fsS https://udd.<apex>/api/health
```

Required browser routes:

- [ ] `/` loads without server error.
- [ ] `/auth/login` loads and supports Better Auth sign-in.
- [ ] `/projects` redirects unauthenticated users to login and loads for an authenticated user.
- [ ] `/projects/new` loads for an authenticated user.
- [ ] `/projects/[id]` loads an owned project for an authenticated user.
- [ ] `/projects/[id]/run` loads runtime state without fabricated preview URLs.
- [ ] `/settings` loads account/provider settings without exposing secrets.

Required behavior tests:

- [ ] Signup works and creates matching Better Auth user/profile state.
- [ ] Login works.
- [ ] Logout works.
- [ ] Protected-route redirect works for unauthenticated users.
- [ ] Project create/read/update/delete works for owned projects.
- [ ] AI task create works.
- [ ] AI task cancel works if still supported by the UI.
- [ ] AI task retry/repair works if still supported by the UI.
- [ ] Run start works.
- [ ] Run stop works.
- [ ] Run log viewing works.
- [ ] Preview URL loads from a separate browser/client when a real run is `running`.
- [ ] Provider config save/default behavior works.
- [ ] Encrypted user secret save/load works without exposing values.
- [ ] Account deletion works only after non-production rehearsal or with a disposable account.

The Legion runbook's smoke list and post-deploy checks are at `docs/migration/legion-deployment-runbook.md:522-555`.

## 11. Rollback plan

Rollback must be cautious. App rollback and DB rollback are different operations.

Rollback decision criteria:

- Prefer forward-fix when the issue is isolated, the target DB is healthy, and no user-data correctness risk exists.
- Prefer rollback when auth, routing, data import, encrypted secrets, preview URL correctness, or provider execution fails broadly.
- Do not rollback old code onto a new incompatible schema.

App-only rollback is allowed only when:

- No target DB schema migration has been applied since cutover, or the old app is confirmed compatible with the target schema.
- No target-only writes have occurred that the old app cannot read.
- Env and Cloudflare/caddy changes can be restored without changing DB state.
- The old Supabase/Vercel path remains frozen and available.

App-only rollback procedure (per `docs/migration/legion-deployment-runbook.md:454-503`):

```bash
# 1. Identify the previous SHA. In order of preference:
#    - Forgejo registry image list for <forgejo-registry-host>/<owner>/udd-web
#      (SHA tags are rollback candidates; the moving 'prod' tag is not).
#    - 'docker images <forgejo-registry-host>/<owner>/udd-web' on the host.
#    - Git history of the release branch.
# 2. Edit /srv/udd/docker-compose.yml in place, replacing the failed
#    <git-sha> with the previous one. Diff shape:
#      - image: <forgejo-registry-host>/<owner>/udd-web:<failed-sha>
#      + image: <forgejo-registry-host>/<owner>/udd-web:<previous-release-commit>
# 3. Restore the previous env file, if it changed:
install -m 0640 -o udd -g docker \
    <previous-env-file> \
    /srv/udd/.env.production
# 4. Pull and recreate.
docker compose -f /srv/udd/docker-compose.yml pull udd-web
docker compose -f /srv/udd/docker-compose.yml up -d udd-web
docker compose -f /srv/udd/docker-compose.yml ps
```

Full rollback requiring DB restore is required when migrations/imports changed the target DB or when the old app cannot safely read new data. The Legion runbook states that code rollback alone may be unsafe after schema migrations and requires explicit restore from a backup taken before migration (`docs/migration/legion-deployment-runbook.md:505-520`).

Full rollback procedure:

```bash
# Template only. Confirm target DB, backup id, and stop writes before executing.
# 1. Stop the application.
docker compose -f /srv/udd/docker-compose.yml down udd-web

# 2. Restore the database from the pre-cutover/pre-migration backup, against
#    the existing Postgres container. Command shape only; the real superuser
#    name is operator-provided.
docker cp <backup-dir>/udd-before-<release-id>.dump postgres:/var/lib/postgresql/backups/udd-before-<release-id>.dump
docker exec -i postgres pg_restore \
    -U <postgres-superuser> \
    -d udd_prod \
    --clean --if-exists --no-owner \
    /var/lib/postgresql/backups/udd-before-<release-id>.dump

# 3. Point compose at the previous image SHA (edit /srv/udd/docker-compose.yml
#    as in the app-only rollback above).

# 4. Restore the previous env file, if it changed.
install -m 0640 -o udd -g docker \
    <previous-env-file> \
    /srv/udd/.env.production

# 5. Bring the app back up.
docker compose -f /srv/udd/docker-compose.yml pull udd-web
docker compose -f /srv/udd/docker-compose.yml up -d udd-web
docker compose -f /srv/udd/docker-compose.yml ps
```

Supabase/Vercel fallback assumptions:

- The previous Vercel deployment and Supabase project must remain available during the rollback window.
- Source write freeze must be maintained until the rollback or forward-fix decision is complete.
- If fallback is resumed, reconcile any writes accepted by the target after switch or restore from the correct backup.

Better Auth session rollback caveat:

- Better Auth sessions do not become Supabase sessions. Users may need to sign in again on rollback.

`UDD_SECRET_KEY` and encryption caveat:

- If `UDD_SECRET_KEY` changed without re-encryption, encrypted provider keys can become unreadable. Preserve it for rollback, or restore the matching encrypted data and key together.

DNS/Cloudflare Tunnel rollback: revert the caddy `udd.<apex>` reverse-proxy site block (or restore the previous Caddyfile from operator-managed backups) and reload the caddy container. The exact reload mechanism is operator-defined (see §15.1). There is no `systemctl <cloudflared-service>` step; cloudflared runs as a container.

Do not rollback without DB restore if:

- The migration command changed schema incompatibly.
- Target imported or wrote user/project/provider/runtime rows after cutover.
- Better Auth user IDs or app table ownership FKs differ from the previous source path.
- Auth or encryption secrets changed without a compatible rotation plan.
- No pre-migration backup exists.

## 12. Post-cutover monitoring and cleanup

Monitor during the rollback window:

- [ ] UDD application logs:

  ```bash
  docker compose -f /srv/udd/docker-compose.yml logs -f --tail=200 udd-web
  ```

- [ ] Cloudflare-fronted ingress health:

  ```bash
  docker ps
  docker logs --tail=200 cloudflared
  docker logs --tail=200 caddy
  ```

  Any cloudflared- or caddy-specific health command is operator-defined against the running containers; this runbook does not specify one because both are operator-managed containers and the running interfaces are not pinned by the architecture doc.

- [ ] Auth errors: login, signup, logout, protected route redirects, account deletion.
- [ ] DB connection errors and migration-related exceptions.
- [ ] AI/provider failures, especially missing default provider env and provider credential lookup.
- [ ] Preview URL reachability from a browser outside Legion.
- [ ] Secret-handling logs: no plaintext provider keys, DB URLs, auth secrets, or env file values.

Keep Supabase/Vercel fallback frozen for the defined observation window. After the observation window and a successful rollback decision point, clean up retired env vars, retired secrets, unused packages, Supabase project dependencies, Vercel deployment assumptions, and historical infrastructure references. Do not decommission fallback services before backup retention, restore validation, and operator sign-off are complete.

## 13. Timeline checklist

### T-minus 1 day

- [ ] Confirm implementation branch has passed code review against all migration docs.
- [ ] Confirm CI has produced a `<git-sha>`-tagged image in the Forgejo registry for the target release.
- [ ] Confirm target Postgres role and database are provisioned per `docs/migration/docker-compose-architecture.md:383-409`.
- [ ] Confirm backup location, restore procedure, and encrypted env backup storage.
- [ ] Confirm `UDD_SECRET_KEY` preservation or completed re-encryption plan.
- [ ] Confirm rollback owner, forward-fix owner, and traffic switch owner.

### T-minus 2 hours

- [ ] Confirm no planned maintenance conflict on Vercel, Supabase, Legion, Cloudflare, or DNS.
- [ ] Confirm old production path is healthy before freeze.
- [ ] Confirm release commit, previous commit, migration version, env file version, and target image SHA are recorded.
- [ ] Confirm redacted env inventory passes Section 7.
- [ ] Confirm restore rehearsal evidence is available.

### Freeze window

- [ ] Announce write freeze.
- [ ] Stop or block user-facing writes in the old production path.
- [ ] Verify no active AI tasks or run sessions are in progress.
- [ ] Take final source backup/export.
- [ ] Take target pre-import backup (`docker exec postgres pg_dump ...` per Section 5 step 3).

### Deploy to Legion

- [ ] Pin target image SHA in `/srv/udd/docker-compose.yml`.
- [ ] Install env file with `install -m 0640 -o udd -g docker ... /srv/udd/.env.production`.
- [ ] Run migration command against target Postgres.
- [ ] Run `docker compose -f /srv/udd/docker-compose.yml pull && docker compose -f /srv/udd/docker-compose.yml up -d udd-web`.

### Smoke test local

- [ ] `docker compose -f /srv/udd/docker-compose.yml ps` shows `udd-web` running and healthy.
- [ ] `docker exec udd-web wget -qO- http://localhost:3000/api/health` returns `{"ok":true}`.
- [ ] `docker exec udd-web wget -qO- http://localhost:3000/auth/login` succeeds.
- [ ] Local logs show no startup, DB, auth, or provider-readiness errors.

### Switch public traffic

- [ ] Apply or confirm the caddy `udd.<apex>` reverse-proxy site block.
- [ ] Verify public app origin before final DNS/route switch where possible.
- [ ] Switch DNS or route from old origin to the Cloudflare-fronted hostname, if any external DNS step is required.
- [ ] Confirm `BETTER_AUTH_URL` public origin matches the switched hostname.

### Smoke test public

- [ ] Run all Section 10 route checks through `https://udd.<apex>`.
- [ ] Run all Section 10 behavior checks in a browser.
- [ ] Verify preview host from a separate client.
- [ ] Verify no secrets appear in logs.

### Monitor

- [ ] Monitor `docker compose -f /srv/udd/docker-compose.yml logs -f --tail=200 udd-web`.
- [ ] Monitor caddy/cloudflared container logs and `docker ps`.
- [ ] Monitor DB/auth/provider/preview errors.
- [ ] Keep old Vercel/Supabase path frozen and available.

### Rollback decision point

- [ ] Decide forward-fix vs rollback using Section 11 criteria.
- [ ] If rollback is needed, decide app-only rollback vs DB restore.
- [ ] If no rollback is needed, continue the observation window.

### Cleanup window

- [ ] Confirm backup retention and restore evidence.
- [ ] Remove retired production env vars.
- [ ] Remove retired Vercel/Supabase operational secrets after sign-off.
- [ ] Archive old deployment notes without preserving real secrets.
- [ ] Decommission fallback only after operator sign-off.

## 14. Verification checklist

Run these checks on the migration-complete implementation branch. Historical migration docs intentionally mention retired names, so zero-hit checks must target active source/config paths, not `docs/migration/`.

Source and branch hygiene:

```bash
git status --short
git rev-parse --short HEAD
```

Supabase and active source removal checks:

```bash
rg "@/lib/supabase|lib/supabase" app components lib middleware.ts
rg "@supabase/ssr|@supabase/supabase-js" package.json pnpm-lock.yaml app components lib middleware.ts
rg "createBrowserClient|createServerClient" app components lib middleware.ts
rg "supabase\.auth\.getUser\(" app components lib middleware.ts
rg "\.from\(" app components lib
rg "auth\.uid\(\)|auth\.users" scripts app components lib drizzle
```

Expected result: no active Supabase runtime hits. Review any `.from(` hit to distinguish Drizzle/non-Supabase false positives.

Env and provider checks:

```bash
rg "NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL" app components lib middleware.ts package.json
rg "AI_GATEWAY_API_KEY|process\.env\.VERCEL" app components lib package.json
rg "BETTER_AUTH_SECRET|BETTER_AUTH_URL|DATABASE_URL|UDD_PREVIEW_HOST|UDD_DEFAULT_AI_BASE_URL|UDD_DEFAULT_AI_MODEL|UDD_DEFAULT_AI_API_KEY|UDD_SECRET_KEY|UDD_AI_PROVIDER" app lib drizzle.config.ts
```

Expected result: retired env vars are absent from active source, future vars are present where implementation requires them, and no real values are printed.

Build and type checks (CI/dev correctness, not deploy):

```bash
pnpm typecheck
pnpm build
```

Expected result: both pass. `pnpm build` must produce the standalone artifact after `output: 'standalone'` lands. The Legion host does not run these commands; CI does.

Legion-side container checks (per `docs/migration/legion-deployment-runbook.md:557-598`):

```bash
docker compose -f /srv/udd/docker-compose.yml ps
docker compose -f /srv/udd/docker-compose.yml logs --tail=100 udd-web
docker exec udd-web wget -qO- http://localhost:3000/api/health
curl -fsS https://udd.<apex>/
```

Expected result: `udd-web` is running and healthy, logs do not show startup/auth/DB/provider errors, the in-container health probe returns `{"ok":true}`, and the public route responds through Cloudflare and caddy. Any cloudflared-/caddy-specific status command is operator-defined against the running containers.

Image and compose-file sanity checks:

```bash
docker images | grep udd-web
docker manifest inspect <forgejo-registry-host>/<owner>/udd-web:<git-sha>
docker compose -f /srv/udd/docker-compose.yml config
```

Expected result: the SHA-pinned image is present locally or in the registry, and `docker compose ... config` validates the compose file shape and substitutes any environment values without bringing the stack up.

## 15. Locked assumptions

- Current beta migration can require users to sign in again after cutover.
- Production process model is Docker Compose against the existing Legion stack (caddy + cloudflared + postgres:16) per `docs/migration/docker-compose-architecture.md:51-145`.
- Image registry is the Forgejo container registry on Legion. UDD images are tagged `<forgejo-registry-host>/<owner>/udd-web:<git-sha>` (immutable) and `<forgejo-registry-host>/<owner>/udd-web:prod` (moving) per `docs/migration/docker-compose-architecture.md:227-264`. The compose file pins to `<git-sha>`, never `:prod` or `:latest`.
- Caddy is the in-cluster reverse proxy. Cloudflared terminates public HTTPS and routes `*.<apex>` to caddy. UDD does not publish a host port and is reachable only over the `legion-internal` Docker bridge per `docs/migration/docker-compose-architecture.md:81-145` and `docs/migration/docker-compose-architecture.md:436-490`.
- UDD does not own the `postgres:16` container. The `udd_app` role and `udd_prod` database are provisioned once via the SQL block at `docs/migration/docker-compose-architecture.md:383-409`. `udd_app` is non-superuser and has no privileges on any other tenant's database.
- The production environment file lives at `/srv/udd/.env.production`, mode `0640`, ownership `udd:docker`, per `docs/migration/docker-compose-architecture.md:492-513`.
- Supabase is not retained as a runtime dependency after cutover.
- Supabase RLS and `auth.uid()` are replaced by explicit app-side ownership predicates in Drizzle queries.
- `UDD_SECRET_KEY` is preserved unless a separate re-encryption plan is executed and verified.
- Exact data migration command is source-defined later by implementation; cutover requires it to exist before execution.
- Exact apex domain (`<apex>`), Forgejo registry hostname (`<forgejo-registry-host>`), registry owner namespace (`<owner>`), and Postgres superuser name (`<postgres-superuser>`) are operator-provided placeholders until filled at deployment time.
- `BETTER_AUTH_URL` equals the public HTTPS app origin (`https://udd.<apex>`) and must not point at localhost.
- `UDD_PREVIEW_HOST` is public or browser-routable for real users; remote users must not receive loopback preview URLs.
- Rollback requiring historical Supabase/Vercel availability must occur before those services are decommissioned.
- If target DB data or schema changes after cutover, rollback requires DB compatibility proof or restore from a matching backup.
- No real secrets, env values, DB URLs, provider keys, or auth secrets are recorded in this repository, docs, shell history, or chat transcripts.

### 15.1 Open questions

The following items were not fully resolved by `docs/migration/docker-compose-architecture.md` or `docs/migration/legion-deployment-runbook.md` and are recorded so they cannot be silently skipped at cutover.

- **Caddy reload mechanism.** §9 and §11 require an operator-applied reload of the caddy container after the `udd.<apex>` site block lands or is reverted. The exact reload command depends on how the operator's caddy container is launched and is not documented in either source-of-truth file (`docs/migration/legion-deployment-runbook.md:357-360`).
- **Caddyfile path inside the caddy container.** The site block in `docs/migration/docker-compose-architecture.md:436-475` assumes a Caddyfile path at `<caddy-config-mount>/Caddyfile` (`docs/migration/docker-compose-architecture.md:470-475`); the real path is operator-defined.
- **Cloudflared/caddy operational health surface.** §12 inspects logs and `docker ps`, but neither source document pins a specific health-status command for the operator's running cloudflared or caddy containers. The operator must define the surface used during the rollback window.
- **Migration command shape.** §5 step 4 and §8 step 7 leave `<migration-command-using-DATABASE_URL>` as a placeholder; the implementation branch will define whether migrations ship as a `docker compose run` step, a separate one-shot image, or an ad-hoc `docker run` invocation (`docs/migration/legion-deployment-runbook.md:340-349`).
- **Postgres superuser name.** Used in §5 step 3, §8 step 3, §11 full rollback, and §13 backup steps as `<postgres-superuser>`; the real value is set when the existing Postgres container was provisioned and is not specified by either source document.
- **Pre-existing wildcard `*.<apex>` cloudflared ingress.** §9 assumes the existing cloudflared container already routes `*.<apex>` to caddy, per `docs/migration/docker-compose-architecture.md:477-490`. If this assumption is wrong at cutover time, an operator-side cloudflared change is required before public traffic can reach UDD.
