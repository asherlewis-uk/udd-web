import { redirect } from "next/navigation"
import { AccountForm } from "@/components/settings/account-form"
import { ProviderForm } from "@/components/settings/provider-form"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { isProviderId, type ProviderId } from "@/lib/ai/providers"
import { LogOut } from "lucide-react"

export const metadata = {
  title: "Settings — UDD",
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle()

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Your account and how UDD refers to you.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Profile</h2>
        <div className="rounded-lg border border-border bg-card p-6">
          <AccountForm email={user.email ?? ""} initialDisplayName={profile?.display_name ?? ""} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Session</h2>
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-5">
          <div>
            <div className="text-sm font-medium">Sign out of this device</div>
            <div className="text-xs text-muted-foreground">
              You&apos;ll need to sign in again to access your projects.
            </div>
          </div>
          <form action="/auth/logout" method="post">
            <Button variant="outline" type="submit">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </form>
        </div>
      </section>
    </main>
  )
}
