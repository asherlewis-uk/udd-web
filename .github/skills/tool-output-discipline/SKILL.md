---
name: tool-output-discipline
description: prevent token explosions, broad graph dumps, repeated loops, and noisy final answers during repo exploration or verification
---

# Tool Output Discipline

Use this skill when a task risks large tool output, broad graph dumps, repeated searches, or noisy final reporting.

## Tool-use discipline

- Prefer targeted file ranges over whole-repo dumps.
- Use code intelligence tools before broad text search when looking for symbols or relationships.
- Use `rg` with narrow paths and `head_limit` when searching large trees.
- Avoid broad graph summaries on large route files; ask for specific symbols, callers, or edit context.
- Do not paste large Gortex or GitNexus JSON into final answers.
- Summarize tool output in concise bullets and tables.
- Separate raw search output from final findings.

## Loop guard

Stop and report if:

- The same search is repeated without new constraints.
- Tool calls exceed the requested scope.
- Graph tools and source disagree.
- A build/test command is being rerun without code changes.
- Exploration has enough evidence to answer or edit safely.

When stopped, say what is known, what remains unknown, and the next smallest useful check.

## Build/test discipline

- Run full `pnpm typecheck` and `pnpm build` when product code changed or release verification requires them.
- Do not repeat full checks after docs-only or skill-only edits unless required by the user.
- For markdown/skill changes, prefer `git diff --check`, targeted grep, and file listing.
- Capture failure summaries, not full successful logs.

## Final answer discipline

Lead with the outcome. Include:

- changed files or findings
- verification summary
- remaining dirty files when relevant
- staging guidance when relevant

Do not include:

- full command logs
- raw graph JSON
- broad unrelated repo summaries
- speculative claims without evidence
