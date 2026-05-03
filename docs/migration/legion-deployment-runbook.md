# Legion Deployment Runbook

> Status: documentation-only. This runbook describes how the operator deploys
> and operates UDD on the Legion host once the code-side prerequisites land.
> Every operational procedure here assumes the **Docker Compose** runtime
> defined in `docs/migration/docker-compose-architecture.md`. The previous
> systemd-native model has been removed.
>
> Architectural rationale lives in
> `docs/migration/docker-compose-architecture.md` and is referenced, not
> re-litigated, here.

## 1. Scope and target topology

This runbook is the operator-facing procedure for first deployment, routine
operations, and rollback of the UDD web application on the Legion host. It
covers no other environment.

The target topology is fully specified in
`docs/migration/docker-compose-architecture.md:12-49` (scope and non-goals),
`docs/migration/docker-compose-architecture.md:51-79` (existing host
topology), and `docs/migration/docker-compose-architecture.md:81-145`
(network topology). In short:

- The UDD web application runs as a single container, `udd-web`, pulled from
  the Forgejo container registry on Legion.
- Public HTTPS terminates at the existing `cloudflared` container, which
  forwards to the existing `caddy` container, which reverse-proxies to
  `udd-web:3000` over the user-defined Docker bridge `legion-internal`.
- Persistent state lives in the existing `postgres:16` container on the same
  host, in a dedicated database (`udd_prod`) owned by a dedicated role
  (`udd_app`).
- UDD publishes no host port. The container is reachable only via the
  bridge network.
- UDD is stateless. There are no bind mounts and no named volumes attached
  to `udd-web`.

This runbook does **not** specify or rebuild any of the above; it consumes
those decisions and turns them into operator commands.

## 2. Source baseline

Source-backed facts about the current `main` branch that constrain this
runbook.

- `next.config.mjs:1-17` does not contain `output: 'standalone'` or an
  `experimental.after` marker.
- Long-running server actions rely on `after()`; representative call
  sites at `app/actions/ai.ts:117`, `app/actions/ai.ts:249`, and
  `app/actions/run.ts:109`.
- Vercel Analytics is imported and rendered from `app/layout.tsx:3` and
  `app/layout.tsx:42`; `@vercel/analytics` is in `package.json:43`.
- Supabase env reads are still active (e.g., `lib/supabase/client.ts:9-10`,
  `lib/supabase/proxy.ts:15-16`); these will be removed by the cutover.
- Vercel AI Gateway assumptions remain at
  `lib/ai/providers/index.ts:2-14` and `lib/ai/service.ts:33-37`.
- Repository-level Docker scaffolding (`Dockerfile`, `.dockerignore`,
  `docker-compose.yml`, `app/api/health/route.ts`, Forgejo Actions
  workflow) is not present and is enumerated as §3 prerequisites.

## 3. Required application changes before deployment

These changes must land on `main` before this runbook is usable. They are
not made by this document.

The Docker-specific subset is enumerated in
`docs/migration/docker-compose-architecture.md:694-733`. In summary:

1. Add `output: 'standalone'` to `next.config.mjs` (current state at
   `next.config.mjs:1-17` does not have it; build-time requirement is
   recorded at `docs/migration/env-lockdown.md:54`).
2. Add an `app/api/health/route.ts` handler matching the contract at
   `docs/migration/docker-compose-architecture.md:518-571`. It must return
   `200` with `{ "ok": true }`, must not touch the database, and must not
   call any auth or AI surface.
3. Add a root `Dockerfile` matching
   `docs/migration/docker-compose-architecture.md:147-228`.
4. Add a `.dockerignore` excluding at minimum `node_modules`, `.next`,
   `.git`, and `.env*`.
5. Add a Forgejo Actions workflow that builds the image and pushes both
   `udd-web:<git-sha>` (immutable) and `udd-web:prod` (moving pointer)
   per `docs/migration/docker-compose-architecture.md:227-264`. Status:
   proposed, not yet implemented.

The broader application-level migration items (Vercel Analytics removal,
Supabase removal, Better Auth + Drizzle wiring, AI Gateway removal,
preview-host rewrite) are owned by the cutover runbook and the env-lockdown
doc, not by this runbook. They are listed at
`docs/migration/env-lockdown.md:38-48` (live variables that imply new
wiring) and `docs/migration/env-lockdown.md:27-36` (variables that must
be removed).

