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

UDD ("Universal Dev Desktop") is a single-user Next.js app that turns ideas into working codebases. A user drafts a project, runs AI tasks against it, and executes those generated files in a lightweight runtime that validates them with a real parser before starting a bounded local preview when the saved project shape supports it.

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
- `lib/runtime/local-preview.ts` — server-only bounded local preview helper. It writes validated saved files into an OS temp workspace, rejects unsafe paths and unsupported project shapes, symlinks the app's installed `node_modules`, starts `next dev` on `127.0.0.1` with a scrubbed environment, captures stdout/stderr, waits for a real HTTP response, and cleans up on stop/stale timeout.
- `lib/runtime/service.ts` — `startRun` / `driveSession` / `stopRun`. Writes `run_events` rows that reflect actual parse outcomes (`ok path bytes` / `FAIL path: message`), workspace preparation, process output, readiness, failures, and cleanup. Any parse, shape, dependency, startup, or runtime failure transitions the session to `status='error'`. `run_sessions.preview_url` is written only after a real local preview process is reachable; otherwise it remains `NULL`.
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

## system-state.md Enforcement

Before modifying any behavior described in `docs/system-state.md`:

- Read the relevant section of `docs/system-state.md`.
- Confirm the section accurately reflects current source.
- If the behavior is altered by the change, update `docs/system-state.md` in the same commit.
- Do not rely on remembered summaries — reference the document directly by section header.

This applies to: AI pipeline, validation layer, runtime pipeline, execution semantics, and schema surfaces with no callers.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **udd-web** (2423 symbols, 4844 relationships, 128 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/udd-web/context` | Codebase overview, check index freshness |
| `gitnexus://repo/udd-web/clusters` | All functional areas |
| `gitnexus://repo/udd-web/processes` | All execution flows |
| `gitnexus://repo/udd-web/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Repo Intelligence Tooling

GitNexus and Gortex may both be installed.

Use GitNexus when existing project instructions explicitly require:
- gitnexus analyze
- gitnexus detect-changes
- GitNexus impact checks
- GitNexus metadata refresh

Use Gortex when deeper graph context is needed:
- symbol lookup
- call chains
- smart_context
- test target discovery
- contract checks
- cross-file or cross-repo impact analysis

Do not run both tools redundantly unless the task is high risk or one tool gives incomplete results.

If outputs disagree, stop and report the disagreement before editing.

<!-- gortex:communities:start -->
## Codebase Overview (generated by Gortex)

- **Languages:** typescript (primary), contract, css, javascript, json, markdown, sql, yaml
- **Most-referenced symbols:** `createClient` (29 usages), `getUser` (28 usages), `update` (27 usages), `formatRelative` (14 usages), `writeEvent` (13 usages), `plural` (8 usages), `writeEvent` (8 usages), `stopNextDevPreview` (6 usages), `isProviderId` (6 usages), `toMobileProject` (6 usages)
- **Graph size:** 1528 nodes, 3987 edges
- **Breakdown:** 14 contracts, 270 files, 521 functions, 26 interfaces, 141 types, 556 variables

## Working with this codebase (Gortex tools available)

Gortex is running as an MCP server. Prefer graph queries over file reads:

| Instead of... | Use... |
|---|---|
| Reading a file to find a function | `get_symbol` or `get_editing_context` |
| Grep for all references | `find_usages` |
| Reading multiple files to trace a call | `get_call_chain` / `get_callers` |
| Guessing an import path | `find_import_path` |
| Assessing change scope | `explain_change_impact` |
| Scoping queries to a repo or project | Pass `repo`, `project`, or `ref` param to query tools |
| Managing repos at runtime | `track_repository` / `untrack_repository` |

**Workflow:** Before editing any file, call `get_editing_context("<file>")` first.
Before any refactor affecting a shared type or function, call `explain_change_impact`.

## Session start (Gortex)
1. Call `graph_stats` to confirm Gortex is running and get repo orientation.
2. If `total_nodes` is 0, call `index_repository` with path ".".
3. In multi-repo mode, call `get_active_project` to check scope.
4. For every file you are about to edit, call `get_editing_context` first.

<!-- gortex:skills:start -->
## Community Skills

| Area | Description | Skill |
|------|-------------|-------|
| Runtime | 14 symbols | `/gortex-runtime` |
| Id | 10 symbols | `/gortex-id` |
| App Actions | 8 symbols | `/gortex-app-actions` |
| Scripts | 8 symbols | `/gortex-scripts` |
| App App Projects Id Logs | 8 symbols | `/gortex-app-app-projects-id-logs` |
| Actions | 7 symbols | `/gortex-actions` |
| Validation | 7 symbols | `/gortex-validation` |
| Scripts | 6 symbols | `/gortex-scripts` |
| Runtime | 6 symbols | `/gortex-runtime` |
| Hooks | 5 symbols | `/gortex-hooks` |
| Ui | 5 symbols | `/gortex-ui` |
| Ui | 5 symbols | `/gortex-ui` |
| Actions | 5 symbols | `/gortex-actions` |
| Hooks | 5 symbols | `/gortex-hooks` |
| Workspace | 5 symbols | `/gortex-workspace` |
| Ui | 5 symbols | `/gortex-ui` |
| Validation | 5 symbols | `/gortex-validation` |
| Runtime | 5 symbols | `/gortex-runtime` |
| App Actions | 5 symbols | `/gortex-app-actions` |
| Id | 4 symbols | `/gortex-id` |
<!-- gortex:skills:end -->

<!-- gortex:communities:end -->
