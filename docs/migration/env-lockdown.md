# UDD Environment Variable Lockdown — Legion Migration

## Full Audit: Current Variables

| Variable | Files (line numbers) | Classification | Fate |
| -------- | -------------------- | -------------- | ---- |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabase/client.ts:9`, `lib/supabase/server.ts:8`, `lib/supabase/proxy.ts:15`, `lib/supabase/service.ts:5` | Dies | Supabase removal deletes these reads. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase/client.ts:10`, `lib/supabase/server.ts:9`, `lib/supabase/proxy.ts:16` | Dies | Supabase removal deletes these reads. |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/service.ts:6` | Dies | Supabase removal deletes this read. |
| `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | `components/auth/sign-up-form.tsx:35` | Dies | Supabase-coupled redirect URL; no current app URL variable survives or changes value. |
| `AI_GATEWAY_API_KEY` | `lib/ai/providers/server.ts:79` | Dies | Vercel Gateway credential; shared deletion site with `VERCEL` in `hasGatewayEnvironmentCredential()` defined at `lib/ai/providers/server.ts:78`. |
| `VERCEL` | `lib/ai/providers/server.ts:79` | Dies | Vercel/Gateway environment detection; shared deletion site with `AI_GATEWAY_API_KEY` in `hasGatewayEnvironmentCredential()` defined at `lib/ai/providers/server.ts:78`. No `VERCEL_*` system vars are referenced anywhere. |
| `UDD_AI_PROVIDER` | `lib/ai/providers/index.ts:49` | Survives unchanged | Existing provider selector; valid values expand after the AI rewrite. |
| `UDD_SECRET_KEY` | `lib/secrets/crypto.ts:8`, `lib/secrets/crypto.ts:15` | Survives unchanged | Existing 32-byte hex secret; `lib/secrets/crypto.ts` is correct and untouched. |
| `NODE_ENV` | `app/layout.tsx:42` | Survives unchanged | Framework-level variable; this single in-repo consumer is removed when Vercel Analytics is removed. |
| `PATH` | `lib/runtime/local-preview.ts:461` | Survives unchanged | OS-provided variable forwarded to scrubbed child env in `previewEnvironment()`; no operator action. The `process.env` passthrough in the launcher template at `lib/runtime/local-preview.ts:667` is generated source code embedded in `launcherSource()` and runs in the preview child, not the UDD app. The parent scrubs env to `PATH`, `HOME`, `TMPDIR`, `NODE_ENV`, `NEXT_TELEMETRY_DISABLED`, `HOSTNAME`, `PORT`, and `CI` at `lib/runtime/local-preview.ts:455`-`lib/runtime/local-preview.ts:470`; no UDD secrets cross into preview children today. |

## Legion Target: Variables That Live

| Variable | Value | Secret | Notes |
| -------- | ----- | ------ | ----- |
| `UDD_SECRET_KEY` | Existing 32-byte hex value | Secret | Read at `lib/secrets/crypto.ts:8` and `lib/secrets/crypto.ts:15`; `lib/secrets/crypto.ts` is correct and untouched. |
| `UDD_AI_PROVIDER` | Operator-set | Not secret | Read at `lib/ai/providers/index.ts:49`; valid values expand to include any OpenAI-compatible provider id post-rewrite. |
| `NODE_ENV` | `production` in deploy | Not secret | Framework-level variable; current in-repo read at `app/layout.tsx:42` is deleted with Analytics. |
| `PATH` | OS-provided | Not secret | Read at `lib/runtime/local-preview.ts:461`; no operator action. |

## Variables That Die

| Variable | Dies Because | Files to Change |
| -------- | ------------ | --------------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase is removed. | `lib/supabase/client.ts:9`, `lib/supabase/server.ts:8`, `lib/supabase/proxy.ts:15`, `lib/supabase/service.ts:5` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase is removed. | `lib/supabase/client.ts:10`, `lib/supabase/server.ts:9`, `lib/supabase/proxy.ts:16` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase is removed. | `lib/supabase/service.ts:6` |
| `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | Supabase-coupled redirect URL is removed; no current URL-shaped app variable survives with a changed value. | `components/auth/sign-up-form.tsx:35` |
| `AI_GATEWAY_API_KEY` | Vercel Gateway is removed. | `lib/ai/providers/server.ts:79` |
| `VERCEL` | Vercel Gateway environment detection is removed; no `VERCEL_*` system vars are referenced anywhere. | `lib/ai/providers/server.ts:79` |

## New Variables Required

| Variable | Purpose | Value on Legion | Secret | Blocked On |
| -------- | ------- | --------------- | ------ | ---------- |
| `BETTER_AUTH_SECRET` | Random 32-byte secret for session signing. | Generate at deploy. | Secret | None |
| `BETTER_AUTH_URL` | Canonical app URL for auth redirects and CORS. | `https://udd.asherlewis.online` (Cloudflare Tunnel domain) | Not secret | None. Net-new: no current variable plays this role; the empty "Survives With Value Change" category in the handoff is reframed here. |
| `DATABASE_URL` | postgresjs connection string. | `postgresql://udd:***@localhost:5432/udd` | Secret | Pending Legion Postgres password rotation. Name and format are locked. |
| `UDD_PREVIEW_HOST` | Overrides host written to `run_sessions.preview_url`. | `http://100.106.121.100` (Tailscale IP) | Not secret | 🚨 Blocking correctness issue: without this, remote users accessing UDD through Cloudflare Tunnel see blank preview iframes because `127.0.0.1` resolves to the client browser, not Legion. Read site after patch: `lib/runtime/local-preview.ts:69`. Runtime still binds `127.0.0.1` (`lib/runtime/local-preview.ts:466`, `lib/runtime/local-preview.ts:547`, `lib/runtime/local-preview.ts:665` unchanged). |
| `UDD_DEFAULT_AI_BASE_URL` | Default OpenAI-compatible endpoint. | `http://localhost:11434/v1` (Ollama on Legion) | Not secret | None |
| `UDD_DEFAULT_AI_MODEL` | Default model id. | Operator-set; suggest `qwen2.5-coder` or `llama3.2` for RTX 4060 8GB. | Not secret | None |
| `UDD_DEFAULT_AI_API_KEY` | API key for default endpoint. | `"ollama"` (any non-empty string for Ollama) | Secret for non-Ollama deployments | None |

## Build-Time Config Changes

| File | Current | Required | Why |
| ---- | ------- | -------- | --- |
| `next.config.mjs` | No `output` key; file has only `typescript.ignoreBuildErrors: false` and `images.unoptimized: true`. | `output: 'standalone'` | Required for Docker deployment of Next.js 16 on Legion. |
| `next.config.mjs` | No `experimental` key; file has only `typescript.ignoreBuildErrors: false` and `images.unoptimized: true`. | `experimental: { after: true }` | Required so `next/server`'s `after()` runs on self-hosted Node.js. Every long-running operation (AI generation, preview drive) uses `after()`; without the flag it silently no-ops. |
| `app/layout.tsx:3` | `import { Analytics } from "@vercel/analytics/next"` | **deleted** | Vercel telemetry; no equivalent on Legion. |
| `app/layout.tsx:42` | `{process.env.NODE_ENV === "production" && <Analytics />}` | **deleted** | Same reason. After deletion, no in-repo `NODE_ENV` consumer remains; framework-level use stays. |
