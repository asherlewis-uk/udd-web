# First Beta Remaining Work Audit

**Purpose:** Master inventory of every fake, broken, placeholder, unwired, TODO, drifted, visually
inconsistent, incomplete, unsafe, or beta-blocking issue remaining before the first TestFlight beta
release. Each entry is grounded in source evidence and written to dispatch focused subagents.

**Audit method:** Full source read of all `app/`, `components/`, `lib/`, `middleware.ts`,
`docs/system-state.md`, `CLAUDE.md`, and `AGENTS.md`. Graph-assisted via GitNexus MCP (caller
analysis, dead-code detection). Performed on clean branch `main` with no uncommitted changes.

**Setup checks at audit time:**
- `git status`: clean
- `gortex status`: 1548 nodes, 4000 edges, daemon healthy
- `npx gitnexus detect-changes`: no changes

**Current working-tree resolution note:** HIGH items B-1, B-3, C-1, F-1, and G-2 have been addressed in the current working tree. A-1 is resolved by implementing mobile credential controls and updating `docs/system-state.md`; A-2 remains surfaced through `nextAction` instead of being dropped.

---

## Severity Scale

| Level | Meaning |
|-------|---------|
| **BLOCKING** | Must be resolved before any TestFlight build ships |
| **HIGH** | Strong recommendation to fix before beta; real user-visible failure |
| **MEDIUM** | Should fix before beta; degrades UX or violates invariants |
| **LOW** | Fix after first beta; polish, cleanup, or non-critical inconsistency |

---

## A — Product Truth Contract Violations

Issues that violate the invariants in `CLAUDE.md §Product Truth Contract`. These are
non-negotiable per repo policy.

---

### A-1 · system-state.md claims mobile Settings renders `ProviderCredentialControl` — source says it does not

**Severity:** BLOCKING (§5 UI Copy Truth, §6 No Silent Deception)

**Location:** `docs/system-state.md:231`, `components/mobile/account-settings-screen.tsx`

**Evidence:**
`system-state.md` line 231 states:

> "global mobile `/settings` is the mobile account/provider management surface and renders
> `ProviderCredentialControl` for normal credential save/replace/delete."

Source reading of `MobileAccountSettingsScreen` (the component rendered at `/settings` on mobile)
shows the "Credentials" section (`account-settings-screen.tsx:206–246`) displays per-provider
`Saved` / `Missing` status badges only. `ProviderCredentialControl` is **not imported and not
rendered** in this file. There is no save, replace, or delete action for credentials on mobile.

The copy at line 207 reads: "Save and replace provider keys from the desktop app." — which confirms
credential management is intentionally desktop-only, but this directly contradicts what
`system-state.md` claims.

**What to fix:**
1. Update `docs/system-state.md:231` to accurately state that mobile Settings is status-display
   only for credentials, and that save/replace/delete requires the desktop Settings surface.
2. OR implement `ProviderCredentialControl` in `MobileAccountSettingsScreen` to make the source
   match the spec. (Decision belongs to the product owner — do not guess.)
3. Whichever path is chosen, the copy at `account-settings-screen.tsx:207–211` must accurately
   describe the actual available action.

---

### A-2 · `nextAction` is computed on every cockpit render but never surfaced in any UI

**Severity:** BLOCKING (§1 Execution Truth, §6 No Silent Deception)

**Location:** `app/(app)/projects/[id]/page.tsx:249–258`, `components/mobile/mobile-shell.tsx`

**Evidence:**
The cockpit page calls `deriveNextAction(...)` on every render (line 249) and passes the result as
`nextAction` to `MobileShell` (line 304). `MobileShellProps` declares `nextAction: NextAction`
(types.ts:101). But `MobileShell` (`mobile-shell.tsx:11–22`) does **not destructure `nextAction`**
and passes it to no child component.

`NextAction` has a rich output type: `code`, `label`, `description`, `cta` with actionable
recovery paths for states like `repair_failed_generation`, `provider_blocked_for_generation`,
`validate_saved_files`, etc. (`lib/workspace/next-action.ts:63–105`). This entire recommendation
engine is implemented but its output is silently dropped on every render.

**What to fix:**
Decide and implement one of:
1. Surface `nextAction` in the cockpit UI (e.g. as a next-step hint or CTA above the composer).
   Wire `nextAction` through `MobileShell` → `ChatBuildScreen`.
