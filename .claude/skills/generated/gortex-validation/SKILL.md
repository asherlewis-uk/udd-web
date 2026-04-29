---
name: gortex-validation
description: "Work in the validation area — 5 symbols across 1 files (86% cohesion)"
---

# validation

5 symbols | 1 files | 86% cohesion

## When to Use

Use this skill when working on files in:
- `lib/validation/resolver.ts`

## Key Files

| File | Symbols |
|------|---------|
| `lib/validation/resolver.ts` | classifyImport, dirnameOf, trimLeadingSlash, extractPackageName, joinPath |

## How to Explore

```
get_communities with id: "community-3"
smart_context with task: "understand validation", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
