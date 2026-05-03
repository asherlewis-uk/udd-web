# Docker Compose Architecture (Legion)

> Status: documentation-only. This file specifies the **target** runtime model
> for UDD on the Legion host. It supersedes the systemd-native process model
> sketched in `docs/migration/legion-deployment-runbook.md:126-156` and
> `docs/migration/legion-deployment-runbook.md:157-162`. The runbook itself
> will be patched in a later rotation; until then the runbook still reads
> systemd-shaped and should be treated as historical for the runtime layer.
>
> No code, no infra, no host state is mutated by the existence of this file.

## 1. Scope and non-goals

### 1.1 Scope

This document specifies how the UDD web application runs as a container on the
Legion host: image build, image registry, image tagging, the
`docker-compose.yml` shape, network topology, the integration with the existing
shared infrastructure (Caddy, cloudflared, Postgres), secrets file consumption,
healthchecks, log handling, resource limits, restart behaviour, Portainer
integration, and the rollback contract.

It also enumerates the code-side prerequisites in the `udd-web` repository
that must land before this architecture can be deployed.

### 1.2 Non-goals

This document is intentionally narrow. It does **not** cover:

- The contents of the production environment file. That contract lives in
  `docs/migration/env-lockdown.md:1-57` and is referenced — never duplicated —
  here. New environment variables, retired environment variables, and secret
  classification all belong to that document.
- The application database schema. That contract lives in
  `docs/migration/drizzle-schema.md:1-8` (Drizzle config),
  `docs/migration/drizzle-schema.md:10-85` (Better Auth tables), and
  `docs/migration/drizzle-schema.md:505-522` (RLS replacement plan).
- Auth integration shape, route handlers, session helpers, or the Supabase
  removal sweep. Those belong to `docs/migration/better-auth-integration.md`.
- The ordered cutover sequence — backups, write freezes, DNS switch, smoke
  tests. That belongs to `docs/migration/cutover-runbook.md`, in particular
  `docs/migration/cutover-runbook.md:223-289` (Legion deployment activation)
  and `docs/migration/cutover-runbook.md:386-456` (rollback).
- Query-level Supabase-to-Drizzle rewrites. That belongs to
  `docs/migration/db-query-rewrite-catalog.md`.

When this document and the legion-deployment-runbook disagree on the runtime
layer (Docker vs. systemd), this document wins; the runbook is stale on that
axis until its forthcoming patch lands.

## 2. Existing host topology

The Legion host already runs the following long-lived containers. UDD does
not own any of them. UDD adds exactly one new container (`udd-web`) and one
new logical Postgres role/database inside the existing Postgres container.

| Container        | Role on Legion                                | Relationship to UDD                    |
| ---------------- | --------------------------------------------- | -------------------------------------- |
| `caddy`          | TLS-terminating reverse proxy.                | Shared. UDD adds a site block.         |
| `cloudflared`    | Cloudflare Tunnel ingress (wildcard).         | Shared. No config change required.    |
| `postgres`       | Postgres 16. Multi-tenant on this host.       | Shared. New role + new DB for UDD.     |
| `forgejo`        | Self-hosted Git host + container registry.    | Image registry only. App is unrelated. |
| `portainer`      | Docker UI / stack manager.                    | Used to deploy the UDD stack.          |
| `qdrant`         | Vector database for unrelated workloads.      | Unrelated to UDD.                      |
| `ollama`         | Local LLM runtime.                            | Reachable from UDD via Docker network. |

Notes:

- **Shared infrastructure** (this document depends on it): `caddy`,
  `cloudflared`, `postgres`. Changes to any of these must be coordinated.
- **Adjacent but independent** (UDD does not depend on it for serving HTTP
  but may consume it as an upstream service): `forgejo` (image registry
  consumer), `ollama` (default AI provider per
  `docs/migration/env-lockdown.md:46`).
- **Unrelated**: `portainer` (operator tooling, not a runtime dependency at
  the data path), `qdrant`.

UDD must not assume the existence of any other container (no Loki, no
Prometheus, no Uptime Kuma, no orchestrator beyond plain Docker Compose).

## 3. Network topology

A single user-defined Docker bridge network named **`legion-internal`**
carries all internal traffic for the UDD data path. UDD does not publish any
port to the host. The Forgejo collision on host port 3000 is sidestepped by
keeping `udd-web:3000` container-internal.

### 3.1 Data flow

