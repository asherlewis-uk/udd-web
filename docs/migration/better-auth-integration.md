## 1. Files to create

### `lib/auth.ts`

Purpose: server-only Better Auth instance. It owns the Drizzle adapter, email/password configuration, UUID-string ID generation, profile creation hook, and Next.js cookie plugin. It imports both `db` and schema, so no schema file may import this module. Docs: https://www.better-auth.com/docs/installation, https://www.better-auth.com/docs/adapters/drizzle, https://www.better-auth.com/docs/concepts/database, https://www.better-auth.com/docs/integrations/next, https://www.better-auth.com/docs/authentication/email-password.

```ts
import "server-only"

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { db } from "@/lib/db"
import * as schema from "@/lib/db/schema"
import { profiles } from "@/lib/db/schema"

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
  },
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await db
            .insert(profiles)
            .values({ id: user.id, displayName: user.name })
            .onConflictDoNothing()
        },
      },
    },
  },
  plugins: [nextCookies()],
})
```

### `lib/auth-client.ts`

Purpose: client-only Better Auth React client. It is the only auth module imported by `"use client"` components, and re-exports the lifecycle methods and `useSession` hook. Docs: https://www.better-auth.com/docs/concepts/client, https://www.better-auth.com/docs/integrations/next, https://www.better-auth.com/docs/authentication/email-password.

```ts
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient()
export const { signIn, signUp, signOut, useSession } = authClient
```

### `lib/auth-session.ts`

Purpose: server-only session helper that replaces every Supabase `auth.getUser()` read with Better Auth `auth.api.getSession({ headers })`. Server actions, route handlers, RSC pages, and layouts import this helper instead of importing `lib/auth.ts` directly. Docs: https://www.better-auth.com/docs/integrations/next.

```ts
import "server-only"

import { headers } from "next/headers"
import { auth } from "@/lib/auth"

export async function getSession() {
  return await auth.api.getSession({ headers: await headers() })
}
```

### `app/api/auth/[...all]/route.ts`

Purpose: App Router catch-all route for Better Auth endpoints under `/api/auth/*`. Docs: https://www.better-auth.com/docs/integrations/next, https://www.better-auth.com/docs/installation.

```ts
import { auth } from "@/lib/auth"
import { toNextJsHandler } from "better-auth/next-js"

export const { GET, POST } = toNextJsHandler(auth.handler)
```

## 2. Files to replace

### `middleware.ts`

Source today: imports `updateSession` from `lib/supabase/proxy.ts` at `middleware.ts:2`; matcher is `middleware.ts:9`. Replacement preserves the same public-path rules from `lib/supabase/proxy.ts:11-53`, preserves `?redirect={pathname}`, removes Supabase cookie mutation, and uses Better Auth session validation. Docs: https://www.better-auth.com/docs/integrations/next.

```ts
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

const PUBLIC_FILE = /\.(svg|png|jpg|jpeg|webp|ico)$/

function isPublicPath(pathname: string) {
  return (
    pathname === "/" ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_FILE.test(pathname)
  )
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request })
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session && !isPublicPath(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/auth/login"
    redirectUrl.searchParams.set("redirect", request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
```

### `components/auth/login-form.tsx`

Source today: `supabase.auth.signInWithPassword({ email, password })` at `components/auth/login-form.tsx:28`; `redirectTo` is read from `search.get("redirect") ?? "/projects"` at `components/auth/login-form.tsx:15`. Replacement preserves `router.push(redirectTo); router.refresh()`. Docs: https://www.better-auth.com/docs/authentication/email-password, https://www.better-auth.com/docs/concepts/client.

```tsx
"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel, FieldGroup, FieldDescription, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const redirectTo = search.get("redirect") ?? "/projects"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: signInError } = await authClient.signIn.email({ email, password })
      if (signInError) throw new Error(signInError.message)
      router.push(redirectTo)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@domain.com"
          />
        </Field>
        <Field>
          <div className="flex items-baseline justify-between">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link
              href="/auth/sign-up"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              No account? Sign up
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <FieldDescription>Minimum 8 characters.</FieldDescription>
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button type="submit" disabled={loading} className="mt-2">
          {loading ? <Spinner className="mr-2" /> : null}
          Sign in
        </Button>
      </FieldGroup>
    </form>
  )
}
```

### `components/auth/sign-up-form.tsx`