2. Or explicitly document in `system-state.md` that `deriveNextAction` is computed but intentionally
   not yet surfaced (specify when it will be). Remove it from `MobileShellProps` if truly unused.
Do not leave it in a state where it is computed, typed, serialized, sent to the client, and dropped.

---

## B — Dead Code / Prototype Residue

### B-1 · `incoming-ui/udd-mobile/` — standalone demo prototype with hardcoded fake data in the tracked repo

**Severity:** HIGH

**Location:** `incoming-ui/udd-mobile/`

**Evidence:**
`incoming-ui/udd-mobile/` is a complete standalone Next.js app with its own `app/`, `components/`,
`data/`, `types/`, `hooks/`, and `lib/` trees. It contains hardcoded demo data:

- `incoming-ui/udd-mobile/data/demo-projects.ts` — 6 fake `DemoProject` records (`"UDD AI app
  builder"`, `"Nano Banana playground"`, etc.) with hardcoded timestamps (`"2 hours ago"`)
- `incoming-ui/udd-mobile/types/demo.ts` — `DemoProject`, `Screen`, `AppState` types tied to the
  demo, including `isGenerating: boolean` (mock generation state)

The main app does not import from `incoming-ui/` — `system-state.md` explicitly notes "the server
route … does not import state from the `incoming-ui` prototype." The prototype is tracked in the
repo but is dead weight for beta.

**What to fix:**
Delete `incoming-ui/` entirely, or move it outside the repo. It should not be present in any
TestFlight build. Its presence could confuse subagents navigating the codebase and causes GitNexus
to index ~100+ duplicate symbol nodes (confirmed: two `BottomControls`, two `Toaster`, two
`useIsMobile`, etc. across the 1548-node graph).

---

### B-2 · `BottomControls` component — zero callers, never used

**Severity:** MEDIUM

**Location:** `components/mobile/bottom-controls.tsx`

**Evidence:**
GitNexus `context()` on `BottomControls` (uid
`Function:components/mobile/bottom-controls.tsx:BottomControls`) returns `incoming: {}` — no
callers in the main app. The component defines a three-button bottom bar (Chat, Preview, Actions)
that was clearly designed as the primary cockpit navigation, but `MobileShell` renders its own
inline navigation instead.

**What to fix:**
Either wire `BottomControls` into `MobileShell` (replacing the ad-hoc navigation in
`ChatBuildScreen` and `PreviewScreen` headers) or delete the file. Do not ship dead components.

---

### B-3 · Six `MobileShellProps` fields computed, serialized, sent to client, and silently dropped

**Severity:** HIGH

**Location:** `components/mobile/types.ts:89–106`, `components/mobile/mobile-shell.tsx:11–22`,
`app/(app)/projects/[id]/page.tsx:270–308`

**Evidence:**
`MobileShellProps` declares these fields: `files: MobileFileSummary[]`, `latestTask:
MobileTaskSummary | null`, `latestRunSummary: RuntimeSummary | null`, `validationSummary:
ValidationSummary | null`, `nextAction: NextAction`, `runInFlight: boolean`.

The cockpit page computes all six, passes them to `<MobileShell>`. The `MobileShell` function
destructures only: `project, projects, profile, conversation, filesCount, latestRunSession,
runEvents, activeProvider, providerReadiness, taskInFlight`. The six typed props are never
destructured and flow to no child.

This means per render: Supabase queries for files and task data are executed server-side,
`deriveNextAction` runs, `summarizeRuntimeEvents` runs, `extractValidationSummary` runs, all
results are serialized to JSON, sent over the wire, parsed on the client — then ignored.

**What to fix:**
For each of the six props, decide: wire it to a consuming component, or remove it from the type and
the cockpit page's `MobileShell` call site. Do not leave orphaned computed data in the props
boundary. See A-2 for `nextAction` specifically.

---

## C — Bugs

### C-1 · Mobile project delete has no error handling — failures are silently swallowed

**Severity:** HIGH

**Location:** `components/mobile/project-settings-screen.tsx:200–213`

**Evidence:**
The `AlertDialogAction` for deleting a project from the mobile Settings screen calls:
```tsx
onClick={() =>
  startTransition(async () => {
    await deleteProject(project.id);
  })
}
```
No `try/catch`. No `toast.error`. If `deleteProject` throws (RLS failure, network error, server
error), the user sees nothing — the dialog closes, the project is still there, no feedback.