```
+----------------+       HTTPS 443       +-----------------+
|  Public client | --------------------> |   Cloudflare    |
+----------------+                       +-----------------+
                                                  |
                                                  | Cloudflare Tunnel
                                                  v
+--------------------------------------------------------------+
|                       Legion host                            |
|                                                              |
|   +-----------------+   bridge: legion-internal              |
|   |   cloudflared   |-------+                                |
|   +-----------------+       |                                |
|                             v                                |
|                       +-----------+                          |
|                       |   caddy   |  (site: udd.<apex>)      |
|                       +-----------+                          |
|                             |                                |
|                             | http://udd-web:3000            |
|                             v                                |
|                       +-----------+                          |
|                       |  udd-web  |   (container-internal)   |
|                       +-----------+                          |
|                             |                                |
|                             | postgres://postgres:5432       |
|                             v                                |
|                       +-----------+                          |
|                       | postgres  |   (db: udd_prod)         |
|                       +-----------+                          |
|                                                              |
+--------------------------------------------------------------+
```

### 3.2 Port table

| Hop                              | Address                  | Where bound          | Notes |
| -------------------------------- | ------------------------ | -------------------- | ----- |
| Cloudflare → cloudflared         | wildcard `*.<apex>:443`  | external             | Owned by cloudflared, unchanged. |
| cloudflared → caddy              | `caddy:443` (or `:80`)   | `legion-internal`    | Container DNS. |
| caddy → udd-web                  | `http://udd-web:3000`    | `legion-internal`    | Plain HTTP inside the bridge; TLS terminates at Caddy. |
| udd-web → postgres               | `postgres:5432`          | `legion-internal`    | Container DNS. UDD never reaches Postgres via host loopback. |
| udd-web → host services (Ollama) | resolved via env config  | host                 | See `docs/migration/env-lockdown.md:46` for `UDD_DEFAULT_AI_BASE_URL`. |
| udd-web → host                   | **none**                 | none                 | UDD publishes no host ports. |

### 3.3 Network membership

All four containers must be members of `legion-internal`:

- `cloudflared` (existing — must be added to `legion-internal` if not
  already a member; flagged in §16 as an assumption to verify).
- `caddy` (existing — same caveat).
- `udd-web` (new).
- `postgres` (existing — same caveat).

The compose file for `udd-web` declares `legion-internal` as `external: true`
so this stack does not own the network's lifecycle.

## 4. Image build

### 4.1 Multi-stage Dockerfile

The image is built in two stages: `builder` and `runtime`. The builder runs
the full `pnpm install` + `pnpm build`. The runtime copies only the Next.js
standalone output, the static assets, and `public/`. Final runtime layer
contains no dev dependencies, no source, and no `pnpm`.

This requires `output: 'standalone'` in `next.config.mjs`, which is **not
present today** (see `next.config.mjs:1-17` and the prerequisite recorded at
`docs/migration/env-lockdown.md:54`). Adding it is part of §15.

### 4.2 Reference Dockerfile

```dockerfile
# syntax=docker/dockerfile:1.7

# ---------- builder ----------
FROM node:lts-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat \
 && corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---------- runtime ----------
FROM node:lts-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV TZ=UTC
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs \
 && adduser  -u 1001 -S nextjs -G nodejs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public           ./public

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health >/dev/null || exit 1

CMD ["node", "server.js"]
```

### 4.3 What gets copied between stages

| Source in builder              | Destination in runtime         | Why                                  |
| ------------------------------ | ------------------------------ | ------------------------------------ |
| `/app/.next/standalone/*`      | `/app/`                        | Next standalone server + traced deps |
| `/app/.next/static/*`          | `/app/.next/static/`           | Hashed client bundles                |
| `/app/public/*`                | `/app/public/`                 | Static assets served by the server   |

Nothing else crosses the stage boundary. No `node_modules`, no `pnpm-lock.yaml`,
no source tree, no `.env*`.

### 4.4 Bind to `0.0.0.0` inside the container

Inside the container the Next standalone server binds to `0.0.0.0:3000` so
Caddy can reach it via the bridge network. This is intentionally different
from the systemd reference at
`docs/migration/legion-deployment-runbook.md:159-160` (`127.0.0.1` bind),
because the container's network namespace is the only thing reachable, and
Docker Compose enforces network membership rather than host-loopback rules.
Per-preview child processes spawned by `lib/runtime/local-preview.ts` continue
to bind `127.0.0.1` per their existing source contract and are unaffected by
this change.