Source today: `supabase.auth.signUp(...)` at `components/auth/sign-up-form.tsx:30-39`; `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` is read at `components/auth/sign-up-form.tsx:35`; success routes to `/auth/sign-up-success` at `components/auth/sign-up-form.tsx:41`. Replacement drops the redirect URL and sends successful signups to `/projects`. Docs: https://www.better-auth.com/docs/authentication/email-password, https://www.better-auth.com/docs/concepts/client.

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel, FieldGroup, FieldDescription, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function SignUpForm() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    setLoading(true)
    try {
      const name = displayName.trim() || email.split("@")[0]
      const { error: signUpError } = await authClient.signUp.email({ email, password, name })
      if (signUpError) throw new Error(signUpError.message)
      router.push("/projects")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign up")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="displayName">Display name</FieldLabel>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ada Lovelace"
            autoComplete="name"
          />
          <FieldDescription>Shown in your workspace. Optional.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@domain.com"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button type="submit" disabled={loading} className="mt-2">
          {loading ? <Spinner className="mr-2" /> : null}
          Create account
        </Button>
        <p className="text-xs text-muted-foreground">
          {"Already have an account? "}
          <Link href="/auth/login" className="text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </FieldGroup>
    </form>
  )
}
```

### `app/auth/logout/route.ts`

Source today: `supabase.auth.signOut()` at `app/auth/logout/route.ts:6`. Replacement keeps POST and 303 redirect to `/auth/login`. Docs: https://www.better-auth.com/docs/authentication/email-password, https://www.better-auth.com/docs/integrations/next.

```ts
import { headers } from "next/headers"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export async function POST(request: Request) {
  await auth.api.signOut({ headers: await headers() })
  const { origin } = new URL(request.url)
  return NextResponse.redirect(`${origin}/auth/login`, { status: 303 })
}
```

### `app/actions/profile.ts`

Source today: `updateDisplayName()` reads Supabase user at `app/actions/profile.ts:8-18`; `deleteAccount()` reads Supabase user at `app/actions/profile.ts:27-33`; service-role admin deletion is `serviceClient.auth.admin.deleteUser(user.id)` at `app/actions/profile.ts:36`. Replacement uses `getSession()`, Drizzle `profiles` update, Drizzle `user` delete, PG cascades, and explicit sign-out. Docs: https://www.better-auth.com/docs/integrations/next, https://www.better-auth.com/docs/authentication/email-password.

```ts
"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { getSession } from "@/lib/auth-session"
import { db } from "@/lib/db"
import { profiles, user } from "@/lib/db/schema"

export async function updateDisplayName(displayName: string) {
  const session = await getSession()
  if (!session) throw new Error("Not authenticated")

  await db
    .update(profiles)
    .set({ displayName: displayName.trim() || null })
    .where(eq(profiles.id, session.user.id))

  revalidatePath("/settings")
}