## 4. Host prerequisites

The following must already be true on Legion before this runbook is run.
None of them are owned by this document; they are owned by the operator.

- **Docker Engine and the Compose plugin** are installed on the host.
  `docker compose version` returns a current version.
- **The `legion-internal` user-defined Docker bridge network exists** as an
  external network. See
  `docs/migration/docker-compose-architecture.md:81-145` for its role.
  Verify with `docker network ls | grep legion-internal`.
- **The existing `caddy`, `cloudflared`, and `postgres:16` containers are
  running** and are members of `legion-internal`. The lifecycle of those
  containers is owned by the operator's existing stack, **not by this
  runbook**.
- **The Forgejo container registry on Legion is reachable** from the host
  for pulling images. `docker login <forgejo-registry-host>` succeeds.
- **A `udd` service user exists on the host with `docker` group
  membership.** This user owns `/srv/udd/.env.production` per
  `docs/migration/docker-compose-architecture.md:492-513`.

The host does **not** need Node, pnpm, the PostgreSQL client tools, or any
systemd unit file for the UDD app. Image builds happen in CI; database
operations happen via `docker exec` against the existing Postgres
container; the application runs entirely inside its container.

`cloudflared` and `caddy` are operated as containers by the existing host
stack. Their ingress and reverse-proxy contracts are described in §7;
their lifecycle is not in scope here.

## 5. Environment model

The application reads configuration from a single host file consumed by
Compose's `env_file:` directive. The authoritative variable list lives in
`docs/migration/env-lockdown.md:1-57`; this runbook does not duplicate it.
Specifically:

- Live variables in production: `docs/migration/env-lockdown.md:38-48`.
- Retired variables that must not appear: `docs/migration/env-lockdown.md:27-36`.
- Variables that survive unchanged from the current source:
  `docs/migration/env-lockdown.md:18-25`.

### 5.1 File location and ownership

Per `docs/migration/docker-compose-architecture.md:492-513`:

| Property | Value                                |
| -------- | ------------------------------------ |
| Path     | `/srv/udd/.env.production`           |
| Mode     | `0640`                               |
| Owner    | `udd` (user)                         |
| Group    | `docker` (group)                     |
| Read by  | The `udd-web` container via `env_file:` |

The `PATH=` variable that appeared in the previous, systemd-shaped version
of this runbook is no longer required: container images bake a fixed
`PATH` at build time, so the env file does not need to set it.

### 5.2 Rules

- `BETTER_AUTH_URL` equals the public HTTPS origin served through Cloudflare
  Tunnel: `https://udd.<apex>`. See
  `docs/migration/env-lockdown.md:43`.
- `DATABASE_URL` resolves the database host as `postgres` (Docker DNS on
  `legion-internal`). See `docs/migration/env-lockdown.md:44` for the
  canonical shape.
- `UDD_PREVIEW_HOST` is the operator-provided public or routable preview
  origin. See `docs/migration/env-lockdown.md:45`.
- `NODE_ENV` is fixed to `production` for the deployed app process.
- Real secret values never appear in source control, in this runbook, in
  shell history, or in chat transcripts.

## 6. Image build and registry

The host does not build the image. Building happens in CI and the host
**pulls** by SHA-pinned tag.

- Dockerfile shape: `docs/migration/docker-compose-architecture.md:147-228`.
- Registry path and tagging contract:
  `docs/migration/docker-compose-architecture.md:227-264`.

In summary:

- Multi-stage build on `node:lts-alpine`; the runtime stage contains only
  the Next.js standalone output, `.next/static/`, and `public/`. No source,
  no dev dependencies, no `pnpm`.
- Each successful CI build produces and pushes **two tags atomically**:
  - `<forgejo-registry-host>/<owner>/udd-web:<git-sha>` — immutable.
  - `<forgejo-registry-host>/<owner>/udd-web:prod` — moving pointer for
    humans only; never referenced in compose.
- `latest` is forbidden as an image tag in compose.
- The `docker-compose.yml` on Legion always pins to `<git-sha>`. Rollback
  is a one-line edit (see §12).

The Forgejo Actions workflow that produces these tags is one of the §3
prerequisites; until it lands, builds happen out of band on a developer
workstation that pushes to the same registry.

## 7. Cloudflare Tunnel model

