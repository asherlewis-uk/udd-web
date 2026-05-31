# UDD System State

Canonical behavioral specification derived strictly from source code.
Every claim includes a file and line citation.
See CLAUDE.md for architecture overview, stack choices, Product Truth Contract, and conventions.
Maintained under the rules in CLAUDE.md §system-state.md Enforcement.

---

## AI Pipeline — Behavioral constants

### AI named constants

| Constant                            | Value                      | Source                    |
| ----------------------------------- | -------------------------- | ------------------------- |
| `MAX_LIVE_TASKS_PER_USER`           | 3                          | app/actions/ai.ts:31      |
| `GENERATION_TIMEOUT_MS`             | 300 000 ms (5 min)         | lib/ai/service.ts:19      |
| `STALE_TASK_MS`                     | 600 000 ms (10 min)        | lib/ai/service.ts:262     |
| `MAX_VALIDATION_ISSUE_EVENTS`       | 50                         | lib/ai/service.ts:376     |
| `MAX_REPAIR_ISSUES_IN_PROMPT`       | 20                         | lib/ai/repair.ts:7        |
| `MAX_REPAIR_FILES_IN_PROMPT`        | 8                          | lib/ai/repair.ts:8        |
| Max output tokens — `scaffold`      | 8 000                      | lib/ai/generator.ts:15    |
| Max output tokens — all other kinds | 4 000                      | lib/ai/generator.ts:15    |
| Files per generation                | 1–8 (min/max on Zod array) | lib/ai/generator.ts:38–39 |

### Task state transitions