export async function deleteAccount(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const session = await getSession()
    if (!session) return { success: false, error: "Not authenticated" }

    await db.delete(user).where(eq(user.id, session.user.id))
    await auth.api.signOut({ headers: await headers() })

    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete account",
    }
  }
}
```

## 3. Files to delete

| File | Delete reason |
|---|---|
| `app/auth/callback/route.ts` | Source today calls `supabase.auth.exchangeCodeForSession(code)` at `app/auth/callback/route.ts:11`. Better Auth email/password signup is configured with `requireEmailVerification: false`, so this callback has no replacement. |
| `app/auth/sign-up-success/page.tsx` | Current copy says `Check your email` at `app/auth/sign-up-success/page.tsx:15` and describes a confirmation link at `app/auth/sign-up-success/page.tsx:17-18`. The new signup flow lands on `/projects`, so this page is stale. |
| `lib/supabase/client.ts` | Browser singleton around `createBrowserClient`; all client lifecycle calls move to `lib/auth-client.ts`. |
| `lib/supabase/server.ts` | SSR Supabase client with `next/headers` cookies; server session reads move to `lib/auth-session.ts`. |
| `lib/supabase/service.ts` | Service-role admin client used only by `app/actions/profile.ts:5`; `deleteAccount()` moves to Drizzle user deletion. |
| `lib/supabase/proxy.ts` | Middleware cookie refresh and auth gate consumed only by `middleware.ts:2`; new middleware uses `auth.api.getSession`. |

## 4. Mechanical sweep: `auth.getUser()` -> `getSession()`

### Sweep table

| File:Line | Current call | Replacement nuance |
|---|---|---|
| `lib/runtime/service.ts:25` | `auth.getUser()` | Import `getSession`; preserve existing runtime service control flow and reuse `const user = session.user`. |
| `lib/runtime/service.ts:89` | `auth.getUser()` | Same as `lib/runtime/service.ts:25`; do not rewrite `.from(...)` DB queries. |
| `lib/supabase/proxy.ts:35` | `auth.getUser()` | Do not sweep in place; delete file after replacing `middleware.ts`. |
| `components/app/top-nav.tsx:10` | `auth.getUser()` | RSC component uses `getSession()` and reads `session.user`. |
| `app/actions/profile.ts:11` | `auth.getUser()` | Replaced by full `updateDisplayName()` content in Section 2. |
| `app/actions/profile.ts:31` | `auth.getUser()` | Replaced by full `deleteAccount()` content in Section 2. |
| `app/actions/projects.ts:13` | `auth.getUser()` | Server action returns the same unauthenticated error shape it uses today. |
| `app/actions/run.ts:56` | `auth.getUser()` | Server action returns the same unauthenticated error shape it uses today. |
| `app/actions/ai.ts:27` | `auth.getUser()` | Server action returns the same unauthenticated error shape it uses today. |
| `app/actions/secrets.ts:88` | `auth.getUser()` | Server action returns the same unauthenticated error shape it uses today; do not alter AES-GCM storage. |
| `app/actions/secrets.ts:110` | `auth.getUser()` | Same as `app/actions/secrets.ts:88`. |
| `app/actions/secrets.ts:130` | `auth.getUser()` | Same as `app/actions/secrets.ts:88`. |
| `app/actions/provider-configs.ts:61` | `auth.getUser()` | Server action returns the same unauthenticated error shape it uses today. |
| `app/page.tsx:12` | `auth.getUser()` | RSC page keeps current redirect/render behavior and uses `session.user`. |
| `app/(app)/layout.tsx:9` | `auth.getUser()` | Protected layout redirects unauthenticated users to `/auth/login`. |
| `app/(app)/projects/page.tsx:37` | `auth.getUser()` | RSC page uses `session.user.id` in existing owner filters. |
| `app/(app)/projects/[id]/page.tsx:80` | `auth.getUser()` | RSC page uses `session.user.id` in existing owner filters. |
| `app/(app)/projects/[id]/layout.tsx:16` | `auth.getUser()` | Protected project layout redirects unauthenticated users to `/auth/login`. |
| `app/(app)/projects/[id]/run/page.tsx:37` | `auth.getUser()` | RSC page uses `session.user.id` in existing owner filters. |
| `app/(app)/projects/[id]/files/page.tsx:54` | `auth.getUser()` | RSC page uses `session.user.id` in existing owner filters. |
| `app/(app)/projects/[id]/ai/page.tsx:40` | `auth.getUser()` | RSC page uses `session.user.id` in existing owner filters. |
| `app/(app)/projects/[id]/logs/page.tsx:48` | `auth.getUser()` | RSC page uses `session.user.id` in existing owner filters. |
| `app/(app)/projects/[id]/settings/page.tsx:28` | `auth.getUser()` | RSC page uses `session.user.id` in existing owner filters. |
| `app/(app)/settings/page.tsx:23` | `auth.getUser()` | RSC page uses `session.user.id` in existing profile/settings queries. |

### `lib/runtime/service.ts:25`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) throw new Error("Not authenticated")

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) throw new Error("Not authenticated")
const user = session.user
```

### `lib/runtime/service.ts:89`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) throw new Error("Not authenticated")

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) throw new Error("Not authenticated")
const user = session.user
```

### `lib/supabase/proxy.ts:35`

```ts
// Before
const {
  data: { user },
} = await supabase.auth.getUser()

// After
// Delete lib/supabase/proxy.ts. The replacement lives in middleware.ts:
const session = await auth.api.getSession({ headers: request.headers })
if (!session && !isPublicPath(request.nextUrl.pathname)) {
  const redirectUrl = request.nextUrl.clone()
  redirectUrl.pathname = "/auth/login"
  redirectUrl.searchParams.set("redirect", request.nextUrl.pathname)
  return NextResponse.redirect(redirectUrl)
}
```

### `components/app/top-nav.tsx:10`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
const user = session?.user ?? null
```

### `app/actions/profile.ts:11`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) throw new Error("Not authenticated")

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) throw new Error("Not authenticated")
const user = session.user
```

### `app/actions/profile.ts:31`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
  error: authError,
} = await supabase.auth.getUser()
if (authError) return { success: false, error: authError.message }
if (!user) return { success: false, error: "Not authenticated" }

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) return { success: false, error: "Not authenticated" }
const user = session.user
```

