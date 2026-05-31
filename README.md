# UDD Web

UDD ("u did dat") is a single-user AI dev cockpit for turning an idea into a real saved Next.js project. Users create projects, prompt AI generation or edits, inspect persisted files and logs, and start a bounded local Next.js preview only after saved files pass validation.

The product deliberately avoids simulated success states. A task is not complete until files are persisted, a preview URL is not shown until a real local dev server responds, and generated output is rejected before persistence when validation finds blocking issues.

## Contents

- [What UDD Does](#what-udd-does)
- [Stack](#stack)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Commands](#commands)
- [Database](#database)
- [Architecture](#architecture)
- [Key Workflows](#key-workflows)
- [Routes](#routes)
- [Local Preview Runtime](#local-preview-runtime)
- [Deployment](#deployment)
- [Repository Structure](#repository-structure)
- [Development Notes](#development-notes)
- [Troubleshooting](#troubleshooting)

## What UDD Does

UDD is focused on a narrow app-building loop:

1. Create a project from an idea.
2. Submit an AI prompt to scaffold, edit, refactor, explain, or repair project files.
3. Stream task progress into persisted task events.
4. Validate generated files before saving them.
5. Persist validated files into `project_files`.
6. Inspect saved files, task history, run logs, and settings.
7. Start a local Next.js preview from saved files when the project shape supports it.

UDD is not a general web IDE, cloud sandbox, public hosting service, or deployment/publishing product. The runtime starts local previews only; it does not publish generated apps.

## Stack

| Area | Technology |
| --- | --- |
| Framework | Next.js 16 App Router |
| UI | React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Radix UI, lucide-react |
| Auth | Better Auth with Drizzle adapter and cookie sessions |
| Database | PostgreSQL via `postgres` and Drizzle ORM |
| AI | AI SDK v6 `streamText` with direct OpenAI, Anthropic, or Ollama-compatible providers |
| Validation | Custom static validation using `@babel/parser`, dependency checks, semantic checks, and project-shape checks |
| Runtime | Server-side local Next.js preview launcher using temp workspaces and the repo's installed `node_modules` |
| Package manager | pnpm (`pnpm-lock.yaml` is the canonical lockfile) |
| Container | Docker standalone Next.js output with `/api/health` healthcheck |

## Quick Start

Prerequisites:

- Node.js LTS with Corepack enabled.
- pnpm.
- PostgreSQL database reachable through `DATABASE_URL`.
- At least one usable AI provider path: a saved OpenAI/Anthropic key in Settings after login, or an Ollama-compatible endpoint through env vars.

```bash
corepack enable
pnpm install
```

Create local environment values. If `.env.local` already exists, update it rather than overwriting it.

```bash
cp .env.example .env.local
```

Apply the Drizzle migration to your database:

```bash
pnpm exec drizzle-kit migrate
```

Start the development server:

```bash
pnpm dev
```

Open `http://localhost:3000`, create an account, configure an AI provider credential in Settings when needed, then create a project.

## Environment Variables

The checked-in `.env.example` is the safest starting point. Keep real values in `.env.local` or deployment secrets.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string used by Drizzle, Better Auth, app queries, and migrations. |
| `BETTER_AUTH_SECRET` | Yes | Secret used by Better Auth. Use a long random value. |
| `BETTER_AUTH_URL` | Yes | Public app origin for Better Auth, for example `http://localhost:3000` locally. |
| `UDD_SECRET_KEY` | Yes | Server-only encryption key for stored user provider credentials. |
| `UDD_AI_PROVIDER` | No | Default provider id. Source supports `openai`, `anthropic`, and `ollama`; fallback is `openai`. |
| `UDD_DEFAULT_AI_BASE_URL` | Optional | Enables the Ollama/self-hosted provider path and is used as the default Ollama-compatible base URL. |
| `UDD_DEFAULT_AI_MODEL` | Optional | Ollama/self-hosted model name. Defaults to `qwen2.5-coder`. |
| `UDD_DEFAULT_AI_API_KEY` | Optional | API key for the Ollama-compatible endpoint. Defaults to `ollama`. |

Credential behavior:

- OpenAI and Anthropic generation currently require a saved per-user provider credential unless you are using a custom direct-provider configuration that supplies one.
- Stored user API keys are encrypted before insertion into `user_secrets` and are never returned to the client.
- Ollama/self-hosted usage is selected when `UDD_DEFAULT_AI_BASE_URL` is set.

## Commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the Next.js development server. |
| `pnpm build` | Build the production app. TypeScript build errors are not ignored. |
| `pnpm start` | Start the built Next.js app. |
| `pnpm lint` | Run ESLint across the repo. |
| `pnpm typecheck` | Run `tsc --noEmit`. |
| `pnpm test` | Run the current non-runtime verification gate: ESLint plus TypeScript. |
| `pnpm exec drizzle-kit migrate` | Apply migrations from `drizzle/` using `drizzle.config.ts`. |
| `pnpm exec drizzle-kit generate` | Generate a new Drizzle migration after schema changes. |

There are no dedicated unit or integration tests yet. The `pnpm test` script is intentionally a static verification gate (`eslint . && tsc --noEmit`); use `pnpm build` as the heavier production-build check.

## Database

The current application schema is defined in `lib/db/schema/*` and exported from `lib/db/schema/index.ts`. Drizzle configuration lives in `drizzle.config.ts`, with generated SQL migration output under `drizzle/`.

Core tables:

| Table | Purpose |
| --- | --- |
| `user`, `session`, `account`, `verification` | Better Auth user and session tables. |
| `profiles` | User profile metadata created alongside auth users. |
| `projects` | User-owned project records and project lifecycle state. |
| `project_files` | Persisted source files. This is the source of truth for the Files tab and runtime preview. |
| `prompts` | User-authored prompt history. |
| `ai_tasks` | AI work items with status, input, staged output, errors, and optional linked run session. |
| `ai_task_events` | Progress, validation, completion, and failure events for AI tasks. |
| `run_sessions` | Local preview lifecycle records. |
| `run_events` | Runtime validation, process output, readiness, and cleanup logs. |
| `provider_configs` | Per-user provider preferences and optional provider metadata such as custom base URLs. |
| `user_secrets` | Encrypted per-user provider credentials. |
| `previews`, `exports` | Forward-looking schema surfaces; current app code does not provide public preview/export behavior. |

The older idempotent SQL files under `scripts/` document and mirror pieces of the historical schema. Treat `lib/db/schema/*` plus `drizzle/` as the current Drizzle source of truth for this app.

## Architecture

### App Router

The app uses Next.js App Router with route groups:

- `app/(app)/*` contains authenticated desktop routes.
- `app/m/*` contains mobile-oriented routes.
- `app/auth/*` contains login, signup, logout, and auth error surfaces.
- `app/api/auth/[...all]/route.ts` is the Better Auth API handler.
- `app/api/health/route.ts` is a cheap process health endpoint for containers.

`middleware.ts` runs on Node.js, checks Better Auth session state, redirects unauthenticated users to `/auth/login`, and redirects between desktop and mobile route trees based on user agent. `?force=mobile` and `?force=desktop` override that routing for testing.

### UI Composition

Desktop and mobile share the same persisted project state but render different shells:

- `components/desktop/DesktopWorkspace.tsx` is the canonical desktop project workspace.
- `components/mobile/mobile-shell.tsx` and related mobile screens drive the mobile cockpit.
- `components/ui/*` contains shadcn/ui primitives configured by `components.json`.
- Server components load data; client components handle forms, pollers, local UI state, and interactive controls.

### Server Actions

Mutations live under `app/actions/*.ts`. These actions create projects, update settings, manage provider credentials, create/retry/cancel/repair AI tasks, and start/stop local preview runs.

Long-running AI and runtime work is scheduled with Next.js `after()` so the server action can return and the UI can show a pending/starting state before work continues in the background.

### AI Layer

The AI pipeline is split by responsibility:

- `lib/ai/classify.ts` classifies prompts into task kinds without a model call.
- `lib/ai/prompts.ts` builds the system and user prompts.
- `lib/ai/providers/index.ts` defines supported providers and default resolution.
- `lib/ai/providers/server.ts` creates provider-specific language model clients and resolves stored credentials/custom base URLs.
- `lib/ai/generator.ts` calls `streamText` and requires structured output with full file contents.
- `lib/ai/service.ts` owns task state transitions, events, validation, persistence, stale cleanup, and failure handling.
- `lib/ai/repair.ts` builds evidence-backed repair prompts from failed validation tasks.

### Validation Layer

`validateProject` in `lib/validation/index.ts` is pure and does no I/O. It runs these layers in order:

1. Structural validation: parser failures, empty/trivial files, JSON validity, extension mismatch.
2. Project-shape validation: Next.js entrypoints, layout, and package shape.
3. Dependency validation: declared dependencies vs bare imports.
4. Semantic validation: relative/alias imports, duplicate exports, client/server boundary checks, circular dependencies, case sensitivity.

Blocking issues fail the task before generated files are persisted. Warnings and info events are recorded but do not block completion.

### Runtime Layer

The runtime uses saved files, not raw model output, as the preview source of truth:

- `lib/runtime/executor.ts` loads files and performs real parse checks.
- `lib/runtime/local-preview.ts` prepares a bounded temp workspace and starts `next dev` on `127.0.0.1`.
- `lib/runtime/service.ts` owns run session transitions, run events, preview URL persistence, stop cleanup, and stale cleanup.

There are no WebSockets, realtime subscriptions, queue consumers, cron jobs, or autonomous background workers. UI progress is observed through poller components that call `router.refresh()` while tasks or run sessions are active.

## Key Workflows

### AI Generation

```text
createAITask
  -> insert prompt + pending ai_task
  -> after(() => runAITask(taskId))
  -> claim pending task as running
  -> resolve provider and credential
  -> stream structured AI output
  -> stage output on ai_tasks.output
  -> validate merged file set
  -> persist files into project_files
  -> mark task completed
```

Important invariants:

- `completed` means generated files were successfully persisted.
- Validation runs before persistence.
- Scaffold tasks replace the project file set; edit/refactor/explain/other tasks overlay generated files onto existing files.
- Failed tasks keep staged output for diagnostics and repair when available.

### Repair

Repair is a user-triggered action for failed validation tasks. It reloads the failed task, requires blocking validation evidence and staged output, builds a repair prompt, inserts a new AI task, and sends it through the same generation, validation, and persistence path as ordinary tasks.

### Local Preview Run

```text
startRunAction
  -> insert run_session with status starting
  -> after(() => driveSession(sessionId))
  -> load saved project_files
  -> parse/analyze files
  -> prepare temp Next.js workspace
  -> start local next dev process
  -> wait for HTTP readiness
  -> persist preview_url and mark running
```

Stop and stale cleanup clear `preview_url` and remove runtime workspace/process state.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Public entry route. |
| `/auth/login` | Login page. |
| `/auth/sign-up` | Signup page. |
| `/auth/logout` | Logout route. |
| `/projects` | Authenticated project list. |
| `/projects/new` | New project flow. |
| `/projects/[id]` | Canonical desktop project workspace. |
| `/projects/[id]/ai` | AI task detail/list route; desktop redirects into canonical workspace panel. |
| `/projects/[id]/files` | Saved file inspection route; desktop redirects into canonical workspace panel. |
| `/projects/[id]/logs` | Runtime/event logs route; desktop redirects into canonical workspace panel. |
| `/projects/[id]/run` | Local preview route; desktop redirects into canonical workspace panel. |
| `/projects/[id]/settings` | Project settings route; desktop redirects into canonical workspace panel. |
| `/settings` | Account/provider settings. |
| `/m/*` | Mobile equivalents of the app routes. |
| `/api/auth/[...all]` | Better Auth handler. |
| `/api/health` | Container/process healthcheck. |

## Local Preview Runtime

The preview runtime is intentionally bounded:

- Only saved project files are used.
- The preview shape must be a Next.js App Router project with `package.json`, `app/layout.*`, and root `app/page.*`.
- `package.json` must declare `next`, `react`, and `react-dom`.
- No package install is run for generated projects.
- Runtime files are written under the OS temp directory.
- Unsafe paths are rejected, including absolute paths, path traversal, NUL bytes, and reserved directories like `node_modules`, `.git`, and `.next`.
- The temp workspace symlinks this repo's installed `node_modules`.
- The process binds to `127.0.0.1` and has a scrubbed environment.
- The preview URL is recorded only after readiness receives an HTTP response.
- Preview TTL and stale cleanup are both 10 minutes in current source.

## Deployment

### Docker

The repository includes a multi-stage Dockerfile that builds standalone Next.js output and runs `node server.js` as a non-root user. The container exposes port `3000` and uses `/api/health` for health checks.

Example build and run:

```bash
docker build \
  --build-arg DATABASE_URL="$DATABASE_URL" \
  -t udd-web .

docker run --rm -p 3000:3000 \
  -e DATABASE_URL="$DATABASE_URL" \
  -e BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET" \
  -e BETTER_AUTH_URL="http://localhost:3000" \
  -e UDD_SECRET_KEY="$UDD_SECRET_KEY" \
  udd-web
```

For production, set all secrets through the orchestrator secret store. Do not bake real secrets into the image.

### Node or Vercel-style hosting

The app is a standard Next.js app with `output: 'standalone'`. Any deployment target must provide:

- `DATABASE_URL` at build/runtime where needed.
- Better Auth variables.
- `UDD_SECRET_KEY` for decrypting stored provider credentials.
- AI provider configuration or user-saved credentials.
- A runtime environment that permits the local preview child process behavior if preview runs should work.

Note that UDD's own preview runtime is local process orchestration. Deploying the UDD app does not make generated project previews public.

## Repository Structure

```text
app/                         Next.js App Router routes, layouts, API routes, and server actions
app/actions/                 Server actions for AI, projects, profile, provider configs, run sessions, and secrets
components/                  Desktop, mobile, app, auth, project, run, settings, and UI components
components/ui/               shadcn/ui primitives
hooks/                       Shared React hooks
lib/ai/                      Prompt classification, provider selection, generation, repair, and task service logic
lib/db/                      Drizzle client, schema, mappers, and query helpers
lib/runtime/                 Saved-file loading, parser checks, local preview process management, run service logic
lib/secrets/                 Server-only encryption/decryption and user secret helpers
lib/validation/              Pure project/file validation pipeline
lib/workspace/               Deterministic cockpit next-action derivation
scripts/                     Historical/idempotent SQL and smoke scripts
docs/                        Product truth, system state, and implementation context documents
drizzle/                     Generated Drizzle migration SQL
styles/                      Additional global style entrypoints
```

## Development Notes

- Keep `pnpm-lock.yaml` as the only root package lockfile.
- Prefer Server Components by default. Add `"use client"` only for forms, pollers, browser APIs, and interactive UI state.
- Use existing shadcn/ui primitives from `components/ui/*` before adding new primitives.
- Mutating server actions should confirm ownership with the authenticated user id, not just primary keys.
- After mutations, revalidate the routes that show changed data.
- Do not change the `AITaskResult` shape casually; it is shared by generation, task service, UI, validation, and runtime flows.
- Keep AI output schemas fully required. AI SDK structured output paths are strict about optional fields.
- Before changing behavior documented in `docs/system-state.md`, read the relevant section and update it in the same change if behavior changes.
- Preserve product truth: do not claim execution, preview, persistence, provider, deployment, or completion behavior that source code does not actually perform.

## Troubleshooting

### `pnpm build` fails during type checking

`next.config.mjs` has `typescript.ignoreBuildErrors: false`. Run:

```bash
pnpm typecheck
```

Fix the underlying TypeScript error instead of suppressing build-time type checking.

### AI generation says no provider key is configured

For OpenAI or Anthropic, save a provider credential in Settings for the signed-in user. For self-hosted/Ollama-compatible usage, set `UDD_DEFAULT_AI_BASE_URL` and optionally `UDD_DEFAULT_AI_MODEL` / `UDD_DEFAULT_AI_API_KEY`.

### Local preview fails with unsupported project shape

The saved generated project must include a valid `package.json`, `app/layout.*`, root `app/page.*`, and declared `next`, `react`, and `react-dom` dependencies. The runtime does not install missing packages for generated projects.

### Local preview never becomes public

That is expected. The runtime records local URLs only after a local Next process responds. It does not create public preview URLs or deployment targets.

### A task or run stays pending/starting after a restart

Long-running work is scheduled through `after()`. If the server restarts between response flush and background execution, the callback can be lost. Stale cleanup runs opportunistically on relevant page loads after the configured stale window, and users can retry pending/failed work from the UI.