```text
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

### Validation-to-repair loop

Repair is an explicit user action, not automatic recovery. `repairFailedTask` accepts a failed task id and project id, reloads the source task by `id`, `project_id`, and `owner_id`, and rejects anything that is not currently `status='failed'`. (app/actions/ai.ts:262–284)

The repair action uses stored validation evidence from the failed work item. It reads `ai_task_events` for `kind='validation'`, extracts the summary and blocking issue payloads, and refuses to create a repair task unless blocking validation evidence exists. (app/actions/ai.ts:286–302, 386–417)

The repair action also requires the failed task's staged output. If `ai_tasks.output` does not contain generated files, repair creation fails instead of inventing a repair target. (app/actions/ai.ts:304–308, 419–444)

Repair tasks are ordinary `ai_tasks` rows with existing `kind` values plus explicit `input.repair` metadata. `repairTaskKindFor` keeps scaffold repair as `kind='scaffold'` so scaffold replacement semantics still apply; every other repair is stored as `kind='edit'` and is checked against the saved file set. The task input stores `source_task_id`, source kind/title/error, validation summary, blocking issues, and generated file paths. (lib/ai/repair.ts:26–44, app/actions/ai.ts:332–354)

The model prompt for repair is built from the original request or repair display text, the recorded task error, the validation summary, the blocking validation issues, and the failed generated file contents. The prompt explicitly says the failed output was not saved and that validation/persistence decide success after the response. (lib/ai/repair.ts:83–125)

After a repair task is inserted, `repairFailedTask` schedules the same `runAITask(fresh.id)` background path used by ordinary generation. Therefore repair output is staged, validated with `validateProject`, persisted by `persistFiles`, and marked `completed` only through the same validation-before-persistence gate described above. (app/actions/ai.ts:368–379, lib/ai/service.ts:162–224)

Failed repairs remain normal failed tasks. Because repair tasks carry `input.repair`, the primary cockpit's mobile conversation adapter labels them as repair runs, shows the failed source task id, keeps diagnostic output separate from saved proof, and exposes evidence-backed repair actions when blocking validation evidence is present. (app/(app)/projects/[id]/page.tsx:409–595; components/mobile/chat-build-screen.tsx:189–217)

The deterministic cockpit next action has repair-specific blocked states only when the latest failed task has blocking validation evidence. It first checks active provider readiness because repair is another generation task; when ready, the primary mobile cockpit renders an inline form that calls `repairFailedTask` with the failed task id. This is repair-specific recovery from stored evidence, not predictive next-action orchestration. (lib/workspace/next-action.ts:216–239, 484–513; components/mobile/chat-build-screen.tsx:288–302)

The AI inspection route also exposes repair for failed validation tasks: task detail labels repair tasks from `input.repair` and renders a `Repair` button only when validation events contain a blocking issue. (components/ai/task-detail.tsx:34–69, 313–342)

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

| Task `kind`                                                 | Merged file-set                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `scaffold` (including scaffold repair)                      | Generated files only                                                                              |
| `edit`, `refactor`, `explain`, `other`, non-scaffold repair | Existing `project_files` rows overlaid with generated files; generated files win on path conflict |

Source: lib/ai/service.ts:394–425, lib/ai/repair.ts:42–44

---

## Runtime Pipeline — State machine and behavioral constants

### Runtime named constants

| Constant                   | Value               | Source                          |
| -------------------------- | ------------------- | ------------------------------- |
| `STALE_SESSION_MS`         | 600 000 ms (10 min) | lib/runtime/service.ts:331      |
| `PREVIEW_START_TIMEOUT_MS` | 30 000 ms (30 sec)  | lib/runtime/local-preview.ts:13 |
| `PREVIEW_TTL_MS`           | 600 000 ms (10 min) | lib/runtime/local-preview.ts:14 |
| `MAX_RUNTIME_FILE_COUNT`   | 120 files           | lib/runtime/local-preview.ts:15 |
| `MAX_RUNTIME_BYTES`        | 2 097 152 bytes     | lib/runtime/local-preview.ts:16 |

### State machine

```text
[none]           → starting   startRun inserts with status='starting', preview_url=null, error=null (lib/runtime/service.ts:16–58)
starting         → running    files parse cleanly, local Next preview starts, HTTP readiness succeeds, and preview_url is persisted (lib/runtime/service.ts:245–295; lib/runtime/local-preview.ts:59–129)
starting         → error      no files found after loading (lib/runtime/service.ts:165–170)
starting         → error      any file fails to parse (lib/runtime/service.ts:218–238)
starting         → error      unsupported preview shape, unsupported dependency, startup timeout, or process exit before readiness (lib/runtime/local-preview.ts:218–252, 431–465; lib/runtime/service.ts:305–322)
running          → error      local preview process exits outside an explicit stop flow (lib/runtime/service.ts:388–414)
running/starting → stopping   stopRun conditional update (lib/runtime/service.ts:78–104)
stopping         → stopped    stopRun kills the preview process, removes the temp workspace, clears preview_url, and writes stopped_at (lib/runtime/service.ts:114–131; lib/runtime/local-preview.ts:133–144)
starting/running → error      stale reaper after STALE_SESSION_MS from started_at; it also attempts preview cleanup first (lib/runtime/service.ts:338–385)
```

All terminal/promoting transitions are conditional updates that no-op if a concurrent driver or stop action has already moved the session. (lib/runtime/service.ts:94–104, 119–131, 218–232, 275–287, 393–405)

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

`run_sessions.preview_url` is `null` when a run is queued, validating, stopped, or errored. It is written only after `startNextDevPreview` has started a real `next dev` process on `127.0.0.1`, the readiness probe has received an HTTP response, and `driveSession` conditionally promotes the session to `status='running'`. (lib/runtime/service.ts:245–295; lib/runtime/local-preview.ts:59–129)

The stored URL is a real local endpoint of the form `http://127.0.0.1:<port>`, not a synthetic preview hostname. The helper allocates an available local port and the launcher starts Next with `--hostname 127.0.0.1 --port <port>`. (lib/runtime/local-preview.ts:68–79, 473–488, 573–585)

The primary mobile cockpit and the mobile Run route both convert the latest `run_sessions.preview_url` into `MobileRunSession.previewUrl` and pass it to `PreviewScreen`. `PreviewScreen` embeds an iframe only when `status === 'running'` and a URL exists. If a session is marked running with no URL, the mobile preview surface shows a missing-endpoint error instead of implying a live preview. (app/(app)/projects/[id]/page.tsx:278–312; app/(app)/projects/[id]/run/page.tsx:37–111; components/mobile/preview-route-screen.tsx; components/mobile/mobile-shell.tsx:61–70; components/mobile/preview-screen.tsx:27–75, 160–166)

