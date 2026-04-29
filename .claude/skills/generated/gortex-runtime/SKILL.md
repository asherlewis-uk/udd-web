---
name: gortex-runtime
description: "Work in the runtime area — 5 symbols across 1 files (93% cohesion)"
---

# runtime

5 symbols | 1 files | 93% cohesion

## When to Use

Use this skill when working on files in:
- `lib/runtime/local-preview.ts`

## Key Files

| File | Symbols |
|------|---------|
| `lib/runtime/local-preview.ts` | hostDependencyNames, dependencyNames, parsePackageJson, validateNextPreviewShape, hasAnyPath |

## How to Explore

```
get_communities with id: "community-37"
smart_context with task: "understand runtime", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
