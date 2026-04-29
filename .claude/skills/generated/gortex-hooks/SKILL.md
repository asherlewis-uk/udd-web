---
name: gortex-hooks
description: "Work in the hooks area — 5 symbols across 1 files (86% cohesion)"
---

# hooks

5 symbols | 1 files | 86% cohesion

## When to Use

Use this skill when working on files in:
- `hooks/use-toast.ts`

## Key Files

| File | Symbols |
|------|---------|
| `hooks/use-toast.ts` | dispatch, useToast, toast, genId, dismiss |

## Entry Points

- `hooks/use-toast.ts::useToast`

## Connected Communities

- **hooks** (1 cross-edges)

## How to Explore

```
get_communities with id: "community-18"
smart_context with task: "understand hooks", format: "gcx"
find_usages with id: "hooks/use-toast.ts::useToast", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
