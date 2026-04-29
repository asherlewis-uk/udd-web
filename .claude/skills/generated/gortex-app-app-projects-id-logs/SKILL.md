---
name: gortex-app-app-projects-id-logs
description: "Work in the app/(app)/projects/[id]/logs area — 8 symbols across 5 files (85% cohesion)"
---

# app/(app)/projects/[id]/logs

8 symbols | 5 files | 85% cohesion

## When to Use

Use this skill when working on files in:
- `app/(app)/projects/[id]/logs/page.tsx`
- `app/(app)/projects/[id]/page.tsx`
- `app/(app)/projects/[id]/settings/page.tsx`
- `components/run/sessions-history.tsx`
- `lib/slug.ts`

## Key Files

| File | Symbols |
|------|---------|
| `app/(app)/projects/[id]/logs/page.tsx` | LogsPage |
| `app/(app)/projects/[id]/page.tsx` | toMobileRunSession, toMobileRunEvent |
| `app/(app)/projects/[id]/settings/page.tsx` | toMobileProject, toMobileRunSession, ProjectSettingsPage |
| `components/run/sessions-history.tsx` | SessionsHistory |
| `lib/slug.ts` | formatRelative |

## Entry Points

- `app/(app)/projects/[id]/logs/page.tsx::LogsPage`
- `app/(app)/projects/[id]/settings/page.tsx::ProjectSettingsPage`

## Connected Communities

- **app/actions** (2 cross-edges)
- **actions** (2 cross-edges)

## How to Explore

```
get_communities with id: "community-36"
smart_context with task: "understand app/(app)/projects/[id]/logs", format: "gcx"
find_usages with id: "app/(app)/projects/[id]/logs/page.tsx::LogsPage", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
