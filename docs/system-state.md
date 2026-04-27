# UDD System State

Canonical behavioral specification derived strictly from source code.
Every claim includes a file and line citation.
See CLAUDE.md for architecture overview, stack choices, Product Truth Contract, and conventions.
Maintained under the rules in CLAUDE.md §system-state.md Enforcement.

---

## AI Pipeline — Behavioral constants

### Named constants

| Constant                            | Value                      | Source                    |
| ----------------------------------- | -------------------------- | ------------------------- |
| `MAX_LIVE_TASKS_PER_USER`           | 3                          | app/actions/ai.ts:31      |
| `GENERATION_TIMEOUT_MS`             | 300 000 ms (5 min)         | lib/ai/service.ts:19      |
| `STALE_TASK_MS`                     | 600 000 ms (10 min)        | lib/ai/service.ts:262     |
| `MAX_VALIDATION_ISSUE_EVENTS`       | 50                         | lib/ai/service.ts:376     |
| Max output tokens — `scaffold`      | 8 000                      | lib/ai/generator.ts:15    |
| Max output tokens — all other kinds | 4 000                      | lib/ai/generator.ts:15    |
| Files per generation                | 1–8 (min/max on Zod array) | lib/ai/generator.ts:38–39 |

### Task state transitions

```
pending   → running    claim via conditional update eq("status","pending") (lib/ai/service.ts:87–99)
running   → completed  after validation passes AND persistFiles succeeds (lib/ai/service.ts:213–224)
running   → failed     on any error: generation, timeout, validation, or persistence (lib/ai/service.ts:246–258)
pending   → cancelled  via cancelAITask (app/actions/ai.ts:153–155)
running   → cancelled  via cancelAITask (app/actions/ai.ts:153–155)
pending   → failed     via stale reaper after STALE_TASK_MS from created_at (lib/ai/service.ts:281–295)
running   → failed     via stale reaper after STALE_TASK_MS from started_at (lib/ai/service.ts:281–295)
```

All transitions are conditional updates that return zero rows if another driver has already moved the task. (lib/ai/service.ts:87–99, 213–233)

### Staging vs persistence order

These four steps run sequentially inside `runAITask` and must not be reordered (see §Intentional Constraints):

1. Generator output staged to `ai_tasks.output` while `status='running'`. This preserves raw model output for diagnostics even if the persistence step subsequently fails. (lib/ai/service.ts:162–169)
2. `validateProject` called on the merged file-set. Blocking issues → throws → task ends `failed`, no files written. (lib/ai/service.ts:187–197)
3. `persistFiles` called — upserts to `project_files`. (lib/ai/service.ts:207)
4. Task marked `completed` only after step 3 returns without error. (lib/ai/service.ts:213–224)

---

## Validation Layer — Issue kinds, severities, and execution

### Pure function guarantee

`validateProject` performs no I/O and is safe to call from any context. (lib/validation/index.ts:40–41)

### Execution order

All four layers are always invoked in sequence on cached `FileAnalysis` results. (lib/validation/index.ts:64–70)

1. `structuralValidate` — lib/validation/structural.ts
2. `projectShapeValidate` — lib/validation/project-shape.ts
3. `dependencyValidate` — lib/validation/dependency.ts
4. `semanticValidate` — lib/validation/semantic.ts

Within `dependencyValidate`: if `package.json` is present but fails object validation, that layer emits `invalid_package_json` and returns early, skipping remaining dependency checks. Other layers are unaffected. (lib/validation/dependency.ts:55–65)

### Issue kinds

> Summary — canonical source: lib/validation/types.ts:12–28

