# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product Truth Contract (Non-Negotiable)

This system must never misrepresent its behavior to the user.

The following invariants must always hold. Any change that violates them is invalid.

### 1. Execution Truth
- The system must not claim to run, build, serve, or deploy code unless real execution infrastructure exists and is used.
- If only validation/parsing is performed, all user-facing language must reflect validation, not execution.

### 2. Preview Truth
- The system must not display or imply a live preview unless a real running instance exists.
- Synthetic URLs (e.g. preview.local) must never be shown as if they are real endpoints.

### 3. Completion Truth
- No task may be marked "completed" unless all durable side effects required for user-visible state are successfully persisted.
- Partial success must be surfaced as failure, not success.

### 4. Provider Truth
- The system must not imply that user-provided API keys are stored or used unless secure storage is implemented.
- Provider selection may be saved, but credentials must be described accurately as environment-managed if that is the case.

### 5. UI Copy Truth
- All UI copy must accurately describe the current behavior of the system.
- Any stale or simulated language must be removed immediately when behavior becomes real.
- Any real behavior must not be described as simulated.

### 6. No Silent Deception
- The system must not fabricate success states, URLs, logs, or outputs that imply functionality that does not exist.
- Logs and events must reflect actual operations performed.

### 7. Regression Rule
- If a change reintroduces previously removed misleading behavior, it must be treated as a bug and corrected immediately.

### Enforcement
Before completing any task:
- Verify that no code, UI, or logs violate the above invariants.
- If a violation is detected, fix it before proceeding.
- Do not defer truth fixes to later passes.

This contract overrides all scoped task instructions.

## Project

UDD ("Universal Dev Desktop") is a single-user Next.js app that turns ideas into working codebases. A user drafts a project, runs AI tasks against it, and executes those generated files in a lightweight runtime that validates them with a real parser.

## Commands

- `pnpm dev` — start dev server (Next.js 16)
- `pnpm build` — production build
- `pnpm start` — run the built app
- `pnpm lint` — eslint
- `pnpm typecheck` — `tsc --noEmit` (standalone type verification)

There are no tests in this repo. `next.config.mjs` has `typescript.ignoreBuildErrors: false`, so `next build` will fail on real type errors; `pnpm typecheck` is available for standalone verification without building.

`pnpm-lock.yaml` is the canonical lockfile. Do not add a `package-lock.json` back — dual lockfiles cause Vercel build drift.

## Stack essentials

- **Next.js 16 App Router**, React 19, TypeScript strict, path alias `@/* → ./*`.
- **Tailwind v4** via `@tailwindcss/postcss`. Global CSS at `app/globals.css`.
- **shadcn/ui** (new-york style) in `components/ui/*`. Use these primitives; don't hand-roll dialogs/menus.
- **Supabase** via `@supabase/ssr` — server client in `lib/supabase/server.ts`, middleware refresh in `lib/supabase/proxy.ts`, browser client in `lib/supabase/client.ts`.
- **AI SDK v6** (`ai` package) through the **Vercel AI Gateway** — provider is selected as a plain `"provider/model"` string (see `lib/ai/providers/index.ts`). Do not import `@ai-sdk/openai` / `@ai-sdk/anthropic` directly.
- Env required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Optional: `UDD_AI_PROVIDER` (`openai` | `anthropic`).

## Architecture

### Auth gating

`middleware.ts` delegates to `updateSession()` in `lib/supabase/proxy.ts`. Public paths are `/`, `/auth/*`, and static assets; everything else redirects unauthenticated users to `/auth/login?redirect=...`. `app/(app)/layout.tsx` double-checks server-side.

### Data model (see `scripts/001_init_schema.sql`)

Solo-first: every row carries `owner_id = auth.users.id` and every table has `select/insert/update/delete` RLS policies keyed on `auth.uid() = owner_id`. When adding tables, follow the same pattern and write a new numbered migration in `scripts/` (the `002_*.sql` file notes that live Supabase is the source of truth — scripts mirror it for reproducibility, so keep them idempotent: `create table if not exists`, `drop policy if exists` before `create policy`).

Core tables: `profiles`, `projects`, `project_files`, `prompts`, `ai_tasks` (+ `ai_task_events`), `run_sessions` (+ `run_events`), `previews`, `exports`, `provider_configs`. `ai_tasks.run_session_id` links an AI task to the run it produced (nullable, set null on delete).