The mobile project actions menu exposes “Open in Browser” only under the same `previewUrl && status === 'running'` condition, disables preview start when there are no saved files, and its start/stop controls call the real runtime server actions. The desktop Run page remains a detail surface that selects `preview_url` and passes it to `PreviewPanel`; `PreviewPanel` also embeds an iframe only when `status === 'running'` and a URL exists. (components/mobile/project-actions-menu.tsx:93–110, 251–319; app/(app)/projects/[id]/run/page.tsx:37–122; components/run/preview-panel.tsx:22–57)

Stop, stale cleanup, startup failure, parser failure, and process-exit failure all clear `preview_url`. (lib/runtime/service.ts:119–126, 218–232, 305–322, 367–373, 393–400)

### Supported local preview shape and boundaries

The bounded preview path is currently Next App Router only. Saved files must include `package.json`, `app/layout.{tsx,ts,jsx,js}`, and root `app/page.{tsx,ts,jsx,js}`. `package.json` must declare `next`, `react`, and `react-dom`. (lib/runtime/local-preview.ts:20, 217–251)

The runtime does not install packages. Declared dependencies must already be available in UDD's own installed dependencies, otherwise startup fails visibly before a process is launched. (lib/runtime/local-preview.ts:239–244, 279–286)

Before writing the temp workspace, runtime file paths are normalized and rejected if they are absolute, escape the project, contain NUL, or target reserved directories such as `node_modules`, `.git`, or `.next`. (lib/runtime/local-preview.ts:205–215, 293–315)

The workspace is created under the OS temp directory, receives only the saved files plus runtime-only support files when needed (`tsconfig.json`, `next-env.d.ts`, and Tailwind PostCSS config), and symlinks UDD's existing `node_modules`. No shell command or dependency install is run. (lib/runtime/local-preview.ts:148–198, 319–385)

The child process environment is scrubbed to a minimal set of variables, binds to `127.0.0.1`, disables Next telemetry, and uses a launcher that exits on TTL expiry or parent-process disappearance. (lib/runtime/local-preview.ts:396–408, 573–616)

This is a local development preview only. The runtime binds to `127.0.0.1`, the UI embeds or opens only the recorded local URL, and no code claims deployment, production hosting, public hosting, or external infrastructure. (lib/runtime/local-preview.ts:68–79, 573–585; components/mobile/preview-screen.tsx:49–75; components/mobile/project-actions-menu.tsx:93–104; components/run/preview-panel.tsx:33–57)

---

## Provider Selection — Active provider resolution and credential handling

### Supported providers and option registry

Three AI providers are defined in the single `PROVIDERS` registry: `openai` (`gpt-4o-mini`), `anthropic` (`claude-3-5-sonnet-20241022`), and `ollama` (model from `UDD_DEFAULT_AI_MODEL`, default `qwen2.5-coder`). UI option labels are derived from that registry by `getProviderOptions`, not duplicated in client components. (lib/ai/providers/index.ts:6–40, 72–78)

### Resolution and generation path

`getActiveProviderForOwner(ownerId)` first reads the user's default `provider_configs` row for `kind='ai'`, then falls back to `getActiveProvider()`. `getActiveProvider()` selects `ollama` when `UDD_DEFAULT_AI_BASE_URL` is set; otherwise it reads `UDD_AI_PROVIDER`, validates it with `isProviderId`, and defaults to `openai` when unset or invalid. (lib/ai/providers/server.ts:21–33, lib/ai/providers/index.ts:44–65)

`runAITask` resolves the active provider and then calls `getCredentialForProvider(ownerId, provider.id)`. If a stored credential exists, it passes the decrypted value into `generateResult` as `options.credential`. (lib/ai/service.ts:131–138)

`generateResult` calls `createLanguageModel(provider, credential, ownerId)` and passes the returned direct provider model to `streamText`. OpenAI and Anthropic require a resolved stored credential; Ollama/self-hosted uses `UDD_DEFAULT_AI_BASE_URL` or a per-user custom `baseURL` plus `UDD_DEFAULT_AI_API_KEY` defaulting to `ollama`. (lib/ai/generator.ts:82–155; lib/ai/providers/server.ts:96–148)