| Kind                    | Layer         | Severity                                             | Trigger                                                                                                                                         |
| ----------------------- | ------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `parse_error`           | Structural    | blocking                                             | JS/TS file fails `@babel/parser`                                                                                                                |
| `empty_file`            | Structural    | blocking (JS/TS) · warning (text/unknown)            | File byte-length is zero                                                                                                                        |
| `trivial_file`          | Structural    | warning                                              | JS has only whitespace or bare `export {}`; JSON is `{}` or empty                                                                               |
| `extension_mismatch`    | Structural    | warning                                              | `.ts` file contains JSX nodes                                                                                                                   |
| `invalid_json`          | Structural    | blocking                                             | Any `.json` file fails `JSON.parse`                                                                                                             |
| `missing_entrypoint`    | Project-shape | blocking                                             | Bare imports exist but no `package.json`; or Next.js project has no `app/**/page.*`; or `package.json` `main`/`module` points to a missing file |
| `malformed_layout`      | Project-shape | blocking                                             | Next.js project is missing `app/layout.{tsx,ts,jsx,js}`                                                                                         |
| `invalid_package_json`  | Dependency    | blocking                                             | `package.json` parses as JSON but the result is not an object                                                                                   |
| `missing_dependency`    | Dependency    | blocking                                             | Bare import references a package not in `dependencies`, `devDependencies`, or `peerDependencies`                                                |
| `unused_dependency`     | Dependency    | info                                                 | Declared dep is never imported and is not in `ALWAYS_ALLOWED`, `KNOWN_INDIRECT_DEPS`, or `package.json` scripts                                 |
| `missing_import`        | Semantic      | blocking (value import) · warning (type-only import) | Relative or alias import resolves to no file in the project                                                                                     |
| `case_sensitivity`      | Semantic      | warning                                              | Import resolves to a file only case-insensitively                                                                                               |
| `duplicate_export`      | Semantic      | blocking                                             | Export name declared more than once in the same file                                                                                            |
| `client_imports_server` | Semantic      | blocking                                             | `"use client"` file imports a `"use server"` file                                                                                               |
| `circular_dependency`   | Semantic      | warning                                              | Cycle detected in import graph via DFS                                                                                                          |

Sources: lib/validation/structural.ts, lib/validation/project-shape.ts, lib/validation/dependency.ts, lib/validation/semantic.ts

### `ok` definition

`report.ok === true` iff `blockingCount === 0`. Warnings and info issues do not flip this bit. (lib/validation/index.ts:87)

### `newPaths` attribution rule

When `newPaths` is provided, issues are only attributed to files whose path is in that set. (lib/validation/semantic.ts:180–183, lib/validation/dependency.ts:127–130)

Files not in `newPaths` are still included in import resolution (so cross-file edges resolve correctly) but do not receive attributed blocking issues. `circular_dependency` is attributed if any single path in the cycle is in `newPaths`. (lib/validation/semantic.ts:163–164)

### Merge semantics for the file-set passed to `validateProject`

| Task `kind`                            | Merged file-set                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `scaffold`                             | Generated files only                                                                              |
| `edit`, `refactor`, `explain`, `other` | Existing `project_files` rows overlaid with generated files; generated files win on path conflict |

Source: lib/ai/service.ts:394–425

---

## Runtime Pipeline — State machine and behavioral constants

### Named constants

| Constant           | Value               | Source                     |
| ------------------ | ------------------- | -------------------------- |
| `STALE_SESSION_MS` | 600 000 ms (10 min) | lib/runtime/service.ts:279 |

### State machine

```
[none]           → starting   startRun inserts with status='starting' (lib/runtime/service.ts:28–36)
starting         → running    all files parse cleanly (lib/runtime/service.ts:226–237)
starting         → error      any file fails to parse (lib/runtime/service.ts:186–209)
starting         → error      no files found after loading (lib/runtime/service.ts:138–143)
running/starting → stopping   stopRun conditional update (lib/runtime/service.ts:76–83)
stopping         → stopped    stopRun second conditional update (lib/runtime/service.ts:101–105)
starting/running → error      stale reaper after STALE_SESSION_MS from started_at (lib/runtime/service.ts:286–307)
```

All transitions are conditional updates that no-op if a concurrent driver has already moved the session. (lib/runtime/service.ts:76–83, 101–105, 186–209, 226–237)

### File loading and fallback

`loadProjectFiles` resolves the file-set in this priority order: (lib/runtime/executor.ts:36–85)

1. `project_files` rows for the project — primary source of truth.
2. If `project_files` is empty: `output.files` from the most recent `ai_tasks` row with `status='completed'`, ordered by `finished_at desc limit 1`.
3. If both sources are empty: `driveSession` throws; session ends in `error`. (lib/runtime/service.ts:138–143)