Compare to the desktop implementation in `components/workspace/project-danger-zone.tsx:79–84`:
```tsx
try {
  await deleteProject(project.id)
  toast.success("Project deleted")
} catch (err) {
  toast.error(err instanceof Error ? err.message : "Failed")
}
```

The mobile version also has no success toast, while the desktop version does.

**What to fix:**
Wrap the `deleteProject` call in a try/catch, add `toast.success("Project deleted")` on success,
and `toast.error(...)` on failure — matching the desktop pattern.

---

### C-2 · `updateProjectStatus` does not revalidate the settings page path

**Severity:** MEDIUM

**Location:** `app/actions/projects.ts:63–73`

**Evidence:**
```ts
export async function updateProjectStatus(id: string, status: ProjectStatus) {
  ...
  revalidatePath("/projects")
  revalidatePath(`/projects/${id}`)
}
```
After archive/restore from the project settings page (`/projects/[id]/settings`), the settings page
itself is not revalidated. If a user archives from that page and stays on it, the displayed status
badge remains stale until full navigation away and back.

**What to fix:**
Add `revalidatePath(`/projects/${id}/settings`)` to `updateProjectStatus`.

---

### C-3 · `WorkspaceError` error boundary renders desktop layout only — mobile shows unstyled error

**Severity:** MEDIUM

**Location:** `app/(app)/projects/[id]/error.tsx:20`

**Evidence:**
```tsx
<main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-8">
```
No `md:` prefix, no mobile wrapper. On mobile viewport, an error loading a project workspace shows
a wide desktop error card not optimized for narrow screens. All other route error/empty states
have mobile variants.

**What to fix:**
Add responsive treatment or wrap in a mobile-aware shell. At minimum, remove `max-w-6xl` on small
screens so the card fits.

---

## D — UI Copy / Visual Inconsistencies

### D-1 · `UserMenu` has two separate nav items that both link to `/settings`

**Severity:** MEDIUM

**Location:** `components/app/user-menu.tsx:43–55`

**Evidence:**
```tsx
<DropdownMenuItem asChild>
  <Link href="/settings">
    <User className="mr-2 h-4 w-4" />
    Account           {/* → /settings */}
  </Link>
</DropdownMenuItem>
<DropdownMenuItem asChild>
  <Link href="/settings">
    <Settings className="mr-2 h-4 w-4" />
    Settings          {/* → /settings */}
  </Link>
</DropdownMenuItem>
```
Two items, two different labels and icons, same destination. One should be removed, or they should
point to distinct destinations (e.g. `/settings#profile` vs `/settings#provider` with anchor
navigation, or a future separate account page).

**What to fix:**
Remove the duplicate. Keep one item. "Account" with the User icon is the more informative label
if the destination is the Settings page that includes both profile and provider sections.

---

### D-2 · `EmptyChatState` — no onboarding copy or call-to-action for new users

**Severity:** MEDIUM

**Location:** `components/mobile/chat-build-screen.tsx:90–99`

**Evidence:**
```tsx
function EmptyChatState() {
  return (
    <div className="flex h-full min-h-96 items-center justify-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border ...">
        <span className="text-lg font-semibold tracking-wide text-muted-foreground">UDD</span>
      </div>
    </div>
  )
}
```
When a user opens a new project with no conversation history, the chat area shows only a circular
badge with the text "UDD". There is no welcoming copy, no hint about what to type, no example
prompts, and no visual affordance pointing to the composer below.

**What to fix:**
Add onboarding copy to `EmptyChatState` — at minimum a headline and a one-line instruction (e.g.
"Describe what you want to build" or similar). This is the first thing a new beta user sees on their
first project.

---

### D-3 · Project Actions Menu shows "Preview: idle" — internal state term exposed to users

**Severity:** LOW

**Location:** `components/mobile/project-actions-menu.tsx:71–73`

**Evidence:**
```tsx
<div className="text-xs capitalize text-muted-foreground">
  Preview: {status}
</div>
```
When `runSession` is null or status is `"idle"`, this renders "Preview: idle". `capitalize` CSS
makes it "Preview: Idle" but "Idle" is an internal `RunStatus` enum value, not user-facing copy.
Likewise "stopping" is an internal transitional state.

**What to fix:**
Map `RunStatus` values to user-friendly labels here, matching the pattern in
`app/(app)/projects/[id]/page.tsx:606–616` (`runStatusLabel`), e.g.: `idle → "Not started"`,
`stopping → "Stopping…"`, `stopped → "Stopped"`, `error → "Failed"`.