## 5. Image registry and tagging

### 5.1 Registry path

Images are pushed to and pulled from the Forgejo container registry running
on the same host:

```
<forgejo-registry-host>/<owner>/udd-web:<tag>
```

Both `<forgejo-registry-host>` (e.g., `forgejo.<apex>`) and `<owner>` resolve
to operator-provided values; see §17 placeholder glossary.

The deploy host **pulls** the image. It does not build. There is exactly one
build site per release (CI), and exactly one consumer (the host running
Compose).

### 5.2 Two tags per build

Every successful build produces two tags simultaneously and pushes both:

- `udd-web:<git-sha>` — the immutable, content-addressed tag. This is the
  only tag a deployed `docker-compose.yml` is allowed to reference.
- `udd-web:prod` — a moving pointer used by humans for orientation only.
  Never referenced from compose. Updated on every promoted release.

The compose file pins to `<git-sha>`. `prod` and `latest` are explicitly
forbidden in the compose `image:` field. This is what makes rollback a
one-line edit (see §14).

### 5.3 Retention

Proposed retention: **keep the most recent 10 image tags per branch** in the
Forgejo registry, plus all tags pinned by any compose file that has been
deployed in the last 90 days. The exact retention configuration belongs to
the Forgejo operator; this document only proposes the policy. Marked in §16
as an assumption to verify before first deploy.

## 6. `docker-compose.yml` layout

Canonical path on host: **`/srv/udd/docker-compose.yml`**. This file is the
single source of truth for the UDD stack. See §13 for the
filesystem-as-source-of-truth contract.

### 6.1 Annotated reference file

```yaml
# /srv/udd/docker-compose.yml
#
# UDD web application. Stateless. Pulls a SHA-pinned image from the Forgejo
# registry. Joins the existing legion-internal bridge so caddy and postgres
# are reachable by container DNS.
#
# Rollback: edit the image tag's <git-sha> and `docker compose up -d`.
# Filesystem-as-source-of-truth: do NOT edit this file in Portainer's web
# editor. See docs/migration/docker-compose-architecture.md §13.

services:
  udd-web:
    # Pinned to an immutable git-sha tag. Never `prod`, never `latest`.
    # See docs/migration/docker-compose-architecture.md §5.
    image: <forgejo-registry-host>/<owner>/udd-web:abc1234

    container_name: udd-web

    # Host file. Mode 0640. Ownership udd:docker.
    # Contents governed by docs/migration/env-lockdown.md:1-57.
    env_file:
      - /srv/udd/.env.production

    environment:
      # Container-only overrides. Real secrets stay in env_file.
      TZ: UTC
      NODE_ENV: production
      PORT: "3000"
      HOSTNAME: "0.0.0.0"

    networks:
      - legion-internal

    # Container-internal port only. No host-side `ports:` mapping.
    # Caddy reaches this as http://udd-web:3000 over legion-internal.
    expose:
      - "3000"

    restart: always

    mem_limit: 2g
    # No CPU limit. See §12.

    # Healthcheck mirrors the Dockerfile HEALTHCHECK so Compose surfaces it.
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s

    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

    # Soft dependency only. Compose does not wait for postgres to be
    # READY-by-protocol; the application's own startup retry loop is the
    # source of truth for connection readiness.
    depends_on:
      - postgres

networks:
  legion-internal:
    external: true
    name: legion-internal
```

Notes on the example:

- The literal `:abc1234` is a placeholder SHA fragment. Real deployments use
  the actual short SHA from the build that produced the image.
- `<forgejo-registry-host>` and `<owner>` are placeholders; see §17.
- The `postgres` service is **not** redeclared here. It is owned by another
  stack on the same host. `depends_on` references the existing service name
  on the network. If your Compose project does not see `postgres` as a peer
  in `legion-internal`, the `depends_on` line should be removed; the
  application is resilient to startup ordering.

### 6.2 What is intentionally absent

| Field           | Why absent                                                           |
| --------------- | -------------------------------------------------------------------- |
| `volumes:`      | UDD is stateless. No bind mounts. No named volumes. See §6.3.        |
| `ports:`        | UDD never publishes a host port. Caddy is the only reachable face.   |
| `build:`        | Built in CI, not on the deploy host. See §5.                         |
| `cpus:` / `cpu_shares:` | See §12 for the rationale.                                  |
| `command:`      | `CMD` baked into the image is correct. No override required.         |