### `analyzeFile` behavior per extension

| Extension(s)                                 | Parser                                                                 | Failure result                          |
| -------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| `.json`                                      | `JSON.parse`                                                           | `{ ok: false, message: <error text> }`  |
| `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.tsx` | `@babel/parser` with plugins: `typescript`, `jsx`, `decorators-legacy` | `{ ok: false, message: <parse error> }` |
| All other extensions                         | Byte-count only                                                        | Always `{ ok: true }`                   |

Source: lib/runtime/executor.ts:87, 99–134

### `preview_url` behavior

`run_sessions.preview_url` is **always `null`** at runtime. No code in the runtime pipeline writes to this column. (lib/runtime/service.ts:212–216)

The comment at lib/runtime/service.ts:212–216 states:

> "No preview URL is written: nothing is actually served, and a synthetic URL would violate the Preview Truth invariant in CLAUDE.md. preview_url stays NULL."

Nothing is booted, served, or previewed by the runtime pipeline.

---

## Provider Selection — Active provider resolution and credential handling

### Supported providers and option registry

Two AI providers are defined in the single `PROVIDERS` registry: `openai` (`openai/gpt-5-mini`) and `anthropic` (`anthropic/claude-opus-4.6`). UI option labels are derived from that registry by `getProviderOptions`, not duplicated in client components. (lib/ai/providers/index.ts:19–30, 59–62)

### Resolution and generation path

`getActiveProviderForOwner(ownerId, supabase)` first reads the user's active default `provider_configs` row for `kind='ai'`, then falls back to `getActiveProvider()`, which reads `UDD_AI_PROVIDER`, validates it with `isProviderId`, and defaults to `openai` when unset or invalid. (lib/ai/providers/server.ts:19–47, lib/ai/providers/index.ts:44–49)

`runAITask` resolves the active provider and then calls `getCredentialForProvider(ownerId, provider.id)`. If a stored credential exists, it passes the decrypted value into `generateResult` as `options.credential`. (lib/ai/service.ts:131–138)

`generateResult` converts a provided credential into AI Gateway request-scoped BYOK provider options: `providerOptions.gateway.only` is limited to the selected provider id, and `providerOptions.gateway.byok[provider.id]` contains `{ apiKey: credential }`. If no credential is stored, `providerOptions` is omitted and the existing environment-managed AI Gateway path remains the fallback. (lib/ai/generator.ts:18–31, 98–107)

Generation failures are normalized before being written to `ai_tasks.error` / `ai_task_events.payload.error`: AI Gateway authentication failures tell the operator to configure `AI_GATEWAY_API_KEY` or Vercel OIDC, while stored-credential authentication failures tell the user to replace or delete the saved provider credential. Secret values are not included in these messages. (lib/ai/service.ts:22–41)

### User surfaces

User-facing provider selection exists in Settings and the cockpit. Settings labels this surface as “Provider selection” / “Default provider” and says the default provider uses a saved key when present or environment credentials when available. (app/(app)/settings/page.tsx:70–79, components/settings/provider-form.tsx:66–89)

Settings and the cockpit switcher both write provider preference through `saveAIProviderConfig`; credentials are not stored in provider metadata, and secret-shaped metadata is rejected with copy pointing users to the credential manager. (components/settings/provider-form.tsx:45–60; components/ai/provider-switcher.tsx:35–51; app/actions/provider-configs.ts:13–44)

The cockpit page resolves the active provider, provider credential presence flags, and AI Gateway environment fallback state server-side, then passes them to `AIPromptForm`. (app/(app)/projects/[id]/page.tsx:92–102)

The cockpit renders provider readiness beside the input. Readiness is `Ready` when the selected provider has a saved credential or environment fallback is detected; otherwise it is `Credential needed`, the submit button is disabled, and an inline password input can save the missing credential without leaving the cockpit. Saved keys are never shown back after save. (components/ai/ai-prompt-form.tsx:70–104, 150–183, 220–224; components/ai/provider-credential-control.tsx:51–64, 86–153)

Settings remains the safe credential-management surface for normal replacement/deletion. It lists each provider, renders save/replace/delete controls through `ProviderCredentialControl`, and states that saved keys are validated before encryption and never shown after save. (app/(app)/settings/page.tsx:33–43, 75–79; components/settings/provider-form.tsx:99–124; components/ai/provider-credential-control.tsx:51–81, 121–153)