This runbook describes only the **contract** the UDD stack relies on. The
cloudflared container itself is owned by the operator's existing stack;
its config files, tunnel credentials, and lifecycle are out of scope here.

Required contract:

- The hostname `udd.<apex>` resolves through the existing cloudflared
  container.
- Cloudflared forwards `udd.<apex>` traffic to the existing caddy container
  on `legion-internal`. The assumed mechanism is the wildcard ingress rule
  `*.<apex> → caddy` already documented in
  `docs/migration/docker-compose-architecture.md:477-490`. If that
  wildcard rule is absent, the operator adds an explicit `udd.<apex>`
  ingress entry to cloudflared's config; this runbook does not specify
  that change.
- Caddy reverse-proxies `udd.<apex>` to `udd-web:3000` over
  `legion-internal`. The site-block contract is documented at
  `docs/migration/docker-compose-architecture.md:436-475`. The actual
  Caddyfile lives in the caddy container's mounted config and is operator-
  owned; this runbook does not include the snippet.
- TLS terminates at Caddy (downstream of cloudflared). The hop from Caddy
  to `udd-web:3000` is plain HTTP inside the bridge network, which is
  correct for a layer-7 reverse proxy on a private network.

The operator must ensure the reverse-proxy rule exists in caddy before
attempting public verification in §10.

## 8. Database model

UDD reuses the existing `postgres:16` container on Legion. UDD does not
manage that container. UDD owns exactly one role and one database inside
it: role `udd_app`, database `udd_prod`. Provisioning is a one-time
operation governed by the SQL block at
`docs/migration/docker-compose-architecture.md:381-434` (specifically the
`CREATE ROLE` / `CREATE DATABASE` block in §7.1 of that document).

Required model after migration:

- Drizzle and postgresjs use `DATABASE_URL` for app queries and migrations.
- Migrations are explicit, reviewed, and run as a deploy step before
  starting code that depends on them.
- Better Auth owns app auth tables in the same PostgreSQL database. App
  tables reference Better Auth user IDs, not `auth.users`.
- Supabase RLS policies and `auth.uid()` checks are removed from the
  post-migration production schema.
- A database backup is taken before every schema migration and before the
  first production cutover.

The current SQL baseline is Supabase-shaped (see
`scripts/001_init_schema.sql:21-35` and `scripts/005_user_secrets.sql:26-40`)
and is not the target production schema.

## 9. Secrets and backup model

### 9.1 Secrets

- Store the production environment file at `/srv/udd/.env.production`,
  ownership `udd:docker`, mode `0640`, per
  `docs/migration/docker-compose-architecture.md:492-513`.
- Never commit env files or real secret values to the repository.
- `BETTER_AUTH_SECRET` signs auth/session material; rotation can invalidate
  existing sessions unless a staged rotation mechanism is implemented.
- `UDD_SECRET_KEY` protects app-managed credential encryption (see
  `docs/migration/env-lockdown.md:14`); rotating it without re-encrypting
  stored secrets makes existing encrypted provider keys unreadable.
- `UDD_DEFAULT_AI_API_KEY` may be a real provider secret for hosted
  providers; treat it as secret even when the local Ollama placeholder is
  non-sensitive (see `docs/migration/env-lockdown.md:48`).

### 9.2 Backups

Database backups run via `docker exec` against the existing Postgres
container. Command shape only — the real superuser name is operator-
provided:

```sh
docker exec postgres pg_dump \
    -U <postgres-superuser> \
    -d udd_prod \
    --format=custom \
    --file=/var/lib/postgresql/backups/udd-before-<release-id>.dump
```

Then copy the dump off the container into operator-managed backup storage:

```sh
docker cp postgres:/var/lib/postgresql/backups/udd-before-<release-id>.dump <backup-dir>/
```

The exact backup destination, retention period, encryption method, and
restore-rehearsal cadence are operator-owned (see §15).

There is no in-container persistence outside the database; the application
container is stateless per
`docs/migration/docker-compose-architecture.md:81-145` and the explicit
non-feature note in §6.3 of that document.

## 10. First deployment procedure

Concrete numbered steps for the operator on Legion. Each step is
runtime-Docker; no `pnpm`, no `node`, no `systemctl` for the UDD app.