### 6.3 Persistent volumes — explicit non-feature

UDD has **no persistent on-disk state** outside of Postgres. Logs, caches,
preview workspaces, and uploaded artifacts are either ephemeral or live in
the database. There must be no bind mounts and no named volumes attached to
`udd-web`. Future engineers must not add one as a "convenience" without
re-evaluating the stateless contract that makes rollback safe.

The runtime preview helper at
`docs/migration/legion-deployment-runbook.md:27` writes to an OS temp
workspace inside the container; that workspace is intentionally ephemeral
and is destroyed on container restart.

## 7. Postgres reuse

UDD reuses the existing `postgres:16` container. UDD does not own that
container. UDD owns exactly one role and one database inside it.

### 7.1 Provisioning SQL

Run once, as the Postgres superuser, against the existing Postgres instance:

```sql
-- Create the application role with a strong password.
-- The password value is sourced from /srv/udd/.env.production
-- (DATABASE_URL); see docs/migration/env-lockdown.md:44.
CREATE ROLE udd_app
    WITH LOGIN
         PASSWORD '<udd-db-password>'
         NOSUPERUSER
         NOCREATEDB
         NOCREATEROLE
         INHERIT;

-- Create the application database, owned by udd_app.
CREATE DATABASE udd_prod
    WITH OWNER = udd_app
         ENCODING = 'UTF8'
         TEMPLATE = template0;

-- Required by Drizzle baseline migrations for gen_random_uuid().
-- See docs/migration/drizzle-schema.md:8.
\connect udd_prod
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### 7.2 Privilege scoping

`udd_app` must not be a superuser, must not have `CREATEDB`, and must not
have `CREATEROLE`. It owns only the `udd_prod` database. It has no
privileges on the database used by Forgejo (or any other tenant of the
shared Postgres container). Verify with:

```sql
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole
FROM pg_roles
WHERE rolname = 'udd_app';
```

### 7.3 Connection string

The application reads `DATABASE_URL` exactly as specified in
`docs/migration/env-lockdown.md:44`. Inside the container, the host
component resolves to `postgres` via Docker DNS on `legion-internal`:

```
postgresql://udd_app:<udd-db-password>@postgres:5432/udd_prod
```

The password is set by the env file. This document does not transcribe it.

## 8. Caddy integration

Caddy already runs on the host, terminates TLS, and exposes port 443
through cloudflared. UDD adds **one** site block to the existing Caddyfile.

### 8.1 Caddyfile site block

Add to the file at `<caddy-config-mount>/Caddyfile` inside the caddy
container's mounted config volume:

```caddyfile
udd.<apex> {
    encode zstd gzip
    reverse_proxy udd-web:3000

    # Forwarded protocol header so the app sees the right scheme behind
    # cloudflared + caddy.
    header_up X-Forwarded-Proto {scheme}
}
```

Then reload Caddy in-place (no restart required). The exact reload command
depends on how Caddy is launched in its container; that detail belongs to
the legion-deployment-runbook patch and is flagged in §16.

### 8.2 Why this works

- `udd-web:3000` resolves via Docker DNS on `legion-internal`. Both
  containers must be members of that network — see §3.3.
- Cloudflared already routes `*.<apex>` to Caddy via wildcard ingress
  (see §9). No DNS or tunnel change is required.
- TLS terminates at Caddy. Inside the bridge network the hop is plain HTTP,
  which is correct for a layer-7 reverse proxy on a private network.

### 8.3 Caddyfile path is an assumption

The exact path of the Caddyfile inside the caddy container's mounted config
volume is operator-managed. The placeholder `<caddy-config-mount>` is used
throughout. The legion-deployment-runbook patch will resolve this path; for
now it is recorded in §16 as an assumption to verify.

## 9. Cloudflared assumptions

Cloudflared on Legion already runs with a wildcard ingress rule routing
`*.<apex>` to the Caddy container. This document **assumes that rule
exists** and therefore requires no cloudflared config change to bring
`udd.<apex>` online.

If that assumption proves wrong on the day of deployment, the
legion-deployment-runbook patch (which is the canonical home for tunnel
config — see `docs/migration/legion-deployment-runbook.md:164-207`) must
add an explicit ingress entry for `udd.<apex>`. This document does not
attempt to specify that change in advance.

The assumption is recorded in §16 as `to-verify`.

## 10. Secrets file

| Property      | Value                                                       |
| ------------- | ----------------------------------------------------------- |
| Path          | `/srv/udd/.env.production`                                  |
| Mode          | `0640`                                                      |
| Owner         | `udd` (user)                                                |
| Group         | `docker` (group)                                            |
| Read by       | The `udd-web` container, via Compose `env_file:` directive  |
| Lifecycle     | Created by the operator out-of-band; rotated per `docs/migration/cutover-runbook.md:167-222`. |
| Content spec  | `docs/migration/env-lockdown.md:1-57`                        |

The `udd:docker` ownership combination is chosen because the Docker daemon
runs the container as a UID that is not directly the `udd` user, but the
group `docker` is sufficient for the container runtime to read the file
under default Compose semantics (`env_file:` is read by the daemon, not by
the in-container user). If the operator's `udd` service account is itself a
member of `docker`, no further ACL work is required.

This document does **not** enumerate the variables in the env file. The
authoritative list is `docs/migration/env-lockdown.md:38-48` (live
variables) and `docs/migration/env-lockdown.md:27-36` (retired variables).

## 11. Healthcheck and observability

### 11.1 `/api/health` route contract

The application must expose a health endpoint with this contract:

| Property        | Value                                              |
| --------------- | -------------------------------------------------- |
| Path            | `/api/health`                                      |
| Method          | `GET`                                              |
| Status (healthy)| `200`                                              |
| Body (healthy)  | `{ "ok": true }` (small JSON, ≤ 64 bytes)          |
| Status (unhealthy)| any non-2xx                                       |
| Auth            | None — must respond before any session middleware  |

A reference implementation is a five-line Next.js Route Handler at
`app/api/health/route.ts` returning `Response.json({ ok: true })`. The
handler must not touch the database, must not call Better Auth, and must
not invoke any AI provider. Its only job is to prove the Node process can
serve HTTP.

This route does not exist in the current source tree and is one of the §15
prerequisites.

### 11.2 Dockerfile `HEALTHCHECK`

Already shown in §4.2. Repeated here for clarity:

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health >/dev/null || exit 1
```

