## Repo operating contract

This repo is governed by `CLAUDE.md`, `AGENTS.md`, `docs/system-state.md`, `docs/first_beta_remaining_work_audit.md`, and the task-specific skills in `.github/skills/`.

- Read the relevant canonical docs before product work. Use `docs/first_beta_remaining_work_audit.md` as the active beta work queue, and use `.github/skills/*` for task-specific workflows.
- Treat TypeScript, SQL, and server-action implementation as source of record. If docs, graph output, or comments conflict with source, follow source and report the drift.
- Use Gortex/GitNexus when available for symbol lookup, callers, impact, and execution-flow context. Keep graph output targeted; do not paste broad JSON or route dumps into final answers.
- Preserve product truth: do not claim execution, live preview, deployment, persistence, credential storage, or completion unless source implements and uses the real path.
- Do not present invented capability as real, ship unfinished-behavior shims, leave dead controls, make unsupported claims, put sample-only behavior in production, or defer required work in comments.
- Keep changes scoped. Inspect staged and unstaged diffs separately, never stage unrelated files, and never mix tooling/config drift with product commits unless explicitly requested.
- Preserve security boundaries: no client-side secrets, unsafe credential UI, fake account deletion, or weakening of auth, RLS, BYOK, owner filtering, or server-only secret handling.
- Verify product changes with `pnpm typecheck`, `pnpm build`, `git --no-pager diff --check`, `git --no-pager status --short`, and `git --no-pager diff --stat` unless the task is docs/skills-only and a narrower check is justified.
- Report uncertainty instead of guessing. Separate evidence-backed findings from assumptions, UX polish, and runtime checks still needed.

## Hermes / fleet prompt workflow

- When a task is driven by `docs/user_next_prompt.md`, reread the current file before dispatching agents. If the prompt has changed since prior blocked todos were created, reconcile the SQL todo queue and dependencies to the current prompt before continuing.
- Use only skills that are actually present in `.github/skills/` or available through the CLI skill tool. If a prompt names unavailable skills, report that mismatch and map the intent to the closest available repo skill instead of claiming the missing skill was loaded.
- For migration-doc rotations and Hermes handoffs, the bring-back file is part of the deliverable. Do not mark the task complete until required line counts, citation checks, self-audits, and `docs/user_bring_back_agent_response_to_hermes.md` have been written or explicitly reported as blocked.
- For final gates that depend on an independent review, preserve the reviewer verdict as durable evidence in the bring-back report or a session artifact. If a background review result cannot be retrieved, rerun the review before committing rather than relying on the notification alone.

<!-- gortex:communities:start -->
<!-- gortex:skills:start -->
## Community Skills

| Area | Description | Skill |
|------|-------------|-------|
| Runtime | 14 symbols | `/gortex-runtime` |
| Id | 10 symbols | `/gortex-id` |
| App Actions | 8 symbols | `/gortex-app-actions` |
| Scripts | 8 symbols | `/gortex-scripts` |
| App App Projects Id Logs | 8 symbols | `/gortex-app-app-projects-id-logs` |
| Actions | 7 symbols | `/gortex-actions` |
| Validation | 7 symbols | `/gortex-validation` |
| Scripts | 6 symbols | `/gortex-scripts` |
| Runtime | 6 symbols | `/gortex-runtime` |
| Hooks | 5 symbols | `/gortex-hooks` |
| Ui | 5 symbols | `/gortex-ui` |
| Ui | 5 symbols | `/gortex-ui` |
| Actions | 5 symbols | `/gortex-actions` |
| Hooks | 5 symbols | `/gortex-hooks` |
| Workspace | 5 symbols | `/gortex-workspace` |
| Ui | 5 symbols | `/gortex-ui` |
| Validation | 5 symbols | `/gortex-validation` |
| Runtime | 5 symbols | `/gortex-runtime` |
| App Actions | 5 symbols | `/gortex-app-actions` |
| Id | 4 symbols | `/gortex-id` |
<!-- gortex:skills:end -->

<!-- gortex:communities:end -->
