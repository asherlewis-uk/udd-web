# Legion Deployment Runbook

## 1. Scope and target topology

This runbook defines the intended first self-hosted deployment path for UDD on the host named **Legion**. It is documentation-only and describes a future deployment shape; it does not assert that the current `main` branch is deployable in this shape yet.

Target topology:

- **Host:** Legion runs the UDD web process and the local runtime/preview process helpers.
- **Ingress:** Cloudflare Tunnel terminates public HTTPS and forwards to the local UDD app on Legion.
- **App runtime:** Next.js self-hosted Node runtime, using a standalone build artifact once `next.config.mjs` is updated.
- **Database:** PostgreSQL is reached through `DATABASE_URL`; Drizzle owns app queries and migrations after the migration work lands.
- **Auth:** Better Auth owns app session tables in the application database, replacing Supabase Auth/RLS assumptions.
- **AI:** AI provider configuration is direct and environment-driven through UDD default provider variables, not Vercel AI Gateway credentials.
- **Preview URLs:** Saved preview URLs must be based on a configurable public or routable preview host, not browser-local loopback.

The recommended initial process model is **systemd running the Next standalone server**. Docker can be considered later as a hardening layer after the systemd path is proven.

## 2. Source baseline

Current source-backed facts to account for before deployment:

- Package scripts are `dev`, `build`, `start`, `lint`, and `typecheck` in `package.json:5-10`.
- Current dependencies include `@supabase/ssr`, `@vercel/analytics`, and `ai` in `package.json:42-44`; the package manifest shown in `package.json:12-75` does not yet include Better Auth or Drizzle packages.
- `next.config.mjs` currently contains `typescript.ignoreBuildErrors: false` and `images.unoptimized: true` only; there is no `output: 'standalone'` or `experimental.after` marker in the config object at `next.config.mjs:2-15`.
- Long-running actions currently call `after()`: examples include `app/actions/ai.ts:117`, `app/actions/ai.ts:145`, `app/actions/ai.ts:249`, `app/actions/ai.ts:377`, `app/actions/run.ts:19`, and `app/actions/run.ts:109`.
- The runtime preview URL is hardcoded to loopback at `lib/runtime/local-preview.ts:69`, emits copy that says `127.0.0.1` at `lib/runtime/local-preview.ts:129`, and binds child preview processes to `127.0.0.1` at `lib/runtime/local-preview.ts:466`, `lib/runtime/local-preview.ts:547`, and `lib/runtime/local-preview.ts:665`. This is correct for local binding but wrong for URLs shown to remote browsers through Cloudflare.
- Vercel Analytics is imported and rendered from `app/layout.tsx:3` and `app/layout.tsx:42`; `@vercel/analytics` is also present in `package.json:43`.
- Supabase environment reads remain active: `lib/supabase/client.ts:9-10`, `lib/supabase/server.ts:8-9`, `lib/supabase/proxy.ts:15-16`, `lib/supabase/service.ts:5-6`, and `components/auth/sign-up-form.tsx:35`.
- Vercel AI Gateway assumptions remain active: provider comments and model strings are in `lib/ai/providers/index.ts:2-14` and `lib/ai/providers/index.ts:25-32`; gateway credential detection reads `AI_GATEWAY_API_KEY` or `VERCEL` at `lib/ai/providers/server.ts:78-79`; user-facing gateway failure copy is in `lib/ai/service.ts:33-37`.
- Current SQL scripts still assume Supabase Auth/RLS: `scripts/001_init_schema.sql:3`, `scripts/001_init_schema.sql:14`, `scripts/001_init_schema.sql:21-35`, `scripts/001_init_schema.sql:43`, `scripts/001_init_schema.sql:59-73`, and `scripts/005_user_secrets.sql:9`, `scripts/005_user_secrets.sql:26-40`.
- Repository-level deploy scaffolding was not found by the read-only audit used for this runbook: no root `Dockerfile`, `docker-compose.yml`, `docker-compose.yaml`, `vercel.json`, `.env.example`, `README.md`, `README`, or `.github/workflows` directory. No app-owned systemd unit or cloudflared config was found outside dependency files.

## 3. Required application changes before deployment

These changes are required before using this runbook for a real Legion production deployment. They are **not implemented by this document**.

