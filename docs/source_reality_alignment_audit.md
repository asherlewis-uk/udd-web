# Source Reality Alignment Audit

Date: 2026-04-29

Purpose: document the current source-backed state of UDD before the iOS-first preview cockpit pivot. This is not a replacement for `docs/system-state.md`; that file remains the canonical behavioral specification format. This audit compares source, existing docs, and the beta work audit so future work does not inherit stale claims.

Scope: docs-only. No tools, agent skills, MCP servers, GitNexus/Gortex instructions, runtime code, UI code, schema, or product behavior are changed by this document.

Baseline note: the working tree already contains an unrelated change in `scripts/udd-web.code-workspace`. This audit intentionally ignores that file and does not revert it.

## Source Of Record

When source and docs disagree, source wins:

- TypeScript server actions and services define actual behavior.
- SQL migrations define reproducible schema intent.
- `docs/system-state.md` is the canonical behavior documentation format, but it must stay subordinate to implementation.
- `docs/first_beta_remaining_work_audit.md` is a beta queue and may contain stale findings.

## Classification Labels

| Label                 | Meaning                                                                             |
| --------------------- | ----------------------------------------------------------------------------------- |
| `IMPLEMENTED`         | Source contains a wired, durable, user-reachable implementation.                    |
| `PARTIAL`             | Real implementation exists, but important behavior or platform coverage is missing. |
| `DISABLED`            | UI or route intentionally disables the capability with truthful copy.               |
| `MISLEADING`          | UI/docs/logs imply behavior source does not provide.                                |
| `DOC_ONLY`            | Docs/spec mention behavior without source implementation.                           |
| `STALE_DOC`           | Current docs or audit claims contradict source.                                     |
| `NEEDS_RUNTIME_CHECK` | Source suggests behavior, but a real run/manual check is still required.            |
| `NOT_APPLICABLE`      | Capability is outside the audited surface.                                          |

## High-Level Findings

| Surface                       | Status                                                                         | Source Reality                                                                                                                                                                                                                                                                         | Doc/Audit Alignment                                                                                                                                                                          | Recommended Resolution                                                           |
| ----------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Product truth contract        | `IMPLEMENTED` as policy                                                        | `CLAUDE.md:1-42` defines non-negotiable execution, preview, completion, provider, UI copy, and log truth.                                                                                                                                                                              | Current docs follow this framing.                                                                                                                                                            | Preserve; do not weaken during preview redesign.                                 |
| AI task lifecycle             | `IMPLEMENTED`                                                                  | `app/actions/ai.ts:117-118` schedules `runAITask` through `after()`. `lib/ai/service.ts:68` owns task execution.                                                                                                                                                                       | `docs/system-state.md:30-61` matches the validation/persistence contract.                                                                                                                    | Keep source as record.                                                           |
| Validation before persistence | `IMPLEMENTED`                                                                  | `docs/system-state.md:42-49`, `docs/system-state.md:393-399`, and `lib/ai/service.ts:187-224` describe staged output, validation, `persistFiles`, then completion.                                                                                                                     | Current system-state is aligned.                                                                                                                                                             | Do not reorder this in future changes.                                           |
| Runtime preview               | `IMPLEMENTED` for local desktop/server preview, `PARTIAL` for mobile/iOS goals | `lib/runtime/local-preview.ts:59-129` starts a local Next preview. `lib/runtime/local-preview.ts:69`, `466`, `547`, and `665` bind to `127.0.0.1`. `lib/runtime/service.ts:245-295` persists `preview_url` only after readiness.                                                       | `docs/system-state.md:181-203` accurately says local `127.0.0.1`, but does not yet foreground the iOS reachability implication.                                                              | Add platform-blocker context in positioning docs before UI work resumes.         |
| Mobile preview surface        | `PARTIAL`                                                                      | `components/mobile/preview-screen.tsx:27-75` iframes `previewUrl` only when status is `running` and a URL exists. `components/mobile/project-actions-menu.tsx:127-133` exposes Open in Browser only when the preview URL exists.                                                       | Truthful for local web use. It does not prove iOS device reachability.                                                                                                                       | Keep copy local-preview specific; do not imply iPhone-reachable preview.         |
| iOS/native runtime            | `DOC_ONLY` if implied                                                          | `package.json:5-74` lists a web-only Next/React stack. No Capacitor, Expo, React Native, native iOS project, tunnel, or public preview dependency is present.                                                                                                                          | No current canonical doc claims native runtime. Product discussion could accidentally imply it.                                                                                              | Treat native iOS as direction, not implementation.                               |
| Provider selection and BYOK   | `IMPLEMENTED`                                                                  | `components/mobile/account-settings-screen.tsx:8` imports `ProviderCredentialControl`; `components/mobile/account-settings-screen.tsx:259` renders it. `app/actions/secrets.ts:80` saves credentials. `lib/secrets/crypto.ts:1-11` is server-only and derives a key with `scryptSync`. | `docs/system-state.md:225-243` aligns with current source. `docs/first_beta_remaining_work_audit.md:38-64` and `535-542` are stale because they describe missing mobile credential controls. | Mark A-1/G-2 from the beta audit resolved or stale in future beta queue cleanup. |
| Account deletion              | `DISABLED` / blocker                                                           | `components/mobile/account-settings-screen.tsx:280-296` exposes disabled copy. `docs/system-state.md:421-423` says no `deleteAccount`, service-role admin delete, or DB RPC exists.                                                                                                    | `docs/first_beta_remaining_work_audit.md:501-523` still correctly flags this as a TestFlight/App Store blocker.                                                                              | Keep disabled and truthful until real backend deletion exists.                   |
| Schema-only previews/exports  | `DOC_ONLY` / forward-looking                                                   | `scripts/001_init_schema.sql:281-306` defines `previews`; `scripts/001_init_schema.sql:313-342` defines `exports`. No reviewed app action writes them.                                                                                                                                 | `docs/system-state.md:259-269` already labels these schema-only/forward-looking.                                                                                                             | Do not expose publish/share/export claims until service and UI paths exist.      |
| `nextAction` mobile surfacing | `IMPLEMENTED` after prior audit                                                | `components/mobile/mobile-shell.tsx:22` receives `nextAction`, `components/mobile/mobile-shell.tsx:53` passes it to chat, and `components/mobile/chat-build-screen.tsx:73` renders `NextActionHint`.                                                                                   | `docs/first_beta_remaining_work_audit.md:73-94` is stale if read as current source.                                                                                                          | Mark A-2 stale/resolved in beta audit cleanup.                                   |
| Mobile internal preview copy  | `PARTIAL`                                                                      | `components/mobile/project-actions-menu.tsx:72` renders `Preview: {status}`, exposing internal status labels like `idle`.                                                                                                                                                              | Beta audit D-3 remains relevant as UX polish.                                                                                                                                                | Replace with user-facing labels in a later UI pass.                              |