---

### D-4 · `PreviewScreen` shows `CircleAlert` (destructive) icon for a running session with no URL

**Severity:** LOW

**Location:** `components/mobile/preview-screen.tsx:137–143`

**Evidence:**
```tsx
} : status === "error" || status === "running" ? (
  <CircleAlert className="h-8 w-8 text-destructive" />
```
`"running"` with no `previewUrl` falls into the same visual treatment as `"error"` — a red alert
icon and destructive color. The copy says "Preview unavailable" which is accurate, but the icon is
the same as a hard failure. This conflates two different states in a confusing way for users.

**What to fix:**
Use a distinct icon and non-destructive color for the `running-but-no-url` case (e.g. an info icon
or a spinner variant), and differentiate the copy from a hard `"error"` state.

---

### D-5 · `PreviewRouteScreen` (mobile `/run` route) missing `ProjectDrawer` — can't switch projects

**Severity:** MEDIUM

**Location:** `components/mobile/preview-route-screen.tsx`

**Evidence:**
`MobilePreviewRouteScreen` renders `PreviewScreen` + `ProjectActionsMenu`. It has no
`ProjectDrawer`. The `PreviewScreen` header has a back-to-chat button and an actions button but no
hamburger/menu button.

All other mobile sub-routes use `MobileRouteShell` which includes the `ProjectDrawer`. From the
`/run` route, mobile users cannot switch to another project without navigating back to the cockpit
first. This is an inconsistency in navigation affordances.

**What to fix:**
Either: (a) replace `MobilePreviewRouteScreen` with `MobileRouteShell` (passing the preview content
as `children`, same pattern as `/files`, `/logs`, `/settings`), or (b) add a `ProjectDrawer` +
hamburger button to `MobilePreviewRouteScreen` matching `MobileRouteShell`'s header pattern.

---

## E — Missing Mobile Surfaces (Desktop-Only Routes)

### E-1 · `/projects/new` — no mobile layout

**Severity:** MEDIUM

**Location:** `app/(app)/projects/new/page.tsx`

**Evidence:**
```tsx
<main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-8">
```
The new-project creation page is a desktop card layout with no `md:hidden` / mobile branch. On
mobile viewports, users see a desktop form card that isn't optimized for the narrow screen and is
missing the mobile chrome (no back nav, no safe-area handling, no mobile-style input fields).

Every other major route has a mobile branch. `projects/page.tsx` renders `MobileProjectsListScreen`
on mobile. This page has none.

**What to fix:**
Add a mobile variant for `/projects/new`, consistent with the mobile settings and file screens (full
bleed, rounded-2xl inputs, pt-safe, pb-safe, mobile back button).

---

### E-2 · `/projects/[id]/ai` — no mobile layout

**Severity:** MEDIUM

**Location:** `app/(app)/projects/[id]/ai/page.tsx:98–120`

**Evidence:**
```tsx
return (
  <WorkspaceContainer>
    <SectionHeading title="AI" ... />
    <AIPromptForm projectId={id} />
    ...
  </WorkspaceContainer>
)
```
`WorkspaceContainer` has no `hidden md:flex` class — it always renders. There is no
`<div className="md:hidden">` branch. On mobile, the AI tab shows the desktop dense layout: a wide
`AIPromptForm`, task list panel, and task detail panel without mobile-native treatment.

All other workspace sub-routes have a mobile branch. The AI tab is the only one that does not.

**What to fix:**
Add a mobile wrapper for the AI tab. At minimum, a `<div className="md:hidden">` section using
`MobileRouteShell` as the container and an appropriate mobile AI task list/detail component. May
require creating `MobileAIScreen` if one does not exist.

---

## F — Security

### F-1 · BYOK credential encryption uses raw SHA-256 as KDF — no key stretching

**Severity:** HIGH

**Location:** `lib/secrets/crypto.ts:4–8`

**Evidence:**
```ts
function deriveKey(): Buffer {
  const raw = process.env.UDD_SECRET_KEY
  if (!raw) throw new Error("UDD_SECRET_KEY is not set")
  return createHash("sha256").update(raw).digest()
}
```
The AES-256-GCM encryption key is derived by computing `SHA-256(UDD_SECRET_KEY)`. SHA-256 is a fast
hash — not a password-based key derivation function. If `UDD_SECRET_KEY` is a short or
dictionary-derived passphrase, an attacker who obtains the `user_secrets` table's `encrypted_value`
column can brute-force the passphrase offline at GPU speeds.

