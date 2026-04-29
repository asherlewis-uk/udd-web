---
name: repo-truth-audit
description: audit repository truth, docs drift, implemented behavior, mobile desktop divergence, or product claims before editing; use for capability audits and source of truth reviews
---

# Repo Truth Audit

Use this skill to audit what UDD actually implements. Do not edit files during an audit task.

## Required orientation

Read the relevant sections before drawing conclusions:

- `CLAUDE.md`
- `AGENTS.md`
- `docs/system-state.md`
- `docs/first_beta_remaining_work_audit.md`

Treat TypeScript, SQL, and server-action implementation as the source of record. Docs describe intent and constraints, but source wins when they conflict.

Use Gortex/GitNexus when available for symbol lookup, callers, and impact context. If graph output conflicts with source, report the disagreement and follow source.

## Git state check

Inspect staged and unstaged state separately before reviewing:

```bash
git --no-pager status --short
git --no-pager diff --cached --stat
git --no-pager diff --stat
git --no-pager diff --cached -- <path>
git --no-pager diff -- <path>
```

Mention whether findings are based on HEAD, staged changes, unstaged changes, or a combination.

## Classification labels

Classify each capability using exactly one of these labels:

- `IMPLEMENTED` — source contains a wired, durable, user-reachable implementation.
- `PARTIAL` — some real implementation exists, but important behavior is missing.
- `DISABLED` — UI or route intentionally disables the capability with truthful copy.
- `MISLEADING` — UI/docs/logs imply behavior that source does not provide.
- `DOC_ONLY` — docs/spec mention behavior with no source implementation.
- `STALE_DOC` — docs contradict current source behavior.
- `NEEDS_RUNTIME_CHECK` — source suggests behavior, but a real run/manual check is needed.
- `NOT_APPLICABLE` — the capability is out of scope for the audited surface.

## Coverage checklist

Cover every relevant surface, and mark `NOT_APPLICABLE` only with a reason:

- auth/session
- project creation/list/detail
- mobile shell
- composer/generation
- provider/BYOK
- runtime preview
- files/code
- console/logs
- project settings
- account settings
- account/project deletion
- loading/empty/error states
- desktop/mobile divergence
- docs/source drift

## Evidence standard

Report evidence with file paths and symbols, not impressions:

- Use `path:line` where line numbers are available.
- Name functions, components, server actions, SQL tables, and props.
- Distinguish UI-only state from persisted database state.
- Quote short user-facing copy only when it proves a truthfulness issue.
- Label uncertainty instead of speculating.

## Output format

Use a compact table for audited capabilities:

| Capability | Status | Evidence | Notes |
| --- | --- | --- | --- |

Then list:

1. Product truth violations.
2. Docs/source drift.
3. Runtime checks still needed.
4. Smallest safe fixes, if the user asked for recommendations.