## Platform Reality And iOS Preview Blockers

The most important current blocker is not visual design. It is preview reachability and execution model.

Current source truth:

- `startNextDevPreview` builds a URL as `http://127.0.0.1:<port>` (`lib/runtime/local-preview.ts:69`).
- The preview process is spawned by Node (`lib/runtime/local-preview.ts:3`, `71`, `658-665`).
- The Next dev server is launched with `--hostname 127.0.0.1` (`lib/runtime/local-preview.ts:665`).
- The helper allocates ports by listening on `127.0.0.1` (`lib/runtime/local-preview.ts:547`).
- The runtime writes `preview_url` only after a local readiness probe succeeds (`docs/system-state.md:181-187`).

Implication:

- A native-feeling mobile shell does not make the current preview reachable from an iPhone.
- On an iPhone, `127.0.0.1` means the iPhone itself, not the Mac or server running UDD.
- The current runtime is a server/Mac-local development preview, not App Store-safe on-device execution.
- A real iOS-device preview would need a separate architectural decision: tunnel, preview host, simulator bridge, native wrapper path, or another explicit mechanism.

Required product-truth language:

- Say `local preview`, `local Next preview`, or `preview ready on local host`.
- Do not say `live preview on iPhone`, `hosted preview`, `public preview`, `App Store publish`, `share`, or `sandbox acquired` unless a real path exists or the text clearly says it is not implemented.

## End-To-End Current Flow Map

### Generation Flow

1. User submits a prompt through a server action.
2. `app/actions/ai.ts:117-118` schedules `runAITask` with `after()`.
3. `runAITask` claims a pending task, resolves provider/credential, calls the model, stages output, validates, persists generated files, then marks completion only after persistence (`docs/system-state.md:42-49`, `393-399`).
4. Repair is explicit user action, not automatic recovery (`docs/system-state.md:51-67`).

Discrepancy risk: future UI must not call a task completed unless `project_files` persistence succeeded.

### Runtime Flow

