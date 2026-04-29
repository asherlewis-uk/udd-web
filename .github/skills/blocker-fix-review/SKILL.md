---
name: blocker-fix-review
description: review or implement named beta blocker fixes only; use for p0 or blocking issues from the first beta audit without expanding scope
---

# Blocker Fix Review

Use this skill when the user asks to review or implement a known blocker from `docs/first_beta_remaining_work_audit.md`.

## Scope gate

Before editing, read:

- `CLAUDE.md` Product Truth Contract
- `docs/system-state.md` section relevant to the behavior
- `docs/first_beta_remaining_work_audit.md`

Work only on named `P0` or `BLOCKING` issue IDs. If the user asks broadly to "fix blockers", list the specific IDs you will handle before editing.

Current known blocker categories include:

- mobile provider credential documentation/source mismatch
- `nextAction` computed but hidden from mobile
- account deletion backend gap

## Before editing

Report the expected files before touching them. Include why each file is in scope.

Use graph tools when available:

```text
gitnexus_impact({target: "<symbol>", direction: "upstream"})
gortex-get_editing_context(path: "<file>")
```

Do not edit product or backend code unless the blocker requires it and the touched files were declared first.

## Implementation constraints

- Do not create fake capability to satisfy a blocker.
- Do not add TODOs, placeholders, stubs, demo data, or copy that implies future behavior is present.
- Do not add schema or backend changes unless explicitly justified before editing.
- Keep user-facing copy aligned with actual durable behavior.
- Preserve `docs/system-state.md` and the audit doc unless the user explicitly asked to update them.

## Verification after editing

Run the smallest sufficient checks, then broader checks if source changed:

```bash
pnpm typecheck
pnpm build
git --no-pager diff --check
git --no-pager status --short
```

If product behavior changed, also inspect relevant route/component surfaces manually.

## Review output

Report blocker status using:

- `complete` — blocker is fixed and verified.
- `partial` — real progress exists, but acceptance criteria remain.
- `not complete` — blocker remains.
- `regressed` — behavior became less truthful, less secure, or less functional.

Include evidence:

| Blocker | Status | Evidence | Remaining risk |
| --- | --- | --- | --- |