Generation failures are normalized before being written to `ai_tasks.error` / `ai_task_events.payload.error`: stored-credential authentication failures tell the user to replace or delete the saved provider credential, missing OpenAI/Anthropic credentials surface the direct missing-key error, missing Ollama base URL becomes an Ollama configuration message, and a defensive AI Gateway-authentication branch remains for matching upstream error text. Secret values are not included in these messages. (lib/ai/service.ts:35–69)

### User surfaces

User-facing provider selection exists in Settings. Desktop Settings labels this surface as “Provider selection” / “Default provider” and says the default provider uses a saved key when present or environment credentials when available. Global mobile Settings exposes the same real provider workflow through a mobile-native select, readiness status, saved-credential presence, environment fallback status, and the existing credential manager; it does not expose stored secret values. (app/(app)/settings/page.tsx:56–88; components/mobile/account-settings-screen.tsx:150–276; components/settings/provider-form.tsx:66–124; components/ai/provider-credential-control.tsx:51–198)

Settings writes provider preference through `saveAIProviderConfig`; credentials are not stored in provider metadata, and secret-shaped metadata is rejected with copy pointing users to the credential manager. Desktop Settings and global mobile Settings both call that action for provider selection. The old provider switcher component still writes through the same action when rendered, but the primary mobile cockpit does not render it. (components/settings/provider-form.tsx:45–60; components/mobile/account-settings-screen.tsx:64–78, 174–180; components/ai/provider-switcher.tsx:35–51; app/actions/provider-configs.ts:13–44; components/mobile/composer.tsx:89–100)

The primary cockpit page resolves the active provider, provider credential presence flags, and the environment fallback flag from `hasGatewayEnvironmentCredential()` server-side, then passes serializable readiness booleans to the mobile shell, composer, next-action line, and mobile settings surface. (app/(app)/projects/[id]/page.tsx:200–213, 279–294; lib/ai/providers/server.ts:66–73; components/mobile/mobile-shell.tsx:47–80)

The primary mobile cockpit does not save credentials inline. Its composer treats readiness as ready only when the selected provider has a saved credential or environment fallback, disables prompt submission otherwise, and links to Settings with copy that says a saved key or environment fallback is needed. The in-cockpit mobile settings surface remains a project-context shortcut/status surface; global mobile `/settings` is the mobile account/provider management surface, displays per-provider credential status badges (Saved/Missing), provides provider selection, and renders `ProviderCredentialControl` for credential save/replace/delete without exposing stored secret values. (components/mobile/composer.tsx:51–53, 89–100, 105–119; components/mobile/settings-screen.tsx:49–76; components/mobile/account-settings-screen.tsx:121–276; components/ai/provider-credential-control.tsx:51–198)

The AI tab remains a secondary generation-inspection surface. It renders `AIPromptForm` in its default mode without provider-readiness props, so it does not expose provider selection or credential controls. `AIPromptForm` still contains conditional cockpit provider controls for callers that pass `variant="cockpit"` plus `activeProvider`, but the current primary mobile cockpit no longer renders that path. (app/(app)/projects/[id]/ai/page.tsx:98–106; components/ai/ai-prompt-form.tsx:52–64, 99–109, 205–249, 290–294)

Settings remains the safe credential-management surface for normal replacement/deletion. Desktop and global mobile Settings list each provider and render save/replace/delete controls through `ProviderCredentialControl`; saved keys are validated before encryption and never shown after save. (app/(app)/settings/page.tsx:33–43, 56–88; components/settings/provider-form.tsx:99–124; components/mobile/account-settings-screen.tsx:211–276; components/ai/provider-credential-control.tsx:51–198)

### Credential handling — BYOK runtime surface

**Storage**: User API keys are stored encrypted in the `user_secrets` table. New ciphertexts are versioned (`v2`) and use AES-256-GCM with a key derived from `UDD_SECRET_KEY` by `scryptSync` and the fixed application salt `udd-web:user-secrets:v1`. Legacy unversioned ciphertexts still decrypt with the older SHA-256-derived key so saved beta credentials remain usable, but replacing a credential writes it back in the `v2` scrypt-derived format. `encrypted_value` holds ciphertext only — no plaintext key is ever written to the database. `lib/secrets/crypto.ts` is `server-only` and may not be imported in client code. (lib/secrets/crypto.ts, lib/secrets/index.ts, scripts/005_user_secrets.sql)

