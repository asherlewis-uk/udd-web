---
name: runtime-preview-review
description: review runtime preview, files, logs, run actions, and copy to separate real local preview behavior from ui-only state
---

# Runtime Preview Review

Use this skill for preview/runtime/files/logs reviews and any task involving run sessions or local preview truth.

## Required files

Inspect these files when present:

- `app/(app)/projects/[id]/run/page.tsx`
- `app/(app)/projects/[id]/files/page.tsx`
- `app/(app)/projects/[id]/logs/page.tsx`
- `components/mobile/preview-screen.tsx`
- `components/mobile/files-screen.tsx`
- `components/mobile/logs-screen.tsx`
- `lib/runtime/service.ts`
- `app/actions/run.ts`
- `components/run/*`

Read `docs/system-state.md` Runtime Pipeline, Files Tab, and Execution Semantics sections before reviewing.

## Required checks

Verify:

- Start and stop preview have real server-action paths.
- `preview_url` is shown only when a real running session provides it.
- Open-in-browser is disabled or absent without a real URL.
- Files surface reads persisted `project_files`, not staged task output.
- Console/log surface reads real `run_events` or `ai_task_events`.
- Empty states do not overclaim saved files, logs, runs, deployment, or live preview.
- Runtime copy says validation/local preview when that is what source does.
- Copy does not imply deployment or hosted serving unless real infrastructure exists.

## Evidence tracing

Trace runtime behavior end-to-end:

1. UI control or route.
2. Server action in `app/actions/run.ts`.
3. Service function in `lib/runtime/service.ts`.
4. Supabase table/field updated.
5. UI read path back to route/component.

For preview URLs, identify where `run_sessions.preview_url` is set and cleared.

## Output format

Use:

| Runtime surface | Status | Evidence | Notes |
| --- | --- | --- | --- |

Classify issues as:

- product truth
- broken behavior
- runtime uncertainty needing manual check
- UX polish
