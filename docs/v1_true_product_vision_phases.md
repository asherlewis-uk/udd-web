# v1_true_product_vision_phases

This document defines the v1 product phase gates for UDD as an AI-native scaffolding, generation, validation, repair, and bounded runtime cockpit.

It does not replace `CLAUDE.md`, `docs/system-state.md`, or source code. Source remains implementation truth. This file defines the intended v1 product endstates by phase.

Each phase is complete only when the acceptable endstate is true in the product.

---

## PHASE 1: Generation Run Continuity

### Intent
- Make every cockpit submission feel like a coherent generation run, not a disconnected chat message.
- Treat each prompt as: intent in, generated files/status/proof out.
- Preserve the user's run history in a way that can be understood after refresh, navigation, or task completion.

### Constraints
- Do not invent messages or agent memory that are not backed by persisted data or an active optimistic submission.
- Do not render project metadata as if it were a recent user message.
- Do not expose raw internal task/event noise as conversation.
- Do not weaken task completion, validation, or persistence truth.

### Acceptable Endstate
- A submitted prompt appears immediately or near-immediately as part of the cockpit run history.
- Pending, running, completed, failed, and cancelled work states are visible as generation-run events.
- Reloading the cockpit reconstructs recent run history from persisted source-backed data.
- Generated output, validation result, failure, and recovery states are visually distinct.
- The cockpit feels like an AI-native generation surface, not a refreshed task dashboard.

---

## PHASE 2: Scaffold and Change Semantics

### Intent
- Make UDD's generation behavior legible as scaffolding and change operations.
- Preserve the Yeoman-relevant model: repeatable generation intent produces structured project files.
- Help users understand whether they are creating a new scaffold, editing existing files, refactoring, repairing, or validating.

### Constraints
- Do not introduce a plugin/generator marketplace.
- Do not add a separate Yeoman runtime dependency.
- Do not create fake generator types that the backend does not actually support.
- Do not obscure the difference between scaffold replacement and incremental changes.

### Acceptable Endstate
- The UI and task language distinguish scaffold, edit, refactor, repair, and validation flows where the source supports them.
- Scaffold behavior is understandable as a full file-set generation/replacement operation.
- Change operations are understandable as modifications against the existing saved file set.
- Users can tell what kind of generation run they are initiating or reviewing.
- UDD feels like an AI-native scaffolding/generation cockpit, not a generic chat interface that happens to write files.

---

## PHASE 3: Validation-to-Repair Loop

### Intent
- Turn validation failures into actionable repair runs.
- Use actual validation evidence as the input to repair behavior.
- Keep validation as the proof gate for generated or repaired files.

### Constraints
- Do not mark a repair as complete unless repaired files validate and persist.
- Do not hide blocking issues.
- Do not fabricate success after partial repair.
- Do not bypass `validateProject` or weaken validation severity semantics.
- Do not overwrite saved files with invalid repair output.

### Acceptable Endstate
- Blocking validation issues surface as repairable evidence.
- The cockpit offers a repair action tied to the failed generation run.
- Repair uses the actual validation evidence from the failed work item.
- Repair output goes through the same validation-before-persistence gate.
- Completion still means validated files were persisted.
- Failed repair remains visibly failed and recoverable.

---

## PHASE 4: Deterministic Generation Next Actions

### Intent
- Expand next-action logic so the cockpit suggests the next useful generation action from real project state.
- Keep recommendations deterministic, inspectable, and source-backed.
- Make the cockpit feel proactive without inventing hidden intelligence.

### Constraints
- Do not call AI to predict next actions in this phase.
- Do not infer from unstored assumptions.
- Do not suggest unavailable runtime, preview, deploy, BYOK, or repair behavior unless those capabilities are actually implemented.
- Do not route away for actions that can happen inline.

### Acceptable Endstate
- Next actions derive from persisted project, task, file, provider, validation, repair, and runtime state.
- Each suggested action has a plain-English reason.
- Inline actions happen inline.
- Inspection actions route only to detail surfaces.
- Blocked states include a recovery path.
- No recommendation depends on an unimplemented capability.

---

## PHASE 5: Bounded Runtime and Preview Truth

### Intent
- Implement the smallest real runtime/preview loop that completes the AI builder experience without pretending to be deployment or production hosting.
- Allow UDD to move from validated files to a real bounded preview when the generated project shape supports it.
- Preserve truth: if UDD says it runs or previews something, an actual execution path must exist.

### Constraints
- Do not create synthetic preview URLs.
- Do not claim deployment or production hosting.
- Do not imply AWS-scale infrastructure.
- Do not bypass validation.
- Do not treat runtime success as task completion unless generated files were validated and persisted.
- Do not hide startup, build, dependency, or runtime failures.
- Runtime may be ephemeral, single-user, time-limited, and dev-server-style if labeled honestly.

### Acceptable Endstate
- UDD can assemble generated saved files into a bounded runnable workspace when project shape supports it.
- A real process, sandbox, or preview mechanism starts when the user asks to run/preview.
- The right panel can show real runtime/preview status, logs, failure states, and stop/cleanup controls.
- Preview/running language appears only when real runtime exists.
- Runtime is clearly distinguished from deployment and production hosting.
- If a project cannot be run, the UI explains why and offers the next truthful repair or validation step.

---

## PHASE 6: Scaffolding Identity and Product Feel

### Intent
- Make UDD feel like a premium AI-native generation cockpit, not bland internal tooling.
- Express the product identity around generation runs, proof, repair, and preview.
- Preserve the single-input cockpit while making the interface memorable and competitive.

### Constraints
- Do not reintroduce dashboard clutter.
- Do not add visual spectacle that competes with the prompt input.
- Do not use gimmicky AI styling, generic SaaS cards, or misleading capability chrome.
- Do not use copy that outruns actual behavior.

### Acceptable Endstate
- The cockpit feels premium, precise, calm, and powerful.
- The prompt input remains the main visual and interaction center.
- The right panel feels like a meaningful generation/output viewport, not empty status filler.
- Provider controls, run controls, validation proof, and repair actions feel integrated into one product surface.
- The product has a distinct AI-native scaffolding identity.

---

## PHASE 7: V1 Release Truth

### Intent
- Ship v1 as a coherent AI-native scaffolding/generation cockpit with truthful end-to-end behavior.
- Ensure docs, source, UI, and deployed behavior agree.
- Remove critical dead ends before release.

### Constraints
- Do not add new ambition during release hardening.
- Do not hide known limitations.
- Do not leave stale docs or misleading copy.
- Do not mark v1 complete while core generation, validation, repair, BYOK, or runtime flows are broken.

### Acceptable Endstate
- Auth, project creation, cockpit prompting, provider/BYOK configuration, generation, saved files, validation, repair, bounded runtime/preview, and file inspection work end-to-end according to v1 scope.
- Typecheck and build pass.
- Production deployment succeeds.
- `CLAUDE.md`, `docs/system-state.md`, and this phase doc do not contradict shipped behavior.
- No fake preview, runtime, deployment, BYOK, credential, or success claims remain.
- Normal use does not require detouring through settings unless the user is intentionally managing account/provider credentials.
- UDD can be accurately described as an AI-native scaffolding/generation cockpit.

---

## Release Rule

A phase is complete only when the acceptable endstate is true in the product, not merely because code was written.

Later phases must not be described as implemented until source and deployed behavior prove them.