**Server actions**: `app/actions/secrets.ts` exposes three actions — `saveProviderCredential`, `deleteProviderCredential`, and `getProviderCredentialStatuses`. `saveProviderCredential` validates the supplied key with the selected upstream provider before calling `saveSecret`; failed validation throws and does not persist the value. `deleteProviderCredential` removes the encrypted row. The status action returns `Record<ProviderId, boolean>` (decryptable credential flags only); no secret value is ever returned to any caller. (app/actions/secrets.ts:11–89, 92–121; lib/secrets/index.ts:46–71)

**Generation resolution**: `runAITask` calls `getCredentialForProvider(ownerId, provider.id)` immediately after provider selection. If a credential is stored for the active provider, it is decrypted server-side and passed to `generateResult` via `options.credential`. (lib/ai/providers/server.ts:50–59, lib/ai/service.ts:131–138)

**Credential use in API calls**: The resolved credential is passed server-side into `createLanguageModel`, which creates a direct OpenAI or Anthropic client for the selected provider. Ollama/self-hosted uses an OpenAI-compatible client with the configured base URL and API key. No credential is logged, written to events, returned to the client, or included in task output. (lib/ai/generator.ts:82–155; lib/ai/providers/server.ts:96–148; lib/ai/service.ts:131–178)

**Provider readiness**: Per-provider credential-status flags are derived from decryptable encrypted-secret rows via `getSecretStatus`; Ollama reports valid when `UDD_DEFAULT_AI_BASE_URL` is set. The separate environment fallback flag returns true when `AI_GATEWAY_API_KEY`, `UDD_DEFAULT_AI_BASE_URL`, or `VERCEL=1` is present. The client receives booleans/status labels only, not credential values. (lib/secrets/index.ts:46–71; lib/ai/providers/server.ts:47–73; app/(app)/projects/[id]/page.tsx:200–213; app/(app)/settings/page.tsx:33–43, 75–79)

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
| Account deletion (deleteAccount)     | app/actions/profile.ts       | IMPLEMENTED — deleteAccount server action deletes the Better Auth `user` row through Drizzle, relies on database `ON DELETE CASCADE` relationships for owned data, then signs out through Better Auth. Mobile and desktop Settings expose confirm dialog. | §Intentional Constraints constraint 6                 |

`run_sessions.preview_url` is active application schema. It stores only a real local preview endpoint after readiness succeeds, and it is cleared on stop, stale cleanup, and errors. (lib/runtime/service.ts:275–295, 119–126, 367–373, 393–400)

Forward-looking schema notes:

- `exports`: schema is present; no application code reads or writes this table yet. It is kept so an export feature can land later without designing the table from scratch.
- `provider_configs.secret_ref`: always null today — user credentials live in `user_secrets`; never store raw secrets in this column.

---

## Progress observation

### Poller components

- `TaskPoller`: 800 ms. Active when any loaded task has `status` `pending` or `running`. (components/ai/task-poller.tsx:17, app/(app)/projects/[id]/page.tsx:257–259, 328; app/(app)/projects/[id]/ai/page.tsx:55, 145)
- `RunPoller`: 700 ms. Active when any loaded run session has `status` `starting`, `running`, or `stopping`. (components/run/run-poller.tsx:17, app/(app)/projects/[id]/page.tsx:260–265, 329; app/(app)/projects/[id]/run/page.tsx:77–78)

### Mechanism

Both pollers call `router.refresh()` on each tick. (components/ai/task-poller.tsx:17, components/run/run-poller.tsx:17)

`router.refresh()` triggers a full re-fetch of the server component tree for the current route. The server component re-queries PostgreSQL through Drizzle query helpers and returns the updated state. There is no incremental or delta mechanism.

Polling starts when the component mounts with `active=true`. Polling stops when `active` becomes `false` or the component unmounts. The interval is cleared in the `useEffect` cleanup function. (components/ai/task-poller.tsx:14–20, components/run/run-poller.tsx:14–20)

