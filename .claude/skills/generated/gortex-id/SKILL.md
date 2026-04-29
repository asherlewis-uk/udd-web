---
name: gortex-id
description: "Work in the [id] area — 4 symbols across 2 files (75% cohesion)"
---

# [id]

4 symbols | 2 files | 75% cohesion

## When to Use

Use this skill when working on files in:
- `app/(app)/projects/[id]/page.tsx`
- `lib/ai/repair.ts`

## Key Files

| File | Symbols |
|------|---------|
| `app/(app)/projects/[id]/page.tsx` | generationOperation |
| `lib/ai/repair.ts` | getRepairMetadata, isRecord, isRepairTaskInput |

## How to Explore

```
get_communities with id: "community-54"
smart_context with task: "understand [id]", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
