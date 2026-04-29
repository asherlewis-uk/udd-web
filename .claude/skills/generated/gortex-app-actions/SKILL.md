---
name: gortex-app-actions
description: "Work in the app/actions area — 5 symbols across 4 files (67% cohesion)"
---

# app/actions

5 symbols | 4 files | 67% cohesion

## When to Use

Use this skill when working on files in:
- `app/actions/provider-configs.ts`
- `components/ai/provider-switcher.tsx`
- `components/mobile/account-settings-screen.tsx`
- `components/settings/provider-form.tsx`

## Key Files

| File | Symbols |
|------|---------|
| `app/actions/provider-configs.ts` | saveAIProviderConfig, sanitizeMetadata |
| `components/ai/provider-switcher.tsx` | handleChange |
| `components/mobile/account-settings-screen.tsx` | saveProvider |
| `components/settings/provider-form.tsx` | handleSave |

## Entry Points

- `components/ai/provider-switcher.tsx::handleChange`
- `components/settings/provider-form.tsx::handleSave`

## Connected Communities

- **actions** (1 cross-edges)
- **providers** (1 cross-edges)
- **runtime** (1 cross-edges)
- **app/actions** (1 cross-edges)

## How to Explore

```
get_communities with id: "community-33"
smart_context with task: "understand app/actions", format: "gcx"
find_usages with id: "components/ai/provider-switcher.tsx::handleChange", format: "gcx"
```

_`format: "gcx"` returns the [GCX1 compact wire format](../../docs/wire-format.md) — round-trippable, ~27% fewer tokens than JSON. Drop it for JSON output; agents using `@gortex/wire` or the Go `github.com/gortexhq/gcx-go` package decode either._
