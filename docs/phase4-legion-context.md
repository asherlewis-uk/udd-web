# Context — Part 2: Legion existing server stack (restore truth)

> **Purpose:** This document is the authoritative record of the Legion server stack as it existed
> before any UDD deployment work. It is the recovery reference if any prior agent run damaged,
> reconfigured, or removed any part of the existing infrastructure.
>
> If you are reading this to restore a damaged stack, treat every value here as the source of
> truth. Cross-reference against the live host before making any change.

---

## 1. Host

| Property | Value |
|---|---|
| Hostname | Legion |
| OS | Linux (user: `asher`) |
| Docker Compose file | `/home/asher/server/docker-compose.yml` |
| Caddy config | `/home/asher/server/caddy/Caddyfile` |
| Compose data | `/home/asher/server/data/` |
| Docker network (internal) | `server_internal` (compose alias: `internal`) |
| Docker network (web) | `server_web` (compose alias: `web`) |
| Tailscale IP | `100.106.121.100` |

The compose networks are defined inside `/home/asher/server/docker-compose.yml`. The Docker-level
network names are `server_internal` and `server_web` (prefixed by the stack name `server`).
**Never** refer to these as `legion-internal` — that name does not exist on this host.

---

## 2. Existing container stack

All containers below are managed by `/home/asher/server/docker-compose.yml` and must remain
untouched by UDD deployment work.

| Container | Image | Exposed to host | Role |
|---|---|---|---|
| `postgres` | `postgres:16` | `127.0.0.1:5432` | Multi-tenant Postgres. DBs: `forgejo` (owner: `hermes`), `udd_prod` (owner: `udd_app`), `postgres`. |
| `forgejo` | `codeberg.org/forgejo/forgejo:10` | `127.0.0.1:3000` | Self-hosted Git + container registry at `git.asherlewis.online`. Bind-mount: `./data/forgejo:/data`. |
| `caddy` | `caddy:2.11` | `80`, `443` | TLS-terminating reverse proxy. Config: `./caddy/Caddyfile`. Currently routes `git.asherlewis.online → forgejo:3000`. |
| `cloudflared` | `cloudflare/cloudflared:2026.3.0` | none | CF Tunnel ingress (token-based). Wildcard ingress rule in CF dashboard routes `*.asherlewis.online → caddy`. |
| `qdrant` | `qdrant/qdrant:v1.17` | `127.0.0.1:6333` | Vector DB. Unrelated to UDD. |
| `ollama` | `ollama/ollama:0.22.1` | `127.0.0.1:11434` | Local LLM with GPU (RTX 4060). UDD default AI provider. |
| `portainer-ce` | `portainer/portainer-ce:2.39.1` | Tailscale `100.106.121.100:9000` | Docker UI. Operator tooling only. |

**Known gaps in the existing stack (pre-UDD, not to be fixed by UDD deployment):**
- `forgejo` has no Compose healthcheck
- `forgejo` has no automated backup story
- Postgres `forgejo` DB owner is `hermes` — there is a known ownership drift

---

## 3. Postgres role inventory

| Role | Purpose | Owns |
|---|---|---|
| `hermes` | Superuser / admin role used by Hermes agent | `forgejo` DB (ownership drift from original setup) |
| `udd_app` | Application role for UDD. No SUPERUSER/CREATEDB/CREATEROLE. | `udd_prod` DB |
| `postgres` | Built-in superuser | `postgres` DB |

Password file for `udd_app`: `/home/asher/.hermes/secrets/udd-web-postgres-udd_prod-password.txt` (mode 600).

---

## 4. Network topology

```
Public internet
      │
      ▼ HTTPS 443
Cloudflare (wildcard *.asherlewis.online → CF Tunnel)
      │
      ▼ CF Tunnel
Legion host → cloudflared container
      │
      ▼ http://caddy (on server_internal)
caddy container
      │
      ├──▶ http://forgejo:3000  →  git.asherlewis.online
      └──▶ http://udd-web:3000  →  udd.asherlewis.online  (ADDED by UDD Phase 4)
```

- `udd-web` publishes **no host port**. Port 3000 on the host is already bound by forgejo (`127.0.0.1:3000`). udd-web is container-internal only, reachable via Docker DNS on `server_internal`.
- `ollama` is reachable from `udd-web` as `http://ollama:11434` (both on `server_internal`).
- `postgres` is reachable from `udd-web` as `postgresql://udd_app:***@postgres:5432/udd_prod`.

