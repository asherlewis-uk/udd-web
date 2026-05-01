# UDD Product Truth Guardrails

Durable product-policy document. Distilled from `docs/critical_unresolved_positioning.md` (2026-04-29, archived). `docs/system-state.md` remains canonical for implemented behavior; this file governs the *language and scope* UDD is allowed to use about itself.

## Product Position

UDD is:

> A single-user AI dev cockpit for turning an idea into a real saved Next.js project, with validation, files, logs, and truthful local preview state.

UDD is **not**:

- Replit, but smaller
- v0, but with a project shell
- A general web IDE
- A cloud sandbox platform
- A native iOS app builder
- A public deployment or App Store publishing system

UDD may sit adjacent to Bolt, Lovable, Replit Agent, and v0 in user expectation, but its first defensible lane is narrower: a guided app-building cockpit that refuses to fake execution, preview, persistence, credentials, publishing, or completion.

## Copy Guardrails

### Allowed (current-state copy)

- `Validating saved files`
- `Preparing local preview workspace`
- `Starting local Next preview`
- `Preview ready on local host`
- `Preview blocked`
- `Preview stopped`
- `Open local preview` — only when a running session has a real URL

### Use With Caution (only with explicit qualification)

- `Sandbox` — only if defined as the local runtime workspace or a future architecture
- `Bundling` — only if a real bundle/build step exists
- `Share` — only if a real share target exists
- `Publish` — only if a real publish path exists
- `App Store` — only in blocker/planning docs until implementation exists

### Forbidden in Product UI

- `Publish to App Store`
- `Open on iPhone`
- `Live preview on mobile`
- `Hosted preview`
- `Acquiring sandbox` — unless mapped to a real state and not confused with hosted/on-device execution

## Non-Goals

- No general terminal
- No arbitrary package installation
- No implied cloud deployment
- No App Store publishing controls
- **No public preview URLs**
- No removal of GitNexus, Gortex, agent skills, or MCP server instructions
- No replacement of `docs/system-state.md` with a new master-state document

## Network Reachability — Tailscale Clarification

Following the Legion self-host migration, `run_sessions.preview_url` may be written with a Tailscale-routed host (e.g. `http://100.106.121.100:<port>`) instead of `127.0.0.1:<port>`, controlled by the `UDD_PREVIEW_HOST` env var (see `docs/migration/env-lockdown.md`). **Tailscale-routed preview URLs are allowed; truly public preview URLs remain forbidden.** The runtime still binds to `127.0.0.1` inside the host (`lib/runtime/local-preview.ts:466, 547, 665`); only the URL surfaced to the authenticated single user changes. This does not relax the no-public-preview guardrail — Tailscale is a private mesh, not a public network.

## Open Product Questions (deferred, not committed)

- iOS device preview transport: tunnel, hosted preview worker, simulator bridge, native wrapper, or desktop-only
- TestFlight viability: account deletion backend (`deleteAccount`) is the gating blocker
- Whether `sandbox` becomes durable product vocabulary
- Whether publish/share UI surfaces become visible (currently hidden — `exports` schema exists but no service/UI path is wired)
- Whether UDD pursues general IDE breadth (recommended: keep guided cockpit)