### Explicit absence

There are no WebSocket connections, realtime subscriptions, or server-sent events in the codebase. Persisted task/run progress updates reach the client through these refresh pollers. The mobile shell also has local-only UI state for screen selection, drawer visibility, actions menu visibility, and composer draft/optimistic echo; route-level mobile shells have local drawer/action-sheet state only. That state does not replace server re-fetching for durable task/run data. (components/mobile/mobile-shell.tsx:24–42; components/mobile/mobile-route-shell.tsx:23–83; components/mobile/preview-route-screen.tsx; components/mobile/composer.tsx:44–57, 75–87)

---

## Cockpit Conversation Reconstruction

The project cockpit reconstructs recent generation-run history directly from existing persisted records. On each server render it loads the owner-filtered project, up to six recent `ai_tasks`, up to two recent `run_sessions`, the current `project_files` summary, the user's recent projects for the drawer, and the profile display name. It then fetches the referenced `prompts`, `ai_task_events`, and `run_events` rows for those recent records. (app/(app)/projects/[id]/page.tsx:104–154, 166–202)

The server route converts the persisted rows into serializable mobile props and renders `MobileShell` directly from the main app source. Conversation entries are built by `buildMobileConversation`, sorted by persisted `created_at`, and passed to the client as `MobileConversationEntry[]`. A user bubble is rendered only from a recorded prompt: `prompts.body` via `ai_tasks.prompt_id`, falling back to `ai_tasks.input.prompt` when no prompt row is available. Project metadata is not rendered as a user-authored message. (app/(app)/projects/[id]/page.tsx:268–294, 360–462)

Task assistant entries are derived from `ai_tasks.kind`, `ai_tasks.input`, `ai_tasks.status`, timestamps, `ai_tasks.output`, `ai_tasks.error`, and grouped `ai_task_events`. The cockpit maps persisted task kinds to visible operation semantics: scaffold is described as a replacement build run, edit/refactor as code-change runs checked against saved files, explanation as an explanation request that still uses the validation gate, and `other` as a general generation run. If `ai_tasks.input.repair` exists, the mobile conversation labels the entry as a repair run and displays the failed source task id. (app/(app)/projects/[id]/page.tsx:464–590, 694–724)

Pending and running copy is status-backed; running progress uses the latest persisted `progress` event; completed generated output is shown as saved proof using staged task output plus the completed event file count when present; failed staged output is labeled diagnostic and not presented as saved. Validation summaries, blocking issue callouts, failure text, and recovery text come from persisted task fields and `validation` events. Failed validation tasks with blocking issue events render repair actions tied to that failed task id. (app/(app)/projects/[id]/page.tsx:500–590; components/mobile/chat-build-screen.tsx:170–236)

While a primary cockpit submit server action is pending, the mobile composer shows a local optimistic “Queuing generation” echo with the prompt text and the same pure prompt classifier used by task creation. That optimistic echo is active UI state only; it is cleared on server-action error, and reload still reconstructs history from persisted records. The AI tab's `AIPromptForm` has its own secondary optimistic echo for that tab. (components/mobile/composer.tsx:44–57, 60–87; components/ai/ai-prompt-form.tsx:72–87, 95–97, 130–138, 155–202)

Runtime conversation entries are derived from recent `run_sessions` and grouped `run_events`. Their copy describes user-visible preview state without claiming a live preview until runtime provides a running session with `preview_url`. The mobile preview screen and project actions menu expose the real local URL only when `preview_url` is present on a running session. (app/(app)/projects/[id]/page.tsx:423–458, 726–744; components/mobile/preview-screen.tsx:27–75; components/mobile/project-actions-menu.tsx:93–110)

Mobile project sub-routes use a shared `MobileRouteShell` for the drawer, centered route title, project actions, and chat navigation, while their desktop branches remain under `hidden md:flex`. `/projects/[id]/files`, `/projects/[id]/logs`, and `/projects/[id]/settings` render mobile file, console, and project-settings screens through that shell; `/projects/[id]/run` renders `PreviewScreen` through `MobilePreviewRouteScreen`; global `/settings` renders `MobileAccountSettingsScreen` on mobile and keeps the desktop settings form on desktop. (components/mobile/mobile-route-shell.tsx:11–103; app/(app)/projects/[id]/files/page.tsx:128–154; app/(app)/projects/[id]/logs/page.tsx:89–111; app/(app)/projects/[id]/settings/page.tsx:64–86; app/(app)/projects/[id]/run/page.tsx:105–122; app/(app)/settings/page.tsx:57–94)