---

## 5. Caddyfile — original state (before UDD site block)

```caddyfile
git.asherlewis.online {
    reverse_proxy forgejo:3000
}
```

After UDD Phase 4 deployment, the only addition is:

```caddyfile
udd.asherlewis.online {
    encode zstd gzip
    reverse_proxy udd-web:3000

    header_up X-Forwarded-Proto {scheme}
}
```

If the Caddyfile has been modified beyond these two blocks, it is damaged and should be restored
to exactly those two blocks.

---

## 6. UDD-specific files (added by Phase 4, not part of existing stack)

These files are UDD-owned and separate from the existing stack:

| Path | Purpose |
|---|---|
| `/srv/udd/docker-compose.yml` | UDD Compose stack (separate from `/home/asher/server/docker-compose.yml`) |
| `/srv/udd/.env.production` | UDD production env (mode 640, owner udd:docker) |
| `/home/asher/.hermes/secrets/udd-web-postgres-udd_prod-password.txt` | udd_app DB password (mode 600) |
| `/home/asher/.hermes/secrets/udd-web-better-auth-secret.txt` | BETTER_AUTH_SECRET backup (mode 600) |

The `udd-web` container is a **separate Compose stack**, not a service inside
`/home/asher/server/docker-compose.yml`. The two stacks share only the external `server_internal`
network and the `postgres` container (different DB).

---

## 7. What prior agents may have damaged

If a prior agent run touched the Legion server incorrectly, check these specifically:

### 7.1 Wrong network name in any new config
The migration docs use `legion-internal` as the network name — **this is wrong**. The actual
network is `server_internal`. Any config referencing `legion-internal` will fail silently
(container starts but cannot reach postgres/caddy).

**Verify:** `docker network ls | grep legion` — should return nothing.
**Fix:** Replace `legion-internal` with `server_internal` in any affected file.

### 7.2 udd-web added to /home/asher/server/docker-compose.yml
UDD must NOT be inside the existing stack file. If it was added there, remove it and move it
to `/srv/udd/docker-compose.yml`.

**Verify:** `grep -n 'udd' /home/asher/server/docker-compose.yml`
**Fix:** Remove any udd-web service definition, `docker compose -f /home/asher/server/docker-compose.yml up -d` to reconcile.

### 7.3 Forgejo port conflict
Forgejo binds `127.0.0.1:3000` on the host. If any agent configured udd-web to also publish
port 3000 to the host, it will conflict.

**Verify:** `docker port udd-web` — must show no published ports.
**Fix:** Remove `ports:` from the udd-web service definition.

### 7.4 Caddy config corrupted or overwritten
If caddy was restarted (not just reloaded) after a bad config, it may have failed to start and
taken git.asherlewis.online offline.

**Verify:** `curl -fsS https://git.asherlewis.online -o /dev/null -w "%{http_code}"` — expect 200/302.
**Fix:** Restore Caddyfile to §5 state, then `docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`.

### 7.5 Postgres modified or restarted
Postgres should not be restarted during UDD deployment. `udd_prod` DB and `udd_app` role were
provisioned in Phase 0 and should already exist.

**Verify:** `docker exec postgres psql -U hermes -c "\du" -c "\l"`
**Fix for missing role/db:** See Phase 4 Part 1 §9 of the deployment prompt, or run the
provisioning SQL from `docs/migration/docker-compose-architecture.md:383-409` manually.

---

## 8. Recovery sequence (if stack is damaged)

```bash
# Step 1: Stop any broken udd-web container
docker compose -f /srv/udd/docker-compose.yml down 2>/dev/null || docker rm -f udd-web 2>/dev/null

# Step 2: Restore Caddyfile if damaged
# Edit /home/asher/server/caddy/Caddyfile to match §5 above exactly.
# Then reload:
docker exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

# Step 3: If any server_internal container was accidentally removed from the compose stack
cd /home/asher/server && docker compose up -d
# This is idempotent — it restarts any container that drifted from the compose file.

# Step 4: Verify all original containers are healthy
docker ps --format 'table {{.Names}}\t{{.Status}}'

# Step 5: Verify git.asherlewis.online is reachable
curl -fsS https://git.asherlewis.online -o /dev/null -w "forgejo: %{http_code}\n"

# Step 6: Only after §1-5 pass, re-attempt Phase 4 Part 1.
```