1. **Preflight: confirm host state.**

   ```sh
   docker network ls | grep legion-internal
   docker ps --format '{{.Names}}' | grep -E '^(caddy|cloudflared|postgres)$'
   docker login <forgejo-registry-host>
   ```

2. **Provision the application database role and database** (run once,
   ever — skip if already done):

   Open a `psql` shell inside the existing Postgres container:

   ```sh
   docker exec -it postgres psql -U <postgres-superuser>
   ```

   Then run the SQL block from
   `docs/migration/docker-compose-architecture.md:381-434` (§7.1). It
   creates the `udd_app` role with no superuser/createdb/createrole, the
   `udd_prod` database owned by `udd_app`, and the `pgcrypto` extension.

3. **Install the production environment file** on the host:

   ```sh
   install -m 0640 -o udd -g docker \
       <prepared-env-file> \
       /srv/udd/.env.production
   ```

4. **Place the compose file** at the canonical path — filesystem-as-source-
   of-truth per `docs/migration/docker-compose-architecture.md:608-645`:

   ```sh
   install -m 0644 \
       <prepared-compose> \
       /srv/udd/docker-compose.yml
   ```

5. **Pull the SHA-pinned image:**

   ```sh
   docker compose -f /srv/udd/docker-compose.yml pull udd-web
   ```

6. **Run application database migrations.** The exact command is provided
   by the implementation branch; until then it remains a placeholder:

   ```sh
   <migration-command-using-DATABASE_URL>
   ```

   The migration command must read `DATABASE_URL` from the same env file
   used by the app (or be invoked via a one-shot Docker container that
   mounts `/srv/udd/.env.production`).

7. **Bring the stack up:**

   ```sh
   docker compose -f /srv/udd/docker-compose.yml up -d udd-web
   ```

8. **Caddy reverse-proxy rule.** Confirm caddy already routes `udd.<apex>`
   to `udd-web:3000` per §7. If the rule has just been added by the
   operator, reload caddy (the exact reload mechanism depends on how the
   caddy container is launched and is operator-owned).

9. **Verify locally** on the host:

   ```sh
   docker compose -f /srv/udd/docker-compose.yml ps
   docker compose -f /srv/udd/docker-compose.yml logs --tail=200 udd-web
   docker exec udd-web wget -qO- http://localhost:3000/api/health
   ```

   The `ps` output must show `udd-web` as `running` and healthy; the
   logs must show the Next standalone server bound to `0.0.0.0:3000`; the
   health probe must return `{"ok":true}` with status 200.

10. **Verify publicly** through Cloudflare Tunnel:

    ```sh
    curl -fsS https://udd.<apex>/
    curl -fsS https://udd.<apex>/auth/login
    ```

11. **Run the smoke list in §13** before declaring deployment complete.

## 11. Routine operations

All routine operations use `docker compose` against
`/srv/udd/docker-compose.yml`. The host runs only Docker.

### 11.1 Deploy update (new image SHA)

```sh
# 1. Edit /srv/udd/docker-compose.yml in place: bump the image tag's
#    <git-sha> to the new release SHA. Filesystem-as-source-of-truth.
# 2. Pull and recreate.
docker compose -f /srv/udd/docker-compose.yml pull udd-web
docker compose -f /srv/udd/docker-compose.yml up -d udd-web
docker compose -f /srv/udd/docker-compose.yml ps
```

If the new release ships a database migration, run §10 step 6 between
the pull and the `up -d`.

### 11.2 Log inspection

```sh
# Application logs (last 200 lines, follow):
docker compose -f /srv/udd/docker-compose.yml logs -f --tail=200 udd-web

# Daemon-level inspection (Docker engine itself, not the UDD app):
journalctl -u docker -n 200 --no-pager
```

The `[v0]` server-diagnostic prefix used in application code remains the
in-process convention.

### 11.3 Environment file update

```sh
install -m 0640 -o udd -g docker \
    <prepared-env-file> \
    /srv/udd/.env.production
docker compose -f /srv/udd/docker-compose.yml up -d --force-recreate udd-web
```

`env_file:` is read at container start, so a recreate is required for new
values to take effect.

### 11.4 Migration-only operation