### Credential handling — BYOK runtime surface

**Storage**: User API keys are stored encrypted in the `user_secrets` table. Encryption is AES-256-GCM using a key derived from `UDD_SECRET_KEY` (SHA-256). `encrypted_value` holds ciphertext only — no plaintext key is ever written to the database. `lib/secrets/crypto.ts` is `server-only` and may not be imported in client code. (lib/secrets/crypto.ts, lib/secrets/index.ts, scripts/005_user_secrets.sql)

**Server actions**: `app/actions/secrets.ts` exposes three actions — `saveProviderCredential`, `deleteProviderCredential`, and `getProviderCredentialStatuses`. `saveProviderCredential` validates the supplied key with the selected upstream provider before calling `saveSecret`; failed validation throws and does not persist the value. `deleteProviderCredential` removes the encrypted row. The status action returns `Record<ProviderId, boolean>` (presence flags only); no secret value is ever returned to any caller. (app/actions/secrets.ts:11–89, 92–121)

**Generation resolution**: `runAITask` calls `getCredentialForProvider(ownerId, provider.id)` immediately after provider selection. If a credential is stored for the active provider, it is decrypted server-side and passed to `generateResult` via `options.credential`. (lib/ai/providers/server.ts:50–59, lib/ai/service.ts:131–138)

**Credential use in API calls**: The resolved credential is forwarded to `streamText` as request-scoped AI Gateway BYOK provider options for the selected provider. No credential is logged, written to events, returned to the client, or included in task output. If no credential is stored, the existing environment-managed AI Gateway path is used. (lib/ai/generator.ts:18–31, 98–107; lib/ai/service.ts:149–178)

**Provider readiness**: Readiness flags are derived from encrypted-secret presence via `hasSecret` and from a conservative environment fallback check for `AI_GATEWAY_API_KEY` or Vercel. The client receives booleans only, not credential values. (lib/ai/providers/server.ts:62–74; app/(app)/projects/[id]/page.tsx:92–102; app/(app)/settings/page.tsx:33–43, 75–79)

**Legacy**: `provider_configs.secret_ref` remains null. User credentials are in `user_secrets`, not `provider_configs`. `saveAIProviderConfig` continues to reject secret-shaped metadata and directs users to the credential manager. (app/actions/provider-configs.ts:13–44, 61–82, scripts/004_document_forward_looking.sql:10–13)

---

## Schema surfaces — No current app-code callers

Each surface below is labeled **schema only — no app code callers**.

| Surface                              | Schema location              | Status                                          | Source                                                 |
| ------------------------------------ | ---------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| `exports` table                      | scripts/001_init_schema.sql  | schema only — no app code callers               | scripts/004_document_forward_looking.sql               |
| `previews` table                     | scripts/001_init_schema.sql  | schema only — no app code callers               | Verified by reading all files in lib/ and app/actions/ |
| `provider_configs.secret_ref` column | scripts/001_init_schema.sql  | schema only — always null — no app code callers | scripts/004_document_forward_looking.sql               |
| `user_secrets` table                 | scripts/005_user_secrets.sql | active — read/write by lib/secrets/index.ts     | lib/secrets/index.ts, app/actions/secrets.ts           |
| `run_sessions.preview_url` column    | scripts/001_init_schema.sql  | schema only — always null — no app code callers | lib/runtime/service.ts:212–216                         |

From scripts/004_document_forward_looking.sql:

- `exports`: _"Schema + RLS are in place; no application code reads or writes this table yet. Kept so the export feature can land without a migration."_
- `provider_configs.secret_ref`: _"Always null today — user credentials live in user_secrets. Never store raw secrets in this column."_

---

## Progress observation

### Poller components

| Component    | Interval | Active when                                                           | Source                                                                       |
| ------------ | -------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `TaskPoller` | 800 ms   | `anyInFlight` — any task has `status` `pending` or `running`          | components/ai/task-poller.tsx:17, app/(app)/projects/[id]/ai/page.tsx:55     |
| `RunPoller`  | 700 ms   | `inFlight` — session `status` is `starting`, `running`, or `stopping` | components/run/run-poller.tsx:17, app/(app)/projects/[id]/run/page.tsx:77–78 |