The Compose file mirrors this directive at the service level so
`docker ps` and Portainer surface the health state.

### 11.3 Logs

UDD uses the default `json-file` driver with rotation:

| Option       | Value | Rationale                                                   |
| ------------ | ----- | ----------------------------------------------------------- |
| `max-size`   | `10m` | Per-file rotation cap.                                      |
| `max-file`   | `3`   | At most 30 MB of logs on disk per container at any moment.  |
| Driver       | `json-file` | Default; readable by `docker logs` without extra infra. |

Read logs via:

```sh
docker logs -f --tail=200 udd-web
# or, equivalently, via Compose:
docker compose -f /srv/udd/docker-compose.yml logs -f --tail=200 udd-web
```

There is no Loki, no ELK, no Prometheus on Legion today. This document does
not introduce any. The `[v0]` server-diagnostic log convention used by the
application is unchanged by containerisation.

## 12. Resource limits and restart behaviour

### 12.1 `mem_limit: 2g`

Node processes leak memory under realistic workloads, especially under
sustained `after()`-driven background work (see callers listed at
`docs/migration/legion-deployment-runbook.md:26`). A 2 GB cap is
conservative on a host that already runs eight long-lived containers
(Caddy, cloudflared, Postgres, Forgejo, Portainer, Qdrant, Ollama, plus
the new UDD container) competing for finite RAM. When memory growth ever
threatens host stability, the kernel OOM-kills the offending container
instead of the host. Compose's `restart: always` then brings the container
back, the healthcheck reports green within `start_period` (20 s), and the
incident is bounded.

### 12.2 No CPU limit

CPU contention on a Linux host is handled fairly by the CFS scheduler.
A hard `cpus:` cap on the UDD container would only damage tail latency
during legitimate burst work (AI generation, build previews) without
helping any neighbour. We rely on the scheduler. If a noisy-neighbour
problem ever materialises, this decision is revisited; until then it stays
absent from the compose file.

### 12.3 `restart: always`

The container restarts on any exit (clean exit, OOM kill, healthcheck-driven
kill). This is the correct default for a stateless web app with no startup
ordering requirements beyond what the application itself enforces.

The combination of `restart: always` + `mem_limit: 2g` + healthcheck
produces a system where a runaway memory leak is self-bounding: leak →
OOM → restart → green healthcheck → traffic resumes. The cost is one
short outage per OOM event, surfaced in `docker logs`.

