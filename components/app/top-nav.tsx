import Link from "next/link"
import { Wordmark } from "@/components/brand"
import { UserMenu } from "@/components/app/user-menu"
import { createClient } from "@/lib/supabase/server"

export async function TopNav() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let displayName: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
    displayName = profile?.display_name ?? null
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/85 px-5 backdrop-blur">
      <div className="flex items-center gap-6">
        <Link href="/projects" aria-label="UDD projects">
          <Wordmark />
        </Link>
        <nav className="hidden items-center gap-1 text-sm md:flex">
          <Link
            href="/projects"
            className="rounded-md px-2.5 py-1.5 text-muted-foreground transition hover:bg-card hover:text-foreground"
          >
            Projects
          </Link>
          <Link
            href="/settings"
            className="rounded-md px-2.5 py-1.5 text-muted-foreground transition hover:bg-card hover:text-foreground"
          >
            Settings
          </Link>
        </nav>
      </div>
      {user ? (
        <UserMenu email={user.email ?? ""} displayName={displayName} />
      ) : (
        <Link href="/auth/login" className="text-sm text-muted-foreground hover:text-foreground">
          Sign in
        </Link>
      )}
    </header>
  )
}