1. Add Next standalone output to `next.config.mjs`:
   - Future marker: `output: 'standalone'`.
   - Current baseline: absent from `next.config.mjs:2-15`.
2. Enable self-hosted `after()` support according to the migration spec:
   - Future marker: `experimental: { after: true }`.
   - Current callers rely on `after()` in `app/actions/ai.ts` and `app/actions/run.ts`.
3. Remove Vercel Analytics:
   - Delete the import/render path shown at `app/layout.tsx:3` and `app/layout.tsx:42`.
   - Remove `@vercel/analytics` from `package.json` during the dependency migration.
4. Replace hardcoded preview URL host construction with `UDD_PREVIEW_HOST`:
   - Keep preview processes bound to localhost unless a later security review changes that.
   - Only the externally presented URL should use `UDD_PREVIEW_HOST`.
5. Remove Supabase env/client dependency:
   - Replace Supabase server, browser, proxy, and service clients with Better Auth plus Drizzle/Postgres paths.
   - Remove the Supabase redirect env read in signup.
6. Add Better Auth and Drizzle runtime wiring:
   - Add `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `DATABASE_URL` consumers.
   - Add app-owned Better Auth tables and Drizzle schema/migrations as specified in `docs/migration/drizzle-schema.md` and `docs/migration/better-auth-integration.md`.
7. Replace Vercel AI Gateway env assumptions:
   - Use direct configurable provider vars: `UDD_DEFAULT_AI_BASE_URL`, `UDD_DEFAULT_AI_MODEL`, `UDD_DEFAULT_AI_API_KEY`, and `UDD_AI_PROVIDER`.
   - Remove `AI_GATEWAY_API_KEY` and `VERCEL` as application-level provider readiness inputs.

## 4. Environment model

Intended Legion production env file shape, with placeholder values only:

```sh
NODE_ENV=production
PATH=/usr/local/bin:/usr/bin:/bin

BETTER_AUTH_SECRET=<generated-auth-secret>
BETTER_AUTH_URL=https://<udd-public-hostname>
DATABASE_URL=postgresql://<user>:<password>@<postgres-host>:5432/<database>

UDD_PREVIEW_HOST=https://<preview-public-hostname-or-routable-origin>
UDD_SECRET_KEY=<existing-udd-encryption-key>
UDD_AI_PROVIDER=<default-provider-id>
UDD_DEFAULT_AI_BASE_URL=http://localhost:11434/v1
UDD_DEFAULT_AI_MODEL=<model-id>
UDD_DEFAULT_AI_API_KEY=<provider-api-key-or-local-placeholder>
```

Deprecated or explicitly excluded from Legion production after the migration:

```sh
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL=
AI_GATEWAY_API_KEY=
VERCEL=
```

Rules:

- Do not store real secret values in source control, docs, shell history, or chat transcripts.
- `BETTER_AUTH_URL` must equal the public HTTPS origin served through Cloudflare Tunnel.
- `UDD_PREVIEW_HOST` must be the public or otherwise browser-routable preview origin users can actually load.
- `PATH` must include the Node and package-manager binaries used by the systemd service.
- `NODE_ENV` is fixed to `production` for the deployed app process.

## 5. Build artifact model

Current state: `next.config.mjs` does not yet produce a standalone artifact. The following model applies after the required application changes land.

Intended build sequence:

```sh
cd <repo-root>
pnpm install --frozen-lockfile
pnpm build
```

Expected artifact layout after `output: 'standalone'`:

- `.next/standalone/` contains the deployable Node server and traced server dependencies.
- `.next/static/` contains static Next build assets and must be copied or kept beside the standalone server according to Next standalone deployment rules.
- `public/` must be deployed beside the server when the repository contains public assets.

Expected launch command template:

```sh
cd <repo-root>
NODE_ENV=production HOSTNAME=127.0.0.1 PORT=3000 node .next/standalone/server.js
```

The current `pnpm start` script runs `next start` (`package.json:8`). After standalone output lands, production operations should prefer the standalone `server.js` launch path over `next start`.

## 6. Process model

Recommended initial model: one systemd unit runs the Next standalone server as a non-root service user. This is a documentation template only.

Template unit:

```ini
[Unit]
Description=UDD web app
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=<legion-service-user>
Group=<legion-service-group>
WorkingDirectory=<repo-root>
EnvironmentFile=<absolute-path-to-env-production>
Environment=NODE_ENV=production
Environment=HOSTNAME=127.0.0.1
Environment=PORT=3000
ExecStart=/usr/bin/env node .next/standalone/server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
```

Operational expectations:

- The service listens only on `127.0.0.1:3000` unless a later networking review approves another bind address.
- Cloudflare Tunnel is the public ingress path.
- The service user must be able to read the build artifact and env file, but the env file should not be world-readable.
- Runtime preview child processes remain bounded by the application runtime controls.

## 7. Cloudflare Tunnel model

Cloudflare Tunnel provides public HTTPS termination and forwards to the local app listener on Legion.

Template tunnel ingress snippet:

```yaml
tunnel: <cloudflare-tunnel-id>
credentials-file: <absolute-path-to-cloudflared-credentials-json>