The cockpit pollers remain refresh-based for durable progress: polling is active when any recent task is `pending`/`running` or any recent run session is `starting`/`running`/`stopping`, then `TaskPoller` and `RunPoller` re-fetch the server component tree. (app/(app)/projects/[id]/page.tsx:257–265, 328–329; components/ai/task-poller.tsx:14–20; components/run/run-poller.tsx:14–20)

## Cockpit Next Actions

`deriveNextAction` is a pure deterministic function. It consumes only already-loaded persisted state: `projects.status`, the latest `ai_tasks` row, the latest validation summary from `ai_task_events`, `project_files` count and newest `updated_at`, the latest `run_sessions` row, a run-event summary from `run_events`, and active provider readiness from decryptable encrypted-secret rows plus environment fallback detection. It returns a stable `code`, compact description, explicit CTA action kind, and plain-English `reason`, which the server route passes to `MobileShell`. (lib/workspace/next-action.ts:43–124; app/(app)/projects/[id]/page.tsx:246–294)

Provider-blocked recommendations are emitted only when the next useful step would require AI generation and the selected provider has neither a saved credential nor the environment fallback flag. In the primary mobile cockpit, the recovery path is Settings navigation and disabled prompt submission, not inline credential capture. No BYOK, runtime, preview, deploy, or repair behavior is suggested unless its implemented state/action exists. (lib/workspace/next-action.ts:151–169, 216–263, 479–513; components/mobile/composer.tsx:51–53, 89–100; components/mobile/chat-build-screen.tsx:322–331)

Generation inspection routes only to detail surfaces: queued/running generation work and data inconsistencies link to the AI task detail, while runtime failures link to the Run surface. Start/continue generation remains local to the prompt box, local preview checks start inline via `startRunAction`, repair starts inline via `repairFailedTask`, and failed tasks retry inline via `retryFailedTask` when provider readiness allows it. The mobile action menu can also start, restart, or stop the latest local preview session through the real runtime actions. (lib/workspace/next-action.ts:176–204, 252–263, 296–327, 361–411, 437–495; components/mobile/composer.tsx:60–119; components/mobile/chat-build-screen.tsx:198–236, 277–331; components/mobile/project-actions-menu.tsx:136–193)

Runtime recommendations are freshness-aware. If saved files exist without a task row, if no run session exists after a completed task, if the latest run predates the newest saved file or completed task, or if a stopped run lacks clean validation/preview evidence, the cockpit recommends starting a local preview check inline. A running session with `preview_url`, a live-preview event, or a clean-validation event allows the cockpit to recommend continuing generation, subject to provider readiness. The mobile preview surface itself still refuses to display a live iframe without a running session and recorded URL. (lib/workspace/next-action.ts:141–149, 347–425, 437–495; app/(app)/projects/[id]/page.tsx:248–276; components/mobile/preview-screen.tsx:27–75)

## Files Tab — Saved file inspection

The Files tab is a read-only inspection surface for persisted `project_files`, not a diagnostic view of staged AI output. It authenticates the user, confirms the project belongs to that owner, and filters both the file list and selected file-content lookup by `project_id` and `owner_id`. (app/(app)/projects/[id]/files/page.tsx:39–72)

The list query loads file metadata ordered by path. The active inspected file is selected from `?file=<path>` only when that path exists in the saved file list; otherwise the first saved file is selected. The selected file query then loads its persisted `content` from `project_files`. (app/(app)/projects/[id]/files/page.tsx:52–72)

The empty-state copy says to generate or repair a project to create saved files. The non-empty mobile and desktop states show saved-file metadata and render the selected file's persisted contents in a code block. (app/(app)/projects/[id]/files/page.tsx:128–187; components/mobile/files-screen.tsx:14–91)

---

## Execution Semantics — Invocation and Ownership

