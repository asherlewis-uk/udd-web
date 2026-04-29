---
name: change-hygiene
description: keep commits clean by separating product, docs, tooling, generated, and unrelated drift; use before staging, committing, or reviewing dirty worktrees
---

# Change Hygiene

Use this skill before staging, committing, or preparing a handoff from a dirty worktree.

## Required checks

Run:

```bash
git --no-pager status --short
git --no-pager diff --cached --stat
git --no-pager diff --stat
git --no-pager diff --cached
git --no-pager diff
```

Inspect staged and unstaged diffs independently. Do not infer staged content from status alone.

## File classification

Classify every changed file as one of:

- `product` — app/runtime/component/server-action/source behavior.
- `docs` — markdown or user/operator documentation.
- `tooling/config` — agent config, MCP config, CI, package scripts, lint/build config.
- `generated` — generated skills, build output, lock/cache artifacts, index output.
- `unrelated drift` — changes not connected to the current user request.
- `unknown` — unclear ownership; do not stage until clarified.

## Commit hygiene rules

- Never include unrelated `.mcp.json`, `AGENTS.md`, `CLAUDE.md`, generated skill, or tool-config changes in a product commit unless the user explicitly asks.
- Never stage all files blindly.
- Verify the exact file list that is ready to stage before suggesting `git add`.
- Keep product changes, docs updates, and tooling changes separate unless the task explicitly spans them.
- Preserve user changes. Do not restore or remove files you did not prove are unrelated to the current task.

## Restore/remove recommendations

Recommend cleanup commands only after showing evidence that the files are unrelated:

```bash
git --no-pager diff -- <path>
git --no-pager diff --cached -- <path>
```

Use non-destructive wording first. Prefer:

```bash
git restore --staged -- <path>
git restore -- <path>
rm -- <untracked-file>
```

Do not run destructive cleanup unless the user requested it.

## Output format

Report:

| File | State | Class | Include? | Reason |
| --- | --- | --- | --- | --- |

Then provide:

1. Files ready to stage.
2. Files to leave untouched.
3. Commands to stage only approved files.
4. Any unresolved ownership questions.