The encryption itself (AES-256-GCM with fresh random IV per encrypt) is correct. Only the key
derivation is the issue.

**What to fix:**
Replace `createHash("sha256").update(raw).digest()` with a proper KDF:
- `crypto.scryptSync(raw, salt, 32)` with a fixed application salt (acceptable since the secret is
  an env var, not a user password — the threat model is DB compromise, not key reuse)
- Or `crypto.pbkdf2Sync(raw, salt, 310000, 32, 'sha256')` (NIST recommendation)

Document the chosen salt strategy in a comment. Existing encrypted secrets will need re-encryption
on next save after the KDF change — add a migration note.

---

### F-2 · Silent credential decrypt failure — corrupted or rotated key returns `null` with no alert

**Severity:** MEDIUM

**Location:** `lib/secrets/index.ts:38–44`

**Evidence:**
```ts
try {
  return decrypt(data.encrypted_value as string)
} catch {
  console.log("[v0] getSecret: decrypt failed", { kind, name })
  return null
}
```
If decryption fails (key rotation, corrupted ciphertext, encoding error), `getSecret` silently
returns `null`. The caller (`getCredentialForProvider`) treats `null` as "no credential stored" and
falls back to the environment AI Gateway path. The user is never told their saved credential is
unreadable. They see generation work apparently using the environment fallback, with no indication
their saved key is broken.

**What to fix:**
Either surface a distinct error state for "credential unreadable" vs "credential absent" in
`getCredentialForProvider` and `runAITask`, or at minimum write a `[v0] ERROR` level log (not just
`console.log`) and expose a credential-status distinction in the readiness flags so the UI can
indicate a stale/corrupted credential.

---

## G — Missing Features (Beta Blockers)

### G-1 · No account deletion — required for App Store / TestFlight compliance

**Severity:** BLOCKING

**Location:** `app/actions/profile.ts` (entire file)

**Evidence:**
`app/actions/profile.ts` contains only `updateDisplayName`. There is no `deleteAccount` server
action, no UI surface for account deletion, and no cascade-delete flow for user data.

Apple requires that apps offering account creation also offer in-app account deletion (App Store
Review Guideline 5.1.1). For a TestFlight beta this is a blocker before the app can be submitted.

**What to fix:**
Implement `deleteAccount` server action that:
1. Deletes or anonymizes the `profiles` row
2. Calls `supabase.auth.admin.deleteUser(userId)` (requires service role key) or uses
   `supabase.rpc('delete_user')` with a DB function
3. Clears `user_secrets` rows (or relies on cascade from `auth.users`)
4. Signs the user out and redirects to `/`
5. Add a "Delete account" section to desktop Settings (`app/(app)/settings/page.tsx`) and to
   `MobileAccountSettingsScreen` with a confirm dialog before calling the action.
6. Add an entry to `scripts/` for any migration needed (RLS + cascade considerations).

---

### G-2 · Mobile users cannot save, replace, or delete BYOK provider credentials

**Severity:** HIGH (also a Product Truth issue — see A-1)

**Location:** `components/mobile/account-settings-screen.tsx:206–246`

**Evidence:**
The "Credentials" section on mobile Settings shows per-provider status badges (Saved/Missing) but
provides no mechanism to save, replace, or delete an API key. `ProviderCredentialControl` (which
renders the save/replace/delete flow on desktop) is not imported or used.

Mobile users who need to update their OpenAI or Anthropic key must switch to a desktop browser to
do so. This is a significant UX gap for a mobile-first product.

**What to fix:**
Import and render `ProviderCredentialControl` in `MobileAccountSettingsScreen` for each provider,
following the same pattern as `components/mobile/account-settings-screen.tsx:183–221` in
system-state.md's description (which accurately described the intended but unimplemented behavior).
Apply mobile-native styling (rounded-2xl inputs, full-width buttons).

---

## H — Tooling / Infrastructure Notes

### H-1 · Gortex MCP tools unreachable in Claude sessions — hooks fire but server not registered

**Severity:** LOW (tooling only, does not affect product)

**Location:** `/Users/asherlewis/.claude/settings.json`, `/Users/asherlewis/.claude/settings.local.json`