### User-triggered

All of the following require an explicit user action (form submission or button press):

| Action                               | Server action            | Source                |
| ------------------------------------ | ------------------------ | --------------------- |
| Submit AI prompt                     | `createAITask`           | app/actions/ai.ts:51  |
| Retry a task still in `pending`      | `retryPendingTask`       | app/actions/ai.ts:115 |
| Retry a `failed` or `cancelled` task | `retryFailedTask`        | app/actions/ai.ts:209 |
| Repair a failed validation task      | `repairFailedTask`       | app/actions/ai.ts:272 |
| Cancel a `pending` or `running` task | `cancelAITask`           | app/actions/ai.ts:138 |
| Delete a terminal-state task         | `deleteAITask`           | app/actions/ai.ts:165 |
| Start a local preview run            | `startRunAction`         | app/actions/run.ts:13 |
| Stop a local preview run             | `stopRunAction`          | app/actions/run.ts:32 |
| Start a run from a completed AI task | `startRunFromTaskAction` | app/actions/run.ts:49 |

`retryFailedTask` keeps its default AI-detail redirect, but the primary mobile cockpit may pass `redirect_to=/projects/[id]` so an inline retry returns to the cockpit. The action accepts only that exact same-project cockpit URL for same-page return; otherwise it redirects to the new AI task detail as before. Repair forms use the same same-project return path. (app/actions/ai.ts:209–260; components/mobile/chat-build-screen.tsx:198–236, 288–318)

### System-triggered (via `after()`, runs after HTTP response flushes)

| Work unit                    | Scheduled by                                                | Source                     |
| ---------------------------- | ----------------------------------------------------------- | -------------------------- |
| `runAITask(taskId)`          | `createAITask`                                              | app/actions/ai.ts:102–104  |
| `runAITask(taskId)`          | `retryFailedTask`                                           | app/actions/ai.ts:228–230  |
| `runAITask(taskId)`          | `repairFailedTask`                                          | app/actions/ai.ts:368–370  |
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
- No automatic task-to-run chaining: a run session and local preview attempt are created only when the user explicitly calls `startRunAction` or `startRunFromTaskAction`. (app/actions/run.ts:13, 49)
- No deployment, production hosting, public preview URL, or external serving infrastructure is created by the runtime path. The only preview endpoint is a local `127.0.0.1` dev server URL after process readiness succeeds. (lib/runtime/local-preview.ts:68–79, 573–585; lib/runtime/service.ts:275–295)
- No automatic fail-to-retry or fail-to-repair: a failed task is retried only when the user explicitly calls `retryFailedTask`, and repaired only when the user explicitly calls `repairFailedTask`. Repair creation also fails unless stored blocking validation evidence and staged output exist. (app/actions/ai.ts:189, app/actions/ai.ts:262–308)
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

**4. `run_sessions.preview_url` must only represent a real reachable local preview process.**

No code may write a synthetic, placeholder, public, or deployment URL to this column. The runtime writes `preview_url` only after `startNextDevPreview` starts a local Next process and readiness probing succeeds; stop, stale cleanup, and error paths clear it. (lib/runtime/service.ts:258–295, 119–126, 367–373, 393–400; lib/runtime/local-preview.ts:59–129)

_Why_: Writing a fake URL violates the Preview Truth invariant in CLAUDE.md §Product Truth Contract. A URL in this column is user-visible proof that a bounded local preview was actually started and reached.

**5. `after()` must be used for all AI and runtime background work.**

`runAITask` and `driveSession` must be scheduled via `after()`, not awaited inline in the server action. (app/actions/ai.ts:102–104, app/actions/run.ts:19–21)

_Why_: The task or session row must be inserted and visible in the UI before background execution begins. Awaiting inline would block the HTTP response until model generation or file parsing completes, preventing visible progress state from ever rendering.

**6. Account deletion is implemented through service-role auth deletion.**

`deleteAccount` uses Drizzle to delete the authenticated Better Auth `user` row, then calls `auth.api.signOut`. Database cascades remove profiles, projects, project_files, prompts, and user_secrets through `ON DELETE CASCADE`; mobile and desktop Settings expose a confirm dialog before deletion.