```sh
# Backup first.
docker exec postgres pg_dump -U <postgres-superuser> -d udd_prod \
    --format=custom \
    --file=/var/lib/postgresql/backups/udd-before-migration-<migration-id>.dump

# Run the migration (placeholder until implementation branch defines it).
<migration-command-using-DATABASE_URL>

# Recreate the app so any new code paths in the running image pick up the
# new schema. Skip this if the running image already contains code that
# expects the new schema.
docker compose -f /srv/udd/docker-compose.yml up -d --force-recreate udd-web
```

### 11.5 Backup operation

```sh
docker exec postgres pg_dump -U <postgres-superuser> -d udd_prod \
    --format=custom \
    --file=/var/lib/postgresql/backups/udd-<timestamp>.dump
docker cp postgres:/var/lib/postgresql/backups/udd-<timestamp>.dump <backup-dir>/
install -m 0600 /srv/udd/.env.production <encrypted-env-backup-path>
```

## 12. Rollback procedure

Application rollback is governed by the contract at
`docs/migration/docker-compose-architecture.md:647-692`. Because the
compose file pins to `<git-sha>` and the application is stateless,
rollback is a one-line edit followed by a recreate.

### 12.1 Rollback inputs

- Previous git SHA still present in the Forgejo registry.
- Previous `/srv/udd/.env.production`, if env values changed.
- Pre-migration database backup (from §11.4 or §11.5), if a migration
  ran.

### 12.2 Procedure

1. **Identify the previous SHA.** In order of preference:
   - Forgejo registry image list for `<forgejo-registry-host>/<owner>/udd-web`
     (the SHA tags are rollback candidates; the moving `prod` tag is not).
   - `docker images <forgejo-registry-host>/<owner>/udd-web` on the host.
   - Git history of `main`.

2. **Edit `/srv/udd/docker-compose.yml`** in place, replacing the failed
   `<git-sha>` with the previous one. Diff shape:

   ```diff
   -    image: <forgejo-registry-host>/<owner>/udd-web:<failed-sha>
   +    image: <forgejo-registry-host>/<owner>/udd-web:<previous-release-commit>
   ```

3. **Restore the previous env file**, if it changed:

   ```sh
   install -m 0640 -o udd -g docker \
       <previous-env-file> \
       /srv/udd/.env.production
   ```

4. **Pull and recreate:**

   ```sh
   docker compose -f /srv/udd/docker-compose.yml pull udd-web
   docker compose -f /srv/udd/docker-compose.yml up -d udd-web
   docker compose -f /srv/udd/docker-compose.yml ps
   ```

5. **Verify** with §13.

No source-tree, build-host, or service-manager steps are required: the
image tag in the compose file is the only artifact that needs to change.

### 12.3 Database caveat

If the failed release ran schema migrations, code rollback alone may be
unsafe:

- Roll back the database only with an explicit restore plan and a backup
  taken before the migration.
- Do not run old code against a newer incompatible schema.
- Schema-aware rollback is governed by the cutover runbook's rollback
  procedure, not by this runbook.

### 12.4 Unsafe rollback conditions

- No pre-migration database backup exists.
- The new release wrote data that the old release cannot read.
- Auth or encryption secrets changed without a compatible rotation plan.

## 13. Health checks and smoke tests

### 13.1 Local checks (on the Legion host)

```sh
docker compose -f /srv/udd/docker-compose.yml ps
docker exec udd-web wget -qO- http://localhost:3000/api/health
docker exec udd-web wget -qO- http://localhost:3000/auth/login >/dev/null
```

The `ps` output must show `udd-web` as `running` and `healthy`. The
healthcheck contract is documented at
`docs/migration/docker-compose-architecture.md:515-571`.

### 13.2 Public checks through Cloudflare

```sh
curl -fsS https://udd.<apex>/
curl -fsS https://udd.<apex>/auth/login
curl -fsS https://udd.<apex>/api/health
```

### 13.3 Browser smoke paths

- `/` loads without a server error.
- `/auth/login` loads and can start the Better Auth email/password sign-in
  flow.
- `/projects` redirects unauthenticated users to login and loads for an
  authenticated user.
- `/projects/new` loads for an authenticated user.
- `/projects/[id]` loads an owned project for an authenticated user.
- `/projects/[id]/run` starts or displays runtime state without fabricated
  preview URLs.
- `/settings` loads provider/account settings without exposing secrets.

## 14. Verification checklist

### 14.1 Source-side checks (runtime-agnostic)