**Evidence:**
Both settings files list `mcp__gortex__*` in permissions `allow` lists. The `settings.local.json`
configures `gortex hook` as a `PreToolUse` hook that fires on `Read|Grep|Glob|Task|Bash|Edit|Write`.
The daemon is running and healthy (1548 nodes confirmed). However, no `mcpServers` block registers
the Gortex daemon as an MCP server.

Result: the hook fires and warns to use `search_symbols`, `get_file_summary`, etc., but these tools
are not available as callable MCP tools. They exist in the daemon but are not exposed to the Claude
session. Every subagent running in this repo will encounter the same issue.

**What to fix:**
Add a `mcpServers` entry to `~/.claude/settings.json` or the project's `.claude/settings.json`
registering `gortex mcp` as an MCP server:
```json
"mcpServers": {
  "gortex": {
    "command": "/opt/homebrew/bin/gortex",
    "args": ["mcp", "--proxy"]
  }
}
```
`--proxy` mode connects to the already-running daemon rather than starting a new instance.

---

## I — Minor / Low Priority

### I-1 · Landing page version badge "Early access · v0.1" — intentionality needed before beta

**Severity:** LOW

**Location:** `app/page.tsx:43`

**Evidence:**
```tsx
<span ...>Early access &middot; v0.1</span>
```
This version string is hardcoded. For a TestFlight build, confirm this is the intended copy. If
version strings will be driven by build config, remove the hardcoded `v0.1`.

---

### I-2 · Landing page footer claims "self-hosted-ready" — needs verification

**Severity:** LOW

**Location:** `app/page.tsx:102`

**Evidence:**
```tsx
<span className="font-mono">single-user &middot; self-hosted-ready</span>
```
"self-hosted-ready" is a product claim. Verify it is accurate for the beta: is there deployment
documentation, a `docker-compose.yml`, or a self-hosting guide? If not, remove or qualify the claim
before the landing page is shown to beta users.

---

### I-3 · `updateProjectStatus` missing `revalidatePath` for project settings tab (see C-2)

Already covered in C-2.

---

### I-4 · Logs page desktop description says "past and current" but query is project-scoped, not session-scoped

**Severity:** LOW

**Location:** `app/(app)/projects/[id]/logs/page.tsx:137–139`

**Evidence:**
```tsx
<SectionHeading
  title="Logs"
  description="Build and runtime output from past and current run sessions."
/>
```
The query at line 93–100 selects from `run_events` filtered by `project_id`, ordered by
`created_at desc`, limited to 200 rows. This is correct — it shows cross-session project-level logs.
The description is accurate. However the 200-row hard limit means older events are silently
discarded with no indicator. Consider adding a "showing last 200 events" note.

---

## Summary Table

| ID | Area | Severity | File(s) |
|----|------|----------|---------|
| A-1 | system-state.md drift: mobile credentials | **BLOCKING** | `docs/system-state.md:231`, `components/mobile/account-settings-screen.tsx` |
| A-2 | `nextAction` computed but never consumed | **BLOCKING** | `app/(app)/projects/[id]/page.tsx:249`, `components/mobile/mobile-shell.tsx` |
| B-1 | `incoming-ui/` demo prototype in repo | **HIGH** | `incoming-ui/udd-mobile/` |
| B-2 | `BottomControls` — zero callers, dead | **MEDIUM** | `components/mobile/bottom-controls.tsx` |
| B-3 | 6 `MobileShellProps` fields unused by `MobileShell` | **HIGH** | `components/mobile/types.ts`, `components/mobile/mobile-shell.tsx` |
| C-1 | Mobile delete: no try/catch, no toast | **HIGH** | `components/mobile/project-settings-screen.tsx:200` |
| C-2 | `updateProjectStatus` missing settings page revalidation | **MEDIUM** | `app/actions/projects.ts:63` |
| C-3 | Error boundary desktop-only layout | **MEDIUM** | `app/(app)/projects/[id]/error.tsx` |
| D-1 | User menu: two items both link to `/settings` | **MEDIUM** | `components/app/user-menu.tsx:44` |
| D-2 | `EmptyChatState` — no onboarding copy | **MEDIUM** | `components/mobile/chat-build-screen.tsx:90` |
| D-3 | Actions menu: "Preview: idle" — internal term | **LOW** | `components/mobile/project-actions-menu.tsx:72` |
| D-4 | Preview running+no-URL uses destructive icon | **LOW** | `components/mobile/preview-screen.tsx:137` |
| D-5 | `/run` mobile route missing `ProjectDrawer` | **MEDIUM** | `components/mobile/preview-route-screen.tsx` |
| E-1 | `/projects/new` — no mobile layout | **MEDIUM** | `app/(app)/projects/new/page.tsx` |
| E-2 | `/projects/[id]/ai` — no mobile layout | **MEDIUM** | `app/(app)/projects/[id]/ai/page.tsx` |
| F-1 | BYOK encryption: no KDF key stretching | **HIGH** | `lib/secrets/crypto.ts:4` |
| F-2 | Silent decrypt failure returns null | **MEDIUM** | `lib/secrets/index.ts:41` |
| G-1 | No account deletion (App Store requirement) | **BLOCKING** | `app/actions/profile.ts` |
| G-2 | Mobile cannot manage BYOK credentials | **HIGH** | `components/mobile/account-settings-screen.tsx:206` |
| H-1 | Gortex MCP server not registered | **LOW** | `~/.claude/settings.json` |
| I-1 | Hardcoded "v0.1" version string | **LOW** | `app/page.tsx:43` |
| I-2 | "self-hosted-ready" claim needs verification | **LOW** | `app/page.tsx:102` |
| I-4 | Logs 200-row limit has no UI indicator | **LOW** | `app/(app)/projects/[id]/logs/page.tsx:155` |

