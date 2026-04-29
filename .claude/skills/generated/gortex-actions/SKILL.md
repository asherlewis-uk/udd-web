---
name: gortex-actions
description: "Work in the actions area — 5 symbols across 2 files (53% cohesion)"
---

# actions

5 symbols | 2 files | 53% cohesion

## When to Use

Use this skill when working on files in:
- `app/actions/ai.ts`
- `lib/ai/repair.ts`

## Key Files

| File | Symbols |
|------|---------|
| `app/actions/ai.ts` | extractRepairEvidence, repairFailedTask |
| `lib/ai/repair.ts` | repairTaskKindFor, buildRepairTaskTitle, buildRepairDisplayPrompt |

## Entry Points

- `app/actions/ai.ts::repairFailedTask`

## Connected Communities

- **actions** (2 cross-edges)
- **actions** (1 cross-edges)
- **actions** (1 cross-edges)
- **ai** (1 cross-edges)
- **runtime** (1 cross-edges)
- **validation** (1 cross-edges)

## How to Explore

```
get_communities with id: "community-49"
smart_context with task: "understand actions", format: "gcx"
find_usages with id: "app/actions/ai.ts::repairFailedTask", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
