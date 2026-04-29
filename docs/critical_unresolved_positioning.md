# Critical Unresolved Positioning

Date: 2026-04-29

Purpose: lock the product position before the next UI pass. This document exists because UDD sits near Replit Agent, Bolt, Lovable, and v0 in user perception, but the source does not implement a general IDE, hosted sandbox, native iOS runtime, or publish platform.

This is a decision record, not a new source of behavioral truth. `docs/system-state.md` remains canonical for implemented behavior.

## Platform Blockers / iOS Preview Reality

This section must be read before any vibecode-inspired preview work begins.

### What Is Real Now

- UDD is a Next.js web app (`package.json:5-74`).
- The preview backend is a server-side local Next dev process (`lib/runtime/local-preview.ts:59-129`).
- The runtime creates a URL shaped like `http://127.0.0.1:<port>` (`lib/runtime/local-preview.ts:69`).
- The launcher starts Next with `--hostname 127.0.0.1` (`lib/runtime/local-preview.ts:665`).
- `run_sessions.preview_url` is written only after a real local readiness probe succeeds (`docs/system-state.md:181-187`).
- Mobile UI embeds the recorded URL only when a run is `running` and a URL exists (`components/mobile/preview-screen.tsx:27-89`).

### What Is Not Real Yet

- Native on-device code execution.
- App Store publishing.
- Public sharing.
- Hosted preview URLs.
- A general cloud sandbox.
- Dependency installation inside generated projects.
- iPhone-reachable localhost preview.
- Capacitor, Expo, React Native, or any native iOS wrapper.
- A tunnel, preview proxy, or WebRTC bridge from iOS to the local preview host.

### Why This Matters

On an iPhone, `127.0.0.1` points to the iPhone itself. It does not point to the Mac/server running UDD. A native-feeling shell does not change that network fact. The current runtime also uses Node child processes, temp workspaces, symlinked `node_modules`, and `next dev`; that is a local server development model, not App Store-safe on-device execution.

Therefore: the first iOS-first preview pass may redesign the shell and preview presentation, but it must not claim on-device execution, public preview, App Store publishing, or mobile-reachable localhost preview.

## Product Position

UDD should be positioned as:

> A single-user AI dev cockpit for turning an idea into a real saved Next.js project, with validation, files, logs, and truthful local preview state.

UDD should not be positioned as:

- Replit, but smaller.
- v0, but with a project shell.
- A general web IDE.
- A cloud sandbox platform.
- A native iOS app builder.
- A public deployment or App Store publishing system.

UDD can be adjacent to Bolt, Lovable, Replit Agent, and v0 in user expectation, but its first defensible lane is narrower: a guided app-building cockpit that refuses to fake execution, preview, persistence, credentials, publishing, or completion.

## Preview Direction

The next preview direction is:

- Native-feeling iOS-first studio shell.
- Phone-within-studio preview as the primary visual model.
- Generated app as the center of attention.
- Chat, files, logs, actions, and settings orbit around the preview.
- Existing local Next preview runtime remains the real backend state until a new preview architecture is chosen.

The vibecodeapp.com screenshots are inspiration for flow and hierarchy, not permission to clone copy or imply unsupported capabilities.

## Copy Guardrails

Allowed current-state copy:

- `Validating saved files`
- `Preparing local preview workspace`
- `Starting local Next preview`
- `Preview ready on local host`
- `Preview blocked`
- `Preview stopped`
- `Open local preview` when a running session has a real URL

Use with caution, only with explicit qualification:

- `Sandbox` - only if defined as the local runtime workspace or future architecture.
- `Bundling` - only if a real bundle/build step exists.
- `Share` - only if a real share target exists.
- `Publish` - only if a real publish path exists.
- `App Store` - only in blocker/planning docs until implementation exists.

Avoid in product UI for now:

- `Publish to App Store`
- `Open on iPhone`
- `Live preview on mobile`
- `Hosted preview`
- `Acquiring sandbox` unless mapped to a real state and not confused with hosted/on-device execution.

