---
name: mobile-shell-review
description: review mobile route shell, navigation, composer, drawer, action sheet, next action, and keyboard behavior for truthful wired mobile ux
---

# Mobile Shell Review

Use this skill for mobile cockpit, route shell, composer, drawer, action sheet, navigation, and keyboard reviews.

## Required files

Inspect these files when present:

- `components/mobile/mobile-shell.tsx`
- `components/mobile/chat-build-screen.tsx`
- `components/mobile/composer.tsx`
- `components/mobile/project-drawer.tsx`
- `components/mobile/project-actions-menu.tsx`
- `components/mobile/bottom-controls.tsx`
- `app/(app)/projects/[id]/page.tsx`
- `app/(app)/projects/page.tsx`
- `app/(app)/projects/new/page.tsx`

Also inspect any imported child that owns a visible button, form action, drawer state, or route transition.

## Source tracing

For every visible control, trace:

1. Component prop or local state.
2. Event handler.
3. Server action, route link, or disabled state.
4. Persisted effect, if the UI claims one.

Use graph tools for symbols when available; otherwise read targeted file ranges.

## Required checks

- Verify there is one mobile shell/header per route.
- Verify route chrome is not duplicated between route page and shell.
- Verify visible buttons either work or are disabled with truthful copy.
- Trace plus, mic, and send behavior to a handler or mark it as unwired.
- Check keyboard behavior for composer visibility and unusable overlays.
- Verify project pill and drawer behavior are real and route-safe.
- Verify action sheet preview/start/stop/settings links are wired to real routes/actions.
- Verify `nextAction` is visible if computed and passed.
- Compare mobile and desktop surfaces for divergence that affects product truth.

## Truthfulness rules

- Do not accept "coming soon", fake preview, fake run, or fake deploy copy as harmless if it implies behavior exists.
- Treat local optimistic UI as temporary UI state unless it is backed by persisted Supabase records.
- Treat disabled controls as acceptable only when the reason is visible and accurate.

## Output format

Report:

| Surface | Finding | Evidence | Fix |
| --- | --- | --- | --- |

Separate:

1. Product truth issues.
2. Broken or unwired controls.
3. Mobile/desktop divergence.
4. UX polish that is not a blocker.