Signups auto-create a row in `profiles` via the `handle_new_user()` trigger.

### The AI pipeline

Flow: `createAITask` (server action) → insert `prompts` + `ai_tasks (status='pending')` → `after(() => runAITask(id))` → server component polling picks up status/events.

- `app/actions/ai.ts` — the server action. Uses `next/server`'s `after()` so the HTTP response flushes before the model is called.
- `lib/ai/classify.ts` — pure function that infers `kind` (`scaffold`/`edit`/`refactor`/`explain`/`other`) and title from the prompt. No model call.
- `lib/ai/prompts.ts` — `buildSystemPrompt` / `buildUserPrompt`. System prompt bakes in Next.js 16 + Tailwind v4 + Supabase conventions and the "full file contents, no placeholders" rule.
- `lib/ai/generator.ts` — the only place that calls `streamText` with `Output.object({ schema })`. Streams `partialOutputStream`, emits `onStart` / `onPartial` hooks, validates final object with Zod (all fields required — no `optional()` — because AI SDK 6 enforces OpenAI strict mode).
- `lib/ai/service.ts` — `runAITask(taskId)` owns every side-effect: status transitions, `ai_task_events` inserts, `ai_tasks.output` write, and upserting generated files into `project_files` (`onConflict: "project_id,path"`). It is idempotent — early-returns if the task isn't `pending`.
- `lib/ai/types.ts` — `AITaskResult` is the stable contract between the generator, service, UI, and runtime. Don't change its shape casually.

Swapping model: set `UDD_AI_PROVIDER=openai|anthropic`. Adding a provider = add an entry to `PROVIDERS` in `lib/ai/providers/index.ts`. No other code should hardcode a model string.

### The Runtime pipeline (mirrors AI)

Flow: `startRunAction` → `startRun(projectId)` inserts `run_sessions (status='starting')` → `after(() => driveSession(sessionId))` → poller picks up.

- `lib/runtime/executor.ts` — pure: `loadProjectFiles` (falls back to latest completed AI task's output if `project_files` is empty), `analyzeFile` (real syntactic check: `JSON.parse` for `.json`, `@babel/parser` with `typescript` + `jsx` + `decorators-legacy` for `.js/.jsx/.ts/.tsx/.mjs/.cjs`, byte-count only for anything else).
- `lib/runtime/service.ts` — `startRun` / `driveSession` / `stopRun`. Writes `run_events` rows that reflect actual parse outcomes (`ok path bytes` / `FAIL path: message`). Any parse failure transitions the session to `status='error'`. Preview URLs are synthetic (`https://preview.local/<slug>?session=<id8>`).
- `startRunFromTaskAction` (in `app/actions/run.ts`) reuses the linked `run_session_id` if it's still live, otherwise starts a new one and writes the link back.

### Background work pattern

Every long-running operation uses `after()` from `next/server` so the action returns immediately and the heavy work runs after the response is flushed. Clients observe progress by polling — see `TaskPoller` / `run-poller.tsx` — which just calls `router.refresh()` on an interval while any task/session is active. There is no WebSocket / realtime subscription.

### Routes

- `app/(app)/*` — authenticated app. Route group layout redirects unauthenticated users.
- `app/(app)/projects/[id]/{ai,run,logs,files,settings}/page.tsx` — project workspace tabs.
- `app/auth/{login,sign-up,sign-up-success,callback,logout,error}/*` — Supabase auth flows.
- Server actions live under `app/actions/*.ts` and are the only place that mutates DB state.

## Conventions

- Server Components by default. Mark `"use client"` only when needed (forms, pollers, interactive UI).
- Always filter mutating queries by both the primary key and `owner_id` (belt-and-braces with RLS — see the existing server actions).
- After a mutation, `revalidatePath(...)` every route that displays the changed data (the existing actions show the right paths for projects / AI / run / logs).
- The AI generator's Zod schema must stay fully-required — OpenAI strict mode via AI SDK 6 rejects `optional()`.
- Supabase `createServerClient` cookie `setAll` may be called from a Server Component; swallow the thrown error (middleware owns the actual refresh). The existing helper already does this.
- `[v0]` prefixed `console.log` lines are the convention for non-fatal server diagnostics.