---

## Dispatch Guide for Subagents

### Fleet A — Product Truth / Spec Fixes
**Items:** A-1, A-2, B-3
**Constraint:** Read `CLAUDE.md §Product Truth Contract` and `docs/system-state.md` before touching
anything. Any change to described behavior must update `system-state.md` in the same pass.
**Do not** make UX decisions about whether to surface `nextAction` — flag the gap and let the
product owner decide direction before implementing.

### Fleet B — Dead Code Removal
**Items:** B-1, B-2
**Constraint:** Verify no imports before deleting. For B-1 (`incoming-ui/`), confirm the directory
is not referenced by `tsconfig.json`, `next.config.mjs`, or any import before removing. For B-2,
run `mcp__gitnexus__context` to re-confirm zero callers before deleting.

### Fleet C — Bug Fixes
**Items:** C-1, C-2, C-3
**Constraint:** Run `mcp__gitnexus__impact` on any modified server action. C-1 is a surgical
try/catch addition — do not refactor the wider component. C-2 is a one-line `revalidatePath` add.

### Fleet D — UI Polish and Copy
**Items:** D-1, D-2, D-3, D-4, D-5
**Constraint:** Match existing Tailwind patterns exactly. Do not introduce new design tokens. For
D-5 (run route drawer), verify the pattern matches `MobileRouteShell` exactly before implementing.

### Fleet E — Mobile Surface Completion
**Items:** E-1, E-2
**Constraint:** Follow the exact pattern used by `app/(app)/projects/[id]/files/page.tsx` (for E-1)
and `app/(app)/projects/[id]/logs/page.tsx` (for E-2): `<div className="md:hidden">` + mobile
component wrapped in `MobileRouteShell`, then `<WorkspaceContainer className="hidden md:flex">` for
the desktop branch. Match the data-fetching pattern (all queries in one `Promise.all`).

### Fleet F — Security
**Items:** F-1, F-2
**Constraint:** Read `lib/secrets/crypto.ts`, `lib/secrets/index.ts`, and
`docs/system-state.md §Credential handling` before touching. For F-1: any KDF change invalidates
existing ciphertexts — document a migration path before implementing. For F-2: do not change the
error-handling behavior without first understanding what the caller does with `null`.

### Fleet G — Missing Features
**Items:** G-1, G-2
**Constraint:** G-1 (account deletion) requires service-role Supabase access — check whether
`supabase.auth.admin` is available in the server action context or if a DB-level RPC is needed.
Read `scripts/001_init_schema.sql` and `scripts/005_user_secrets.sql` for cascade behavior before
writing the action. G-2 should be implemented only after A-1 is resolved (spec and source must
agree first).

### Fleet H — Tooling
**Items:** H-1
**Constraint:** Do not change product code. Only modify `.claude/settings.json`.

---

*Audit completed: 2026-04-29. Source truth: `main` branch at commit `1384793`.*
*Gortex: 1548 nodes, 4000 edges. GitNexus: 2423 symbols (index may be slightly ahead of Gortex).*
*No disagreement detected between GitNexus and Gortex on any shared symbol during this audit.*
