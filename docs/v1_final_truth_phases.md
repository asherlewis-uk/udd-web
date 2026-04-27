# v1_final_truth_phases

This document defines v1 completion phases by acceptable endstate only.

It does not override:
- `CLAUDE.md`
- `docs/system-state.md`
- source code

A phase is complete only when the acceptable endstate is true in the product.

---

## PHASE 1: Cockpit Interaction Truth

### Intent
- Make the project workspace behave like a single-input agent cockpit.
- Keep the user focused on one primary action: describing what UDD should do next.
- Make detail surfaces available without letting them define the main experience.

### Constraints
- Do not reintroduce dashboard-first interaction.
- Do not route users away from the cockpit for actions available inline.
- Do not imply runtime, preview, deployment, or app execution.
- Do not add new backend architecture for this phase.

### Acceptable Endstate
- The project root is the primary cockpit surface.
- The prompt input is the obvious dominant action.
- The right panel shows only meaningful secondary context.
- Detail routes are clearly inspection surfaces.
- Work-in-progress states are visible and do not appear idle.
- Validation checks can be started from the cockpit when applicable.

---

## PHASE 2: Provider Selection Truth

### Intent
- Make provider choice visible and usable at the point of action.
- Let the user choose among server-configured providers without implying credential ownership.
- Keep settings truthful and secondary.

### Constraints
- Do not claim BYOK exists.
- Do not add API key inputs.
- Do not imply user credentials are stored or used.
- Do not duplicate provider registries.
- Do not modify generation semantics beyond existing provider resolution.

### Acceptable Endstate
- The cockpit shows the active provider near the input.
- Settings describes provider selection, not full provider configuration.
- Provider options come from one canonical registry.
- Copy clearly states credentials are managed by the server environment.
- The product does not imply selected providers are usable unless the server is configured for them.

---

## PHASE 3: Secure BYOK Foundation

### Intent
- Define and implement the secure backend foundation required before user-owned keys are exposed.
- Ensure credential storage, retrieval, replacement, and deletion are safe before any BYOK UI exists.

### Constraints
- Do not store raw API keys in ordinary app tables.
- Do not expose secrets back to the client.
- Do not add BYOK UI before the secure server path exists.
- Do not weaken provider truth copy while this phase is incomplete.

### Acceptable Endstate
- A secure credential-storage approach is implemented and documented.
- User credentials can be written, referenced, checked for presence, replaced, and deleted without exposing secret values.
- Generation can resolve the correct credential server-side.
- Provider readiness can be represented without revealing secret material.
- Existing environment-managed provider behavior still works.

---

## PHASE 4: Inline BYOK Runtime Surface

### Intent
- Allow users to configure missing provider credentials directly from the cockpit once secure storage exists.
- Make provider readiness actionable without redirecting users away from work.

### Constraints
- Do not echo API keys after submission.
- Do not store or transmit credentials through unsafe paths.
- Do not imply a provider is ready until the backend can use its credential.
- Do not turn the cockpit into a settings page.

### Acceptable Endstate
- Provider controls show clear readiness states.
- Missing credentials can be added inline through the secure path.
- Saved credentials make the selected provider usable for generation.
- Credential errors are actionable and truthful.
- Settings can manage provider credentials, but normal cockpit use does not require a detour.

---

## PHASE 5: Conversational State Continuity

### Intent
- Make the cockpit feel like a continuous agent conversation rather than a refreshed state viewer.
- Preserve visible continuity across submission, refresh, and return visits.

### Constraints
- Do not fabricate messages.
- Do not present inferred events as persisted truth.
- Do not add conversational state that cannot be reconstructed or justified from source-backed data.
- Do not obscure validation or persistence failures.

### Acceptable Endstate
- Submitted prompts appear immediately or through a truthful pending state.
- Reloads reconstruct recent cockpit context from persisted records.
- Work item, validation, file, and failure states appear as clear conversational events.
- The conversation remains concise and useful.
- Users never see a blank or idle state while work is actually in progress.

---

## PHASE 6: Agent Repair Loop

### Intent
- Turn validation failures into an actionable repair path.
- Let the user continue from failure without manually translating validation output into a new prompt.

### Constraints
- Do not mark repair complete unless validation and persistence gates pass.
- Do not hide partial failure.
- Do not invent fixes unrelated to the validation evidence.
- Do not weaken existing completion truth.

### Acceptable Endstate
- Blocking validation issues produce a clear repair recommendation.
- The user can start a repair pass from the cockpit.
- Repair work is tied to the failed work item and validation evidence.
- Repair output is validated before persistence.
- Success means validated files are persisted.

---

## PHASE 7: Predictive Next Actions

### Intent
- Make next actions feel intelligent while remaining deterministic and explainable.
- Recommend the next useful step based on actual project state.

### Constraints
- Do not use hidden assumptions.
- Do not imply autonomous planning unless implemented.
- Do not call AI for prediction unless that layer is explicitly added.
- Do not route away from the cockpit for actions that can happen inline.

### Acceptable Endstate
- Next actions derive from persisted project, task, file, provider, validation, and run state.
- Each recommendation has an explainable reason.
- Inline actions happen inline.
- Inspection actions route only when inspection is actually needed.
- Unsupported future actions are not presented as available.

---

## PHASE 8: Runtime Truth Decision

### Intent
- Decide whether v1 remains validation-first or gains real runtime capability.
- Keep runtime language aligned with actual infrastructure.

### Constraints
- Do not use synthetic preview URLs.
- Do not claim serving, preview, deployment, or execution without real infrastructure.
- Do not blur validation checks with runtime execution.
- Do not preserve old validation-only copy if real runtime becomes true.

### Acceptable Endstate
- If v1 remains validation-first, the product consistently describes checks as validation only.
- If runtime is added, it actually boots and serves through real infrastructure.
- The right panel accurately reflects the chosen runtime mode.
- No UI copy, event, or database field implies capability that does not exist.

---

## PHASE 9: Production Release Truth

### Intent
- Ensure v1 can be shipped, tested, and explained without hidden caveats.
- Align product behavior, documentation, and user-facing claims.

### Constraints
- Do not ship unresolved truth gaps as known UX debt.
- Do not rely on internal knowledge to understand basic product behavior.
- Do not let docs describe behavior that source does not support.
- Do not treat local success as production readiness.

### Acceptable Endstate
- Auth, project creation, cockpit use, provider selection, generation, validation, repair, and file inspection work end-to-end.
- Typecheck and production build are clean.
- Production deployment succeeds.
- Current capability claims match live behavior.
- Settings are optional for normal use unless intentionally managing account or provider state.
- `CLAUDE.md`, `docs/system-state.md`, and this phase document are aligned with the product.