### Mechanism

Both pollers call `router.refresh()` on each tick. (components/ai/task-poller.tsx:17, components/run/run-poller.tsx:17)

`router.refresh()` triggers a full re-fetch of the server component tree for the current route. The server component re-queries Supabase and returns the updated state. There is no incremental or delta mechanism.

Polling starts when the component mounts with `active=true`. Polling stops when `active` becomes `false` or the component unmounts. The interval is cleared in the `useEffect` cleanup function. (components/ai/task-poller.tsx:14–20, components/run/run-poller.tsx:14–20)

### Explicit absence

There are no WebSocket connections, no Supabase Realtime subscriptions, and no server-sent events in the codebase. All client-side state updates are driven exclusively by these two polling components.

---

## Cockpit Conversation Reconstruction

The project cockpit reconstructs recent conversation context directly from existing persisted records. On each server render it loads up to six recent `ai_tasks`, up to two recent `run_sessions`, the current `project_files` summary, and then fetches the referenced `prompts`, `ai_task_events`, and `run_events` rows for those recent records. (app/(app)/projects/[id]/page.tsx:78–107, 120–156, 158–190)

Conversation entries are built in memory from those rows and sorted by their persisted `created_at` timestamps. A user bubble is rendered only from a recorded prompt: `prompts.body` via `ai_tasks.prompt_id`, falling back to `ai_tasks.input.prompt` when no prompt row is available. Project metadata is not rendered as a user-authored message. (app/(app)/projects/[id]/page.tsx:271–285, 304–312, 622–633)

Task assistant entries are derived from `ai_tasks.status`, timestamps, `ai_tasks.output`, `ai_tasks.error`, and grouped `ai_task_events`. Pending and running copy is status-backed; running progress uses the latest persisted `progress` event; completed generated output uses staged task output plus the completed event file count when present; failed staged output is labeled diagnostic and not presented as saved. Validation summaries and blocking issue callouts come from persisted `validation` events. (app/(app)/projects/[id]/page.tsx:337–346, 349–420, 567–595, 636–660, 694–699)

Validation-check conversation entries are derived from recent `run_sessions` and grouped `run_events`. Their copy describes parser validation only and explicitly says no app is served or previewed while showing the latest relevant persisted parser output. (app/(app)/projects/[id]/page.tsx:425–467, 598–619, 663–681)

The cockpit pollers remain refresh-based: polling is active when any recent task is `pending`/`running` or any recent run session is `starting`/`running`/`stopping`, then `TaskPoller` and `RunPoller` re-fetch the server component tree. (app/(app)/projects/[id]/page.tsx:195–205, 250–251; components/ai/task-poller.tsx:14–20; components/run/run-poller.tsx:14–20)

---

## Execution Semantics — Invocation and Ownership

### User-triggered

All of the following require an explicit user action (form submission or button press):

| Action                               | Server action            | Source                |
| ------------------------------------ | ------------------------ | --------------------- |
| Submit AI prompt                     | `createAITask`           | app/actions/ai.ts:51  |
| Retry a task still in `pending`      | `retryPendingTask`       | app/actions/ai.ts:115 |
| Retry a `failed` or `cancelled` task | `retryFailedTask`        | app/actions/ai.ts:189 |
| Cancel a `pending` or `running` task | `cancelAITask`           | app/actions/ai.ts:138 |
| Delete a terminal-state task         | `deleteAITask`           | app/actions/ai.ts:165 |
| Start a run session                  | `startRunAction`         | app/actions/run.ts:13 |
| Stop a run session                   | `stopRunAction`          | app/actions/run.ts:32 |
| Start a run from a completed AI task | `startRunFromTaskAction` | app/actions/run.ts:49 |

### System-triggered (via `after()`, runs after HTTP response flushes)