### `app/actions/projects.ts:13`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) return { error: "Not authenticated" }

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) return { error: "Not authenticated" }
const user = session.user
```

### `app/actions/run.ts:56`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) return { error: "Not authenticated" }

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) return { error: "Not authenticated" }
const user = session.user
```

### `app/actions/ai.ts:27`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) return { error: "Not authenticated" }

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) return { error: "Not authenticated" }
const user = session.user
```

### `app/actions/secrets.ts:88`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) return { error: "Not authenticated" }

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) return { error: "Not authenticated" }
const user = session.user
```

### `app/actions/secrets.ts:110`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) return { error: "Not authenticated" }

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) return { error: "Not authenticated" }
const user = session.user
```

### `app/actions/secrets.ts:130`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) return { error: "Not authenticated" }

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) return { error: "Not authenticated" }
const user = session.user
```

### `app/actions/provider-configs.ts:61`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) return { error: "Not authenticated" }

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) return { error: "Not authenticated" }
const user = session.user
```

### `app/page.tsx:12`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
const user = session?.user ?? null
```

### `app/(app)/layout.tsx:9`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) redirect("/auth/login")

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) redirect("/auth/login")
const user = session.user
```

### `app/(app)/projects/page.tsx:37`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) redirect("/auth/login")

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) redirect("/auth/login")
const user = session.user
```

### `app/(app)/projects/[id]/page.tsx:80`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) redirect("/auth/login")

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) redirect("/auth/login")
const user = session.user
```

### `app/(app)/projects/[id]/layout.tsx:16`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) redirect("/auth/login")

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) redirect("/auth/login")
const user = session.user
```

### `app/(app)/projects/[id]/run/page.tsx:37`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) redirect("/auth/login")

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) redirect("/auth/login")
const user = session.user
```

### `app/(app)/projects/[id]/files/page.tsx:54`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) redirect("/auth/login")

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) redirect("/auth/login")
const user = session.user
```

### `app/(app)/projects/[id]/ai/page.tsx:40`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) redirect("/auth/login")

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) redirect("/auth/login")
const user = session.user
```

### `app/(app)/projects/[id]/logs/page.tsx:48`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) redirect("/auth/login")

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) redirect("/auth/login")
const user = session.user
```

### `app/(app)/projects/[id]/settings/page.tsx:28`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) redirect("/auth/login")

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) redirect("/auth/login")
const user = session.user
```

### `app/(app)/settings/page.tsx:23`

```ts
// Before
const supabase = await createClient()
const {
  data: { user },
} = await supabase.auth.getUser()
if (!user) redirect("/auth/login")

// After
import { getSession } from "@/lib/auth-session"

const session = await getSession()
if (!session) redirect("/auth/login")
const user = session.user
```

Do not rewrite `.from(...)` DB query call sites in this pass. Every existing `.eq("owner_id", user.id)` or `.eq("id", user.id)` filter keeps using the UUID-string `session.user.id` value.

## 5. Package.json diff

Source today: remove `"@supabase/ssr": "^0.10.2"` from `package.json:42`. Add `better-auth@^1.x` and pin the exact latest v1.x at execution time. `drizzle-orm`, `postgres`, and `drizzle-kit` are already specified in `docs/migration/drizzle-schema.md` Section 1; do not redeclare them here.

```diff
  "dependencies": {
-   "@supabase/ssr": "^0.10.2",
+   "better-auth": "^1.x",
  }
```

## 6. Env var diff

| Action | Variable | Source / destination |
|---|---|---|
| Remove | `NEXT_PUBLIC_SUPABASE_URL` | Confirmed dead in `docs/migration/env-lockdown.md:7` and `docs/migration/env-lockdown.md:31`. |
| Remove | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Confirmed dead in `docs/migration/env-lockdown.md:8` and `docs/migration/env-lockdown.md:32`. |
| Remove | `SUPABASE_SERVICE_ROLE_KEY` | Confirmed dead in `docs/migration/env-lockdown.md:9` and `docs/migration/env-lockdown.md:33`. |
| Remove | `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | Confirmed dead in `docs/migration/env-lockdown.md:10` and `docs/migration/env-lockdown.md:34`. |
| Add | `BETTER_AUTH_SECRET` | Required by Better Auth; generate with `openssl rand -base64 32`. Confirmed in `docs/migration/env-lockdown.md:42`. Docs: https://www.better-auth.com/docs/installation. |
| Add | `BETTER_AUTH_URL` | Required by Better Auth; use the canonical app URL. Confirmed in `docs/migration/env-lockdown.md:43`. Docs: https://www.better-auth.com/docs/installation. |
| Keep | `DATABASE_URL` | Required by Drizzle and already specified in `docs/migration/env-lockdown.md:44` and `docs/migration/drizzle-schema.md:6`. |

