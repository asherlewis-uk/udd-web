---
name: gortex-scripts
description: "Work in the scripts area — 6 symbols across 1 files (100% cohesion)"
---

# scripts

6 symbols | 1 files | 100% cohesion

## When to Use

Use this skill when working on files in:
- `scripts/001_init_schema.sql`

## Key Files

| File | Symbols |
|------|---------|
| `scripts/001_init_schema.sql` | display_name, public, updated_at, avatar_url, created_at, ... |

## How to Explore

```
get_communities with id: "community-45"
smart_context with task: "understand scripts", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