## 13. Portainer integration

### 13.1 Filesystem-as-source-of-truth contract

The compose file at `/srv/udd/docker-compose.yml` is the single source of
truth. Portainer is used as a **viewer and trigger**, not as an editor.

Concretely, Portainer provides two ways to register a stack:

1. **Web editor** — paste YAML into Portainer's UI. **This mode is
   forbidden for UDD.** It immediately creates drift between Portainer's
   internal copy and `/srv/udd/docker-compose.yml`, and that drift is
   invisible to anyone reading the file on disk.
2. **From filesystem path** — point Portainer at `/srv/udd/docker-compose.yml`
   and let it `docker compose up`. **This mode is the only mode UDD uses.**

### 13.2 Registration steps

1. In Portainer, create a new stack.
2. Choose "Custom template" → "Build method: Repository" → switch to
   "Build method: Filesystem path" (exact wording depends on Portainer
   version; the menu path is "deploy from disk").
3. Set the path to `/srv/udd/docker-compose.yml`.
4. Set the stack name to `udd`.
5. Deploy.

Subsequent updates: edit `/srv/udd/docker-compose.yml` on disk (typically
to bump the image SHA — see §14), then trigger "Pull and redeploy" in
Portainer, or run `docker compose -f /srv/udd/docker-compose.yml up -d`
directly. Both paths reload the same file.

### 13.3 Hard rule

> **Do not edit the compose file in Portainer's web editor.** The web
> editor's saved copy will silently override the on-disk file on the next
> "Update the stack" action and produce drift. If a teammate has edited
> via the UI, treat their change as lost work and replay it in the
> on-disk file before redeploying.

## 14. Rollback contract

### 14.1 Application-only rollback

Because the compose file pins to `<git-sha>` and the application is
stateless, application rollback is **a one-line edit**:

```diff
-    image: <forgejo-registry-host>/<owner>/udd-web:abc1234
+    image: <forgejo-registry-host>/<owner>/udd-web:def5678
```

Then:

```sh
docker compose -f /srv/udd/docker-compose.yml pull
docker compose -f /srv/udd/docker-compose.yml up -d
```

The Forgejo registry retains the previous SHA tag (per §5.3 retention),
the Compose file pulls it, the container restarts, and the healthcheck
gates traffic restoration via Caddy.

### 14.2 Finding previous SHAs

In order of preference:

1. **Forgejo registry image list** — the registry UI lists every tag for
   the `udd-web` repository. The SHA tags are the rollback candidates.
   The `prod` tag (the moving pointer) is **not** a rollback candidate.
2. **`docker images <forgejo-registry-host>/<owner>/udd-web`** — local
   cache on the deploy host. Useful when the registry UI is unavailable.
3. **Git history** — every released SHA is also a commit on `main`.

### 14.3 Schema rollback is out of scope

This rollback procedure is **app-only**. It does not roll back any
Postgres schema migration that landed alongside the previous deploy.
Schema rollback is governed by `docs/migration/cutover-runbook.md:386-456`
(in particular the "Do not rollback without DB restore if…" gate at
`docs/migration/cutover-runbook.md:450-456`). Old code must not be
deployed against a newer incompatible schema.

If you are rolling back a release that included a Drizzle migration, this
document's procedure is **not sufficient on its own** and the cutover
runbook's full rollback path applies instead.

## 15. Code-side prerequisites

The following repository changes must land on `main` before this
architecture can be deployed. None of them are made by this document.

1. **Add `output: 'standalone'` to `next.config.mjs`.**
   Current state: absent (`next.config.mjs:1-17`). Required for the
   `.next/standalone/` artifact that the runtime stage of the Dockerfile
   copies. Same prerequisite as recorded in
   `docs/migration/env-lockdown.md:54` and
   `docs/migration/legion-deployment-runbook.md:38-40`.

2. **Add the `/api/health` route handler.**
   Path: `app/api/health/route.ts`. Contract per §11.1. Must not touch
   the database or any auth surface.

3. **Add a root `Dockerfile` matching §4.2.**
   Multi-stage, `node:lts-alpine` base, builder + runtime stages, runtime
   `HEALTHCHECK`, runs as a non-root user.

