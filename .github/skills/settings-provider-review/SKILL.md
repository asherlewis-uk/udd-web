---
name: settings-provider-review
description: review account settings, project settings, provider selection, byok credential status, secret handling, and account deletion truth
---

# Settings Provider Review

Use this skill for account settings, project settings, provider status, BYOK, credential surfaces, and secret-truth reviews.

## Required files

Inspect these files when present:

- `app/(app)/settings/page.tsx`
- `app/(app)/projects/[id]/settings/page.tsx`
- `components/mobile/account-settings-screen.tsx`
- `components/mobile/settings-screen.tsx`
- `components/mobile/project-settings-screen.tsx`
- `components/settings/provider-form.tsx`
- `components/ai/provider-credential-control.tsx`
- `app/actions/provider-configs.ts`
- `app/actions/secrets.ts`
- `lib/secrets/index.ts`
- `lib/ai/providers/server.ts`

Read `docs/system-state.md` Provider Selection and Credential handling sections before judging expected behavior.

## Required checks

Verify and report:

- Whether credential entry exists on mobile, desktop, both, or neither.
- Whether credential status comes from server state, not client guesses.
- Whether provider selection is persisted through a real server action.
- Whether saved keys are never exposed client-side after save.
- Whether environment fallback is shown truthfully.
- Whether project settings have real save, archive, and delete behavior.
- Whether account deletion is real, disabled, absent, or only documented.

## Secret handling checks

Search targeted files for:

```bash
rg -n "api key|apikey|secret|credential|provider|localStorage|sessionStorage|auth\\.admin|service_role" app components lib scripts
```

Confirm:

- Secret values do not appear in props, events, logs, URLs, or client-readable metadata.
- Status APIs return presence booleans only.
- Save/delete actions validate ownership and revalidate affected routes.
- UI copy distinguishes saved user credentials from environment-managed fallback.

## Output format

Use:

| Surface | Status | Evidence | Risk |
| --- | --- | --- | --- |

Then list smallest safe fixes, separating security risks from UX gaps.
