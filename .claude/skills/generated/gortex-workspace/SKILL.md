---
name: gortex-workspace
description: "Work in the workspace area — 5 symbols across 1 files (93% cohesion)"
---

# workspace

5 symbols | 1 files | 93% cohesion

## When to Use

Use this skill when working on files in:
- `lib/workspace/next-action.ts`

## Key Files

| File | Symbols |
|------|---------|
| `lib/workspace/next-action.ts` | deriveNextAction, plural, nextActionOperation, providerBlockedAction, startValidationAction |

## Entry Points

- `lib/workspace/next-action.ts::deriveNextAction`

## Connected Communities

- **[id]** (1 cross-edges)
- **workspace** (1 cross-edges)

## How to Explore

```
get_communities with id: "community-6"
smart_context with task: "understand workspace", format: "gcx"
find_usages with id: "lib/workspace/next-action.ts::deriveNextAction", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