1. User starts preview through `startRunAction` (`app/actions/run.ts:13-21`).
2. The run session starts as `starting` with `preview_url = null` (`docs/system-state.md:148-149`).
3. `driveSession` loads saved files, analyzes them, and starts local preview only after parser checks pass (`lib/runtime/service.ts:152`, `docs/system-state.md:148-203`).
4. `preview_url` is written only after local readiness succeeds (`lib/runtime/service.ts:245-295`).
5. Stop, stale cleanup, parser failure, startup failure, and process exit clear `preview_url` (`docs/system-state.md:189`).

Discrepancy risk: future iOS UI must not imply a preview is available unless the runtime has a running session and recorded local URL, and it must still distinguish device reachability from server reachability.

### Mobile Preview Flow

1. `MobileShell` routes between chat, preview, and settings (`components/mobile/mobile-shell.tsx:11-80`).
2. `PreviewScreen` embeds an iframe only when `status === "running"` and `previewUrl` exists (`components/mobile/preview-screen.tsx:27-89`).
3. The actions menu starts, stops, restarts, or opens preview through real runtime actions (`components/mobile/project-actions-menu.tsx:127-193`, `297-302`).

Discrepancy risk: visual redesign can create a phone-within-studio preview safely, but cannot claim native execution or iPhone-local preview until a new preview transport exists.

### Provider And Secrets Flow

1. Provider defaults are managed in Settings and resolved server-side (`docs/system-state.md:207-231`).
2. Credentials are saved through `app/actions/secrets.ts:80` and rendered through `ProviderCredentialControl` on desktop and mobile (`components/mobile/account-settings-screen.tsx:8`, `259`).
3. Secret crypto is server-only and uses `UDD_SECRET_KEY` with `scryptSync` (`lib/secrets/crypto.ts:1-11`).
4. Stored secret values are not displayed after save (`docs/system-state.md:239-243`).

Discrepancy risk: old beta audit findings around missing mobile credential controls are stale and should not drive new work without re-verification.

## Stale Or Resolved Beta Audit Items

These items in `docs/first_beta_remaining_work_audit.md` should not be treated as current without correction:

| Audit Item                                                      | Current Source Evidence                                                                                | Current Status                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------- |
| A-1 mobile Settings does not render `ProviderCredentialControl` | `components/mobile/account-settings-screen.tsx:8`, `259`                                               | `STALE_DOC` / resolved in source. |
| A-2 `nextAction` computed but never surfaced                    | `components/mobile/mobile-shell.tsx:22`, `53`; `components/mobile/chat-build-screen.tsx:73`, `107-148` | `STALE_DOC` / resolved in source. |
| G-2 mobile users cannot manage BYOK credentials                 | `components/mobile/account-settings-screen.tsx:259`                                                    | `STALE_DOC` / resolved in source. |

Items that still appear relevant:

| Audit Item                                    | Evidence                                                                                | Current Status                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| G-1 no account deletion                       | `docs/system-state.md:421-423`; `components/mobile/account-settings-screen.tsx:280-296` | `DISABLED` and still a release/platform blocker.         |
| D-3 `Preview: idle` copy                      | `components/mobile/project-actions-menu.tsx:72`                                         | `PARTIAL`; UX polish/truth wording issue.                |
| Forward-looking export/share/publish surfaces | `scripts/001_init_schema.sql:313-342`; no reviewed action path                          | `DOC_ONLY`; no product claim should be surfaced as real. |

## Required Alignment Decisions Before UI Work

1. Preview UI can become iOS-first and phone-within-studio, but runtime remains local Next preview unless a new transport is implemented.
2. Do not expose Publish, App Store, public Share, or hosted Preview actions until app code actually writes/serves those capabilities.
3. Keep account deletion as a blocker before TestFlight/App Store submission until backend deletion is real.
4. Treat `docs/first_beta_remaining_work_audit.md` as an aging queue, not source truth.
5. If `sandbox` is used in future copy, define it as a real backend state first. Current source has local workspace preparation, not a general cloud sandbox.

## Verification Checklist For This Audit

- [x] Source/doc hierarchy preserved.
- [x] `docs/system-state.md` remains canonical.
- [x] No product code changed.
- [x] No tools, agent skills, MCP servers, GitNexus, or Gortex instructions removed.
- [x] iOS preview limitation documented explicitly.
- [x] Account deletion gap not represented as implemented.
- [x] Publish/share/export/native runtime claims marked as absent or future-only.
