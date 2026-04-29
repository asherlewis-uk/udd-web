---
name: release-verification
description: run final beta, handoff, or pre-commit verification with build checks, dirty state, marker grep, and mobile route checklist
---

# Release Verification

Use this skill before a commit, beta handoff, TestFlight handoff, or final review.

## Required commands

Run exactly the checks that apply to the current repo state:

```bash
pnpm typecheck
pnpm build
git --no-pager diff --check
git --no-pager status --short
git --no-pager diff --stat
git --no-pager diff --cached --stat
rg -n "TODO|FIXME|mock|demo|fake|stub|unavailable|coming soon|href=\"#\"" app components lib docs scripts .github
```

If only docs or skill files changed, still run `git diff --check`, status, diff stats, and marker grep for changed paths. Do not rerun full build repeatedly unless code changed after the last run.

## Manual route checklist

For mobile route changes, inspect the route source and, when a dev server is already available, manually exercise:

- `/projects`
- `/projects/new`
- `/projects/[id]`
- `/projects/[id]/run`
- `/projects/[id]/files`
- `/projects/[id]/logs`
- `/projects/[id]/settings`
- `/settings`

Check route shell/header, drawer, action sheet, composer visibility, empty states, disabled controls, and truthful preview/provider copy.

## Required report

Report:

- Pass/fail for each command.
- Exact command output summary, not full logs unless failure details are needed.
- Remaining dirty files from `git status --short`.
- Whether staged state is safe to commit.
- Files ready to stage.
- Files that must not be staged with this work.

## Safety rules

- Do not claim release readiness if typecheck or build fails due to current changes.
- If failures appear pre-existing, show evidence and say readiness is blocked by baseline failures.
- Do not hide marker-grep hits; classify them as acceptable, risky, or needing removal.
- Do not commit.