4. **Add a `.dockerignore` at the repo root.**
   At minimum it must exclude:
   - `node_modules`
   - `.next`
   - `.git`
   - `.env*`
   - `docs/` (optional, but reduces image-build context size)
   - Any other build artifacts that are not needed in the build context.

5. **(Proposed) Add a Forgejo Actions workflow `build-and-push-on-tag`.**
   Triggers on push to `main` and on git tag `v*`. Builds the image,
   tags it as both `udd-web:<git-sha>` and `udd-web:prod`, pushes both
   to `<forgejo-registry-host>/<owner>/udd-web`. **Status: proposed,
   not yet implemented.** The exact workflow YAML is out of scope for
   this document; what matters is the contract that every successful
   build produces both tags atomically (§5.2).

These five items, taken together, are the gate between "this document
exists" and "this stack is deployable." Items 1–4 are code-only; item 5
is CI infrastructure.

## 16. Open questions / assumptions to verify before deployment

The following items are recorded so they cannot be silently skipped on
the day of cutover. Each must be resolved before the legion-deployment-
runbook patch lands.

- [ ] **Caddy config mount path.** The path `<caddy-config-mount>/Caddyfile`
      is a placeholder. The actual path on the host (and inside the caddy
      container) must be confirmed and recorded in the runbook patch.
- [ ] **Forgejo registry hostname and owner namespace.** The placeholders
      `<forgejo-registry-host>` and `<owner>` must be resolved to literal
      strings before any compose file is committed to the host.
- [ ] **Ownership of `/srv/udd/.env.production`.** This document assumes
      `udd:docker` (user `udd`, group `docker`) — verify the `udd` user
      exists on Legion, is a member of `docker`, and that the Docker
      daemon can read the file under that combination. If the operator
      uses a different service-account scheme, document the chosen
      combination and update §10.
- [ ] **Wildcard cloudflared ingress.** §9 assumes `*.<apex>` already
      routes to Caddy. Verify against the live cloudflared config before
      attempting `udd.<apex>`. If the wildcard rule is absent, the runbook
      patch must add an explicit `udd.<apex>` ingress entry.
- [ ] **`legion-internal` membership of pre-existing containers.** Caddy,
      cloudflared, and Postgres must all be members of `legion-internal`.
      If any of them are currently on `bridge` or another network only,
      add them to `legion-internal` before deploying UDD.
- [ ] **Forgejo registry retention policy.** §5.3 proposes "keep last 10
      per branch + everything pinned by an in-use compose file in the
      last 90 days." The actual retention configuration is operator-
      defined; verify it is configured before relying on it for rollback.
- [ ] **Postgres superuser availability for one-time provisioning.**
      §7.1 runs `CREATE ROLE` and `CREATE DATABASE` once as superuser.
      Confirm the operator has, or can obtain, superuser access to the
      shared Postgres container for this single setup step.
- [ ] **`postgres` container is a peer on `legion-internal`.** The
      `depends_on: [postgres]` line in the compose example only makes
      sense if the same Compose project sees `postgres` as a service.
      If Postgres is owned by a different stack — which is the assumption
      throughout this document — remove `depends_on` and rely on the
      application's own connection retry behaviour.

## 17. Glossary of placeholders

Every `<...>` token used in this document is listed here with what it
represents and where the real value comes from. No real values appear in
this file.

| Placeholder                  | Represents                                                                  | Real value sourced from                                                      |
| ---------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `<apex>`                     | The operator's apex DNS zone (e.g., `example.com`).                         | Operator. Used wherever the public hostname appears.                         |
| `<git-sha>`                  | A short Git commit SHA for an immutable image tag.                          | CI build output; placeholder in this doc is `abc1234` / `def5678`.           |
| `<forgejo-registry-host>`    | DNS hostname of the Forgejo container registry on the Legion host.          | Forgejo install, e.g., `forgejo.<apex>`.                                     |
| `<owner>`                    | Forgejo registry namespace owner (user or org) for the `udd-web` image.     | Forgejo registry configuration.                                              |
| `<caddy-config-mount>`       | Filesystem path inside the caddy container where its Caddyfile lives.       | Caddy container's existing volume mount; verify per §16.                    |
| `<udd-db-password>`          | Password for the `udd_app` Postgres role.                                   | `/srv/udd/.env.production` `DATABASE_URL`; see `docs/migration/env-lockdown.md:44`. |
| `<previous-release-commit>`  | Prior released git SHA to roll back to.                                     | Forgejo registry tag list (§14.2) or git history.                            |

End of document.