Update `.env.example`, `CLAUDE.md:79`, and any other env documentation. Archived migration docs may retain historical Supabase variable names; source and active setup docs may not.

## 7. SQL trigger removal

The `handle_new_user()` `SECURITY DEFINER` function and `on_auth_user_created` trigger at `scripts/001_init_schema.sql:382-403` no longer apply after Better Auth owns the `user` table. Drop them from any future baseline migration. The replacement is `databaseHooks.user.create.after` in `lib/auth.ts`, which inserts `profiles` with `db.insert(profiles).values({ id: user.id, displayName: user.name }).onConflictDoNothing()` and lets any thrown error abort signup. The existing `scripts/001_init_schema.sql` file becomes legacy reference after the Drizzle migration; do not edit it in this pass.

## 8. Execution order

Atomic-in-one-PR is required because the cookie format change is a total cutover.

1. Add `lib/auth.ts`, `lib/auth-client.ts`, `lib/auth-session.ts`, `app/api/auth/[...all]/route.ts`.
2. Replace `middleware.ts`.
3. Replace login/sign-up forms and logout route.
4. Delete callback route.
5. Sweep all 24 `getUser()` sites listed in Section 4 to `getSession()` (23 in-place rewrites; `lib/supabase/proxy.ts:35` is removed by the file deletion in step 7).
6. Replace `deleteAccount()` and `updateDisplayName()`.
7. Delete `lib/supabase/**` after `rg "@/lib/supabase"` returns zero source imports.
8. Drop `@supabase/ssr` and the 4 retired env vars.

Single-user beta means the cookie-format change is acceptable; the user logs in once with the new system. No double-cookie hazard exists because Better Auth uses `better-auth.session_token`, distinct from `sb-*`.

## 9. Verification checklist

1. `rg "@/lib/supabase" -l` returns zero files.
2. `rg "@supabase/ssr|@supabase/supabase-js"` returns zero hits.
3. `rg "supabase.auth.getUser\\(\\)"` returns zero hits.
4. `rg "createClient\\(\\)" app components lib` returns only Better Auth or unrelated DB matches.
5. `rg "NEXT_PUBLIC_SUPABASE|SUPABASE_SERVICE_ROLE_KEY" app components lib middleware.ts package.json .env.example CLAUDE.md` returns zero hits in source and active setup docs; archived docs may retain historical mentions.
6. `find lib/supabase -type f 2>/dev/null` returns nothing.
7. `find app/auth/callback -type f 2>/dev/null` returns nothing.
8. `node -e "const p=require('./package.json'); if (p.dependencies['@supabase/ssr']) process.exit(1); if (!p.dependencies['better-auth']) process.exit(1);"` exits 0.
9. `pnpm tsc --noEmit` passes.
10. `pnpm build` passes.
11. Manual smoke: sign up -> land on `/projects`; log out -> land on `/auth/login`; log in with `?redirect=/projects/foo` -> land on `/projects/foo`; delete account -> user row and profile row gone, cookie cleared.
12. `git status` is clean after commit.

## 10. Risk register

| Risk | Mitigation |
|---|---|
| Cookie format change requires user re-login. | Acceptable for single-user beta. |
| Stale `sb-*` cookies linger until expiry. | Harmless because nothing reads them after `lib/supabase/**` deletion and import sweep. |
| Circular import risk. | Schema files import only `drizzle-orm` primitives and never import `auth`; `auth.ts` is the sole place where `db` plus `schema` co-exist with auth logic. |
| `lib/auth.ts` imported from `"use client"`. | Do not import it from client files; client files import only `lib/auth-client.ts`. `import "server-only"` in `lib/auth.ts` and `lib/auth-session.ts` guards accidental client use. Add an ESLint boundary rule if cheap during execution. |
| Profile hook failure swallowed. | The `databaseHooks.user.create.after` callback must `await` the insert and throw on failure; do not catch and suppress errors. |
| `app/auth/sign-up-success/page.tsx` remains referenced. | Verify references before deletion; if it is only the stale confirmation page shown at `app/auth/sign-up-success/page.tsx:15-18`, delete it in the same PR. |