## Open Decisions

| Decision                                     | Current Source Reality                                        | Options                                                                                | Recommended Current Stance                                     |
| -------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| How should iOS device preview work later?    | No tunnel/native wrapper/public preview exists.               | Tunnel, hosted preview worker, simulator bridge, native wrapper, or keep desktop-only. | Decide architecture after docs alignment; do not imply it now. |
| Is TestFlight an immediate target?           | Account deletion is disabled and documented as missing.       | Implement deletion, restrict distribution, or defer TestFlight.                        | Treat account deletion as a blocker until proven otherwise.    |
| Should `sandbox` become product vocabulary?  | Runtime prepares a local temp workspace, not a broad sandbox. | Avoid term, define narrowly, or implement real sandbox infrastructure.                 | Avoid product copy for now.                                    |
| Should publish/share be visible?             | `exports` schema exists, but no service/UI path is wired.     | Hide, disabled with clear copy, or implement.                                          | Hide until real.                                               |
| Should UDD pursue general IDE features?      | Current source is cockpit/workflow oriented.                  | Add IDE breadth or keep guided cockpit.                                                | Keep guided cockpit; avoid IDE competition.                    |
| Should first preview redesign touch runtime? | Current runtime is local Next only.                           | UI-only shell pass, or runtime architecture pass first.                                | UI can proceed only with local-preview truth intact.           |

## End-To-End Alignment Pass

### Phase 0 - Truth Freeze

- Keep `docs/system-state.md` canonical.
- Use `docs/source_reality_alignment_audit.md` to separate source-backed facts from stale audit claims.
- Do not update UI copy or product claims without checking the Product Truth Contract in `CLAUDE.md:1-42`.

### Phase 1 - Product Promise

Align all docs and future UI around this loop:

1. Describe the app.
2. Generate or edit files.
3. Persist saved files.
4. Validate saved files.
5. Show evidence through files, logs, task status, and errors.
6. Start a real supported local preview.
7. Repair from concrete failures.

Anything outside that loop is a future capability until implemented.

### Phase 2 - iOS-First Studio Shell

Build the phone-within-studio preview shell without changing runtime promises:

- Center the generated app preview as the main object.
- Keep chat and actions close to the preview.
- Preserve existing run status truth.
- Do not add publish/share/App Store actions.
- Avoid fake loading words unless they map to real state.

### Phase 3 - Preview Reachability Architecture

Before promising iPhone preview, choose and implement one transport:

- Local tunnel from host machine to device.
- Hosted preview worker with isolated execution.
- Native wrapper/simulator bridge.
- Export-to-local workflow for developers.
- Explicit desktop-only preview.

This must include security, resource limits, lifecycle cleanup, and truthful URL semantics before UI claims change.

### Phase 4 - Release Compliance

Before TestFlight/App Store distribution, resolve:

- Account deletion backend (`deleteAccount`, service-role admin delete or DB RPC, cascades, sign-out flow).
- Secret handling and BYOK status clarity.
- App Store copy truth around account creation, deletion, previews, publishing, and user data.
- Whether the app is external beta, internal tool, or web-only mobile experience.

## Non-Goals For The Next Pass

- Do not build a general terminal.
- Do not add arbitrary package installation.
- Do not imply cloud deployment.
- Do not add App Store publishing controls.
- Do not create public preview URLs.
- Do not remove GitNexus, Gortex, agent skills, or MCP server instructions.
- Do not replace `docs/system-state.md` with a new master-state document.

## Immediate Next Move

The next implementation after this docs pass should be a small, truth-preserving visual spike:

- Redesign mobile preview as a native-feeling phone-within-studio surface.
- Keep the runtime backed by the existing local Next preview state.
- If the preview URL is local-only, label it as local-only.
- Keep Open in Browser gated on a real running session and recorded URL.
- Do not add publish/share/App Store controls.

If that spike feels too constrained, stop and design preview reachability architecture before building more UI.
