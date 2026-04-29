<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **udd-web** (2423 symbols, 4844 relationships, 128 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/udd-web/context` | Codebase overview, check index freshness |
| `gitnexus://repo/udd-web/clusters` | All functional areas |
| `gitnexus://repo/udd-web/processes` | All execution flows |
| `gitnexus://repo/udd-web/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## Repo Intelligence Tooling

GitNexus and Gortex may both be installed.

Use GitNexus when existing project instructions explicitly require:
- gitnexus analyze
- gitnexus detect-changes
- GitNexus impact checks
- GitNexus metadata refresh

Use Gortex when deeper graph context is needed:
- symbol lookup
- call chains
- smart_context
- test target discovery
- contract checks
- cross-file or cross-repo impact analysis

Do not run both tools redundantly unless the task is high risk or one tool gives incomplete results.

If outputs disagree, stop and report the disagreement before editing.

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