```sh
rg -n "output: ['\"]standalone['\"]|experimental:.*after|after: true" next.config.mjs
rg -n "@vercel/analytics|<Analytics|AI_GATEWAY_API_KEY|process\.env\.VERCEL" app lib components package.json
rg -n "NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL" app lib components middleware.ts package.json
rg -n "BETTER_AUTH_SECRET|BETTER_AUTH_URL|DATABASE_URL|UDD_PREVIEW_HOST|UDD_DEFAULT_AI_BASE_URL|UDD_DEFAULT_AI_MODEL|UDD_DEFAULT_AI_API_KEY|UDD_SECRET_KEY|UDD_AI_PROVIDER" app lib drizzle.config.ts
rg -n "auth\.users|auth\.uid\(" scripts drizzle lib/db
```

### 14.2 Image-side checks

```sh
docker images | grep udd-web
docker manifest inspect <forgejo-registry-host>/<owner>/udd-web:<git-sha>
docker compose -f /srv/udd/docker-compose.yml config
```

`docker compose ... config` validates the compose file shape and
substitutes any environment values without bringing the stack up.

### 14.3 Container status checks

```sh
docker compose -f /srv/udd/docker-compose.yml ps
docker compose -f /srv/udd/docker-compose.yml logs --tail=100 udd-web
docker inspect --format '{{ .State.Health.Status }}' udd-web
```

### 14.4 Environment verification

Run against a redacted env inventory rather than printing real values:

```sh
grep -E '^(NODE_ENV|BETTER_AUTH_SECRET|BETTER_AUTH_URL|DATABASE_URL|UDD_PREVIEW_HOST|UDD_DEFAULT_AI_BASE_URL|UDD_DEFAULT_AI_MODEL|UDD_DEFAULT_AI_API_KEY|UDD_SECRET_KEY|UDD_AI_PROVIDER)=' <redacted-env-inventory>
grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL|AI_GATEWAY_API_KEY|VERCEL|PATH)=' <redacted-env-inventory> && exit 1 || true
```

`PATH=` is now in the second grep (must-not-appear) because the container
image bakes its own `PATH`.

## 15. Locked assumptions

- Legion has Docker Engine and the Compose plugin installed.
- The `legion-internal` external Docker network exists; existing
  `caddy`, `cloudflared`, and `postgres:16` containers are joined to it.
- The Forgejo container registry on Legion is the canonical image store
  for UDD, addressed as `<forgejo-registry-host>/<owner>/udd-web`.
- `BETTER_AUTH_URL` equals `https://udd.<apex>`. Cloudflared has either
  a wildcard `*.<apex>` ingress rule or an explicit `udd.<apex>` rule
  routing to caddy.
- `UDD_PREVIEW_HOST` is a separate operator-provided public origin.
- The application migration command remains a placeholder
  (`<migration-command-using-DATABASE_URL>`) until the implementation
  branch lands.
- Backup destination, retention, restore rehearsal, and encryption are
  operator-defined.
- `<forgejo-registry-host>`, `<owner>`, `<caddy-config-mount>`,
  `<postgres-superuser>`, and `<apex>` are operator-provided Legion
  values.
- Final Better Auth table names and Drizzle migration paths must be
  verified against the generated schema before first deploy.
- Preview traffic must not be exposed through Cloudflare until the
  source-backed routing mechanism is confirmed.

This runbook makes no assumptions about systemd units, host-side Node
or pnpm versions, or host-side PostgreSQL client tools.

### 15.1 Open questions

Items not resolved by `docs/migration/docker-compose-architecture.md`
and recorded so they cannot be silently skipped at cutover.

- **Caddy reload mechanism.** §7 and
  `docs/migration/docker-compose-architecture.md:436-475` specify the
  reverse-proxy rule but not the operator-specific reload command.
- **Migration command shape.** §10 step 6 leaves
  `<migration-command-using-DATABASE_URL>` as a placeholder; the
  implementation branch will define whether migrations ship as a
  `docker compose run` step, a separate one-shot image, or an ad-hoc
  `docker run` invocation.
- **Backup destination and retention.** §9.2 shows command shape; the
  destination filesystem, retention window, restore rehearsal cadence,
  and encryption method are still operator-defined.
- **Postgres superuser name.** Used in §10 step 2, §9.2, and §11.4 as
  `<postgres-superuser>`; not specified by either the compose-architecture
  doc or this runbook.