ingress:
  - hostname: <udd-public-hostname>
    service: http://127.0.0.1:3000
  - hostname: <preview-public-hostname>
    service: http://127.0.0.1:<preview-port-or-router-port>
  - service: http_status:404
```

Model requirements:

- Public app users browse to `https://<udd-public-hostname>`.
- `BETTER_AUTH_URL` equals `https://<udd-public-hostname>` exactly.
- The local app service remains `http://127.0.0.1:3000` behind the tunnel.
- `UDD_PREVIEW_HOST` uses the public or routable preview origin documented for runtime previews.
- If preview traffic is routed through Cloudflare, the preview route must point at the real preview router or bounded local preview port architecture implemented by source at that time.

Cloudflared service template, if managed by systemd:

```ini
[Unit]
Description=Cloudflare Tunnel for UDD
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=<cloudflared-user>
ExecStart=/usr/bin/cloudflared tunnel --config <absolute-path-to-cloudflared-config.yml> run
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 8. Database model

Legion production uses PostgreSQL on or near Legion, reached with `DATABASE_URL`.

Required model after migration:

- Drizzle and postgresjs use `DATABASE_URL` for app queries and migrations.
- Migrations are explicit, reviewed, and run as a deploy step before starting code that depends on them.
- Better Auth owns app auth tables in the same PostgreSQL database unless a future migration explicitly separates them.
- App tables reference Better Auth user IDs, not `auth.users`.
- Supabase RLS policies and `auth.uid()` checks do not remain in the post-migration production schema.
- A database backup is taken before every schema migration and before the first production cutover.

The current SQL baseline is Supabase-shaped, as shown by `auth.users` references and RLS policies in `scripts/001_init_schema.sql` and `scripts/005_user_secrets.sql`; those scripts are not the target production schema after the migration.

## 9. Secrets and backup model

Secrets:

- Store the Legion production environment file outside the repository, for example `<secure-config-dir>/udd.env.production`.
- Set ownership to the service user or root-controlled deployment group.
- Set permissions to `0640` or stricter, depending on the service user model.
- Never commit env files or real secret values.

Secret caveats:

- `BETTER_AUTH_SECRET` signs auth/session material. Rotation can invalidate or force renewal of existing sessions unless a staged rotation mechanism is implemented.
- `UDD_SECRET_KEY` protects app-managed credential encryption. Rotating it without re-encrypting stored secrets can make existing encrypted provider keys unreadable.
- `UDD_DEFAULT_AI_API_KEY` may be a real provider secret for hosted providers. Treat it as secret even when the local Ollama placeholder is non-sensitive.

Backups:

- Take a PostgreSQL logical backup before first deploy, before each migration, and before rollback attempts involving schema changes.
- Back up the production env file separately in an encrypted operator-controlled store.
- Capture the previous git commit, build artifact, env file version, migration version, and Cloudflare Tunnel config version for rollback snapshots.

## 10. First deployment procedure

This procedure is intended for the future migration-complete branch, not the current baseline.

1. Preflight source and host state:

   ```sh
   cd <repo-root>
   git status --short
   git rev-parse --short HEAD
   node --version
   pnpm --version
   systemctl status <udd-service-name>
   systemctl status <cloudflared-service-name>
   ```

2. Check out or update the target release:

   ```sh
   cd <repo-root>
   git fetch --all --prune
   git checkout <release-commit-or-branch>
   git reset --hard <release-commit>
   ```

3. Install dependencies without changing the lockfile:

   ```sh
   pnpm install --frozen-lockfile
   ```

4. Build the app:

   ```sh
   pnpm build
   test -f .next/standalone/server.js
   test -d .next/static
   ```

5. Prepare or update the production env file:

   ```sh
   install -m 0640 -o <service-user> -g <service-group> <prepared-env-file> <absolute-path-to-env-production>
   ```

6. Back up the database before migrations:

   ```sh
   pg_dump "$DATABASE_URL" --format=custom --file=<backup-dir>/udd-before-<release-id>.dump
   ```

7. Run migrations with the migration command chosen by the implementation branch:

   ```sh
   <migration-command-using-DATABASE_URL>
   ```

8. Start or restart the app service:

   ```sh
   systemctl daemon-reload
   systemctl enable <udd-service-name>
   systemctl restart <udd-service-name>
   systemctl status <udd-service-name> --no-pager
   ```

9. Ensure Cloudflare Tunnel is running:

   ```sh
   systemctl enable <cloudflared-service-name>
   systemctl restart <cloudflared-service-name>
   systemctl status <cloudflared-service-name> --no-pager
   ```

10. Verify local and public health:

   ```sh
   curl -fsS http://127.0.0.1:3000/
   curl -fsS https://<udd-public-hostname>/
   curl -fsS https://<udd-public-hostname>/auth/login
   ```

11. Run the smoke list in Section 13 before declaring the deployment complete.

## 11. Routine operations

Routine deploy update:

```sh
cd <repo-root>
git fetch --all --prune
git checkout <release-commit-or-branch>
git reset --hard <release-commit>
pnpm install --frozen-lockfile
pnpm build
pg_dump "$DATABASE_URL" --format=custom --file=<backup-dir>/udd-before-<release-id>.dump
<migration-command-using-DATABASE_URL>
systemctl restart <udd-service-name>
systemctl status <udd-service-name> --no-pager
```

Logs and status:

```sh
journalctl -u <udd-service-name> -n 200 --no-pager
journalctl -u <cloudflared-service-name> -n 200 --no-pager
systemctl status <udd-service-name> --no-pager
systemctl status <cloudflared-service-name> --no-pager
```

Backup operation:

```sh
pg_dump "$DATABASE_URL" --format=custom --file=<backup-dir>/udd-<timestamp>.dump
install -m 0600 <absolute-path-to-env-production> <encrypted-env-backup-path>
```

Env update operation:

```sh
install -m 0640 -o <service-user> -g <service-group> <prepared-env-file> <absolute-path-to-env-production>
systemctl restart <udd-service-name>
```

Migration-only operation:

```sh
pg_dump "$DATABASE_URL" --format=custom --file=<backup-dir>/udd-before-migration-<migration-id>.dump
<migration-command-using-DATABASE_URL>
systemctl restart <udd-service-name>
```

## 12. Rollback procedure

Rollback inputs:

- Previous git commit or build artifact identifier.
- Previous env file version.
- Previous Cloudflare Tunnel config version, if ingress changed.
- Database backup from before the migration or deploy.
- Migration list applied during the failed deployment.

Procedure:

```sh
cd <repo-root>
git checkout <previous-release-commit>
pnpm install --frozen-lockfile
pnpm build
install -m 0640 -o <service-user> -g <service-group> <previous-env-file> <absolute-path-to-env-production>
systemctl restart <udd-service-name>
systemctl status <udd-service-name> --no-pager
```

Database caveat:

- If the failed release ran schema migrations, code rollback alone may be unsafe.
- Roll back the database only with an explicit restore plan and a backup taken before the migration.
- Do not run old code against a newer incompatible schema.

Tunnel rollback:

```sh
install -m 0644 <previous-cloudflared-config> <absolute-path-to-cloudflared-config.yml>
systemctl restart <cloudflared-service-name>
systemctl status <cloudflared-service-name> --no-pager
```

Unsafe rollback conditions:

- No pre-migration database backup exists.
- The new release wrote data that the old release cannot read.
- Auth or encryption secrets changed without a compatible rotation plan.

## 13. Health checks and smoke tests

Local checks from Legion:

```sh
curl -fsS http://127.0.0.1:3000/
curl -fsS http://127.0.0.1:3000/auth/login
```

Public checks through Cloudflare:

```sh
curl -fsS https://<udd-public-hostname>/
curl -fsS https://<udd-public-hostname>/auth/login
```

Browser smoke paths:

- `/` loads without a server error.
- `/auth/login` loads and can start the Better Auth email/password sign-in flow.
- `/projects` redirects unauthenticated users to login and loads for an authenticated user.
- `/projects/new` loads for an authenticated user.
- `/projects/[id]` loads an owned project for an authenticated user.
- `/projects/[id]/run` starts or displays runtime state without fabricated preview URLs.
- `/settings` loads provider/account settings without exposing secrets.

Post-deploy checks:

- Confirm the app presents the public HTTPS origin in auth redirects.
- Confirm generated preview URLs use `UDD_PREVIEW_HOST` and are reachable from a separate client browser.
- Confirm logs do not claim deployment, live preview, provider use, or task completion unless the real operation succeeded.

## 14. Verification checklist

Mechanical source checks for the implementation branch:

```sh
rg -n "output: ['\"]standalone['\"]|experimental:.*after|after: true" next.config.mjs
rg -n "@vercel/analytics|<Analytics|AI_GATEWAY_API_KEY|process\.env\.VERCEL" app lib components package.json
rg -n "NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL" app lib components middleware.ts package.json
rg -n "BETTER_AUTH_SECRET|BETTER_AUTH_URL|DATABASE_URL|UDD_PREVIEW_HOST|UDD_DEFAULT_AI_BASE_URL|UDD_DEFAULT_AI_MODEL|UDD_DEFAULT_AI_API_KEY|UDD_SECRET_KEY|UDD_AI_PROVIDER" app lib drizzle.config.ts
rg -n "auth\.users|auth\.uid\(" scripts drizzle lib/db
```

Expected future build checks:

```sh
pnpm typecheck
pnpm build
test -f .next/standalone/server.js
test -d .next/static
```

Service and tunnel status checks:

```sh
systemctl status <udd-service-name> --no-pager
systemctl status <cloudflared-service-name> --no-pager
journalctl -u <udd-service-name> -n 100 --no-pager
journalctl -u <cloudflared-service-name> -n 100 --no-pager
```

Env verification checks, run against a redacted env inventory rather than printing secret values:

```sh
grep -E '^(NODE_ENV|PATH|BETTER_AUTH_SECRET|BETTER_AUTH_URL|DATABASE_URL|UDD_PREVIEW_HOST|UDD_DEFAULT_AI_BASE_URL|UDD_DEFAULT_AI_MODEL|UDD_DEFAULT_AI_API_KEY|UDD_SECRET_KEY|UDD_AI_PROVIDER)=' <redacted-env-inventory>
grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL|AI_GATEWAY_API_KEY|VERCEL)=' <redacted-env-inventory> && exit 1 || true
```

## 15. Locked assumptions

- Legion has a stable service user, Node runtime, pnpm, PostgreSQL client tools, and cloudflared installed by the operator before first deployment.
- The first production process model is systemd plus Next standalone server; Docker is deferred to later hardening.
- PostgreSQL is reachable from Legion through `DATABASE_URL` with credentials managed outside the repository.
- Cloudflare Tunnel owns public HTTPS for the app origin.
- `BETTER_AUTH_URL` is the app public HTTPS origin and must not point at localhost.
- `UDD_PREVIEW_HOST` is a separate public or browser-routable preview origin selected by the operator.
- The future migration branch provides an explicit migration command; this runbook keeps it as `<migration-command-using-DATABASE_URL>` until source defines the exact command.
- The final Better Auth table names and Drizzle migration paths must be verified against generated schema before first deploy.
- Preview traffic must not be exposed through Cloudflare until the source-backed routing mechanism is confirmed: dedicated preview router, bounded per-preview ports, or another implementation-owned design.
- Backup storage location, retention, restore rehearsal, and encryption method must be selected before production cutover.
- Exact systemd unit paths, user/group names, and Cloudflare hostnames are operator-provided Legion values that must be filled in before enabling services.