| Work unit                    | Scheduled by                                                | Source                     |
| ---------------------------- | ----------------------------------------------------------- | -------------------------- |
| `runAITask(taskId)`          | `createAITask`                                              | app/actions/ai.ts:102–104  |
| `runAITask(taskId)`          | `retryFailedTask`                                           | app/actions/ai.ts:228–230  |
| `runAITask(taskId)`          | `retryPendingTask`                                          | app/actions/ai.ts:125–127  |
| `driveSession(sessionId)`    | `startRunAction`                                            | app/actions/run.ts:19–21   |
| `driveSession(newSessionId)` | `startRunFromTaskAction` (when it wins the link-claim race) | app/actions/run.ts:109–111 |
| `validateProject(...)`       | Inside `runAITask` — not directly callable by user          | lib/ai/service.ts:187      |

### Page-load triggered (opportunistic, on server render)

| Function            | Page                                  | Source                                  |
| ------------------- | ------------------------------------- | --------------------------------------- |
| `reapStaleTasks`    | AI tab (`/projects/[id]/ai`) render   | app/(app)/projects/[id]/ai/page.tsx:44  |
| `reapStaleSessions` | Run tab (`/projects/[id]/run`) render | app/(app)/projects/[id]/run/page.tsx:35 |

### Explicit absence of automation

- No cron jobs exist in the codebase.
- No background workers, queue consumers, or event listeners exist.
- No automatic task-to-run chaining: a run session is created only when the user explicitly calls `startRunAction` or `startRunFromTaskAction`. (app/actions/run.ts:13, 49)
- No automatic fail-to-retry: a failed task is retried only when the user explicitly calls `retryFailedTask`. (app/actions/ai.ts:189)
- No autonomous agent behavior exists in the codebase.

### If `after()` does not complete

If the server restarts between returning the HTTP response and executing the `after()` callback, the scheduled `runAITask` or `driveSession` call is lost. The task or session remains in its pre-execution state (`pending` or `starting`) indefinitely. On the user's next visit to the relevant tab, the stale reaper will mark it `failed`/`error` once `STALE_TASK_MS` (10 min) has elapsed. For AI tasks still in `pending`, the user may also trigger `retryPendingTask` manually. (lib/ai/service.ts:262–295, app/actions/ai.ts:115–130, app/(app)/projects/[id]/ai/page.tsx:44)

---

## Intentional Constraints (Non-derivable from code)

> These constraints are design commitments. They are not enforced by runtime checks and must be preserved by convention.

**1. `completed` implies fully persisted `project_files`.**

`ai_tasks.status='completed'` must only be written after `persistFiles` returns without error. (lib/ai/service.ts:207, 213–224: the completed transition is gated on `status='running'` and is only reached after the persistence call succeeds.)

_Why_: The Files tab and the runtime pipeline read `project_files` without checking task status. A task marked `completed` with missing or empty files would silently produce an incorrect view of the project state.

**2. `validateProject` must run before `persistFiles`, never after.**

The call sequence inside `runAITask` is: generate → stage → validate → persist → complete. (lib/ai/service.ts:187–207) This order must not be changed.

_Why_: Validation's purpose is to prevent structurally or semantically invalid output from reaching `project_files`. Moving validation after persistence would allow invalid files to become visible in the Files tab and runtime before the task fails, producing corrupt project state.

**3. `scaffold` kind must replace the project file set, not merge with it.**

For `kind='scaffold'`, paths not present in the generated output are pruned from `project_files` after the upsert. (lib/ai/service.ts:341–372)

_Why_: "Scaffold" means a full re-layout. Treating it as additive would silently accumulate stale paths from prior scaffold runs, producing a mixed-generation file set the user did not request.

**4. `run_sessions.preview_url` must remain `null` until real serving infrastructure exists.**

No code may write a synthetic, placeholder, or local URL to this column. (lib/runtime/service.ts:212–216)

_Why_: Writing a fake URL violates the Preview Truth invariant in CLAUDE.md §Product Truth Contract. The column exists as forward-looking schema surface only.

**5. `after()` must be used for all AI and runtime background work.**

`runAITask` and `driveSession` must be scheduled via `after()`, not awaited inline in the server action. (app/actions/ai.ts:102–104, app/actions/run.ts:19–21)

_Why_: The task or session row must be inserted and visible in the UI before background execution begins. Awaiting inline would block the HTTP response until model generation or file parsing completes, preventing visible progress state from ever rendering.
