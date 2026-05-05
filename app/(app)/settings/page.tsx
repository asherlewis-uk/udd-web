import { redirect } from "next/navigation";
import { AccountForm } from "@/components/settings/account-form";
import { AccountDangerZone } from "@/components/settings/account-danger-zone";
import { ProviderForm } from "@/components/settings/provider-form";
import { MobileAccountSettingsScreen } from "@/components/mobile/account-settings-screen";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth-session";
import { createClient } from "@/lib/db/supabase-legacy";
import { getProvider, isProviderId, type ProviderId } from "@/lib/ai/providers";
import {
  getProviderCredentialStatusesForOwner,
  hasGatewayEnvironmentCredential,
} from "@/lib/ai/providers/server";
import { LogOut } from "lucide-react";

export const metadata = {
  title: "Settings — UDD",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const session = await getSession();
  if (!session) redirect("/auth/login");
  const user = session.user;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  // Load the user's saved default AI provider (if any). The Select widget
  // falls back to "openai" when nothing is saved so the UI always has a
  // defined value; the action only writes when the user clicks Save.
  const [{ data: defaultProvider }, credentialStatuses] = await Promise.all([
    supabase
      .from("provider_configs")
      .select("name")
      .eq("owner_id", user.id)
      .eq("kind", "ai")
      .eq("is_default", true)
      .limit(1)
      .maybeSingle(),
    getProviderCredentialStatusesForOwner(user.id),
  ]);

  const savedProviderId: ProviderId | null = isProviderId(defaultProvider?.name)
    ? defaultProvider.name
    : null;
  const provider = getProvider(savedProviderId);
  const environmentCredentialAvailable = hasGatewayEnvironmentCredential();

  return (
    <>
      <MobileAccountSettingsScreen
        email={user.email ?? ""}
        displayName={profile?.display_name ?? null}
        currentProviderId={provider.id}
        savedProviderId={savedProviderId}
        credentialStatuses={credentialStatuses}
        environmentCredentialAvailable={environmentCredentialAvailable}
      />

      <main className="mx-auto hidden w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-8 md:flex">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Account details, provider selection, and credential management.
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Profile</h2>
          <div className="rounded-lg border border-border/70 bg-card/80 p-6 shadow-[0_24px_80px_-56px_rgba(0,0,0,0.95)]">
            <AccountForm
              email={user.email ?? ""}
              initialDisplayName={profile?.display_name ?? ""}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Provider selection</h2>
          <div className="rounded-lg border border-border/70 bg-card/80 p-6 shadow-[0_24px_80px_-56px_rgba(0,0,0,0.95)]">
            <ProviderForm
              currentProviderId={savedProviderId}
              credentialStatuses={credentialStatuses}
              environmentCredentialAvailable={environmentCredentialAvailable}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Session</h2>
          <div className="flex items-center justify-between rounded-lg border border-border/70 bg-card/80 p-5 shadow-[0_24px_80px_-56px_rgba(0,0,0,0.95)]">
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

        <AccountDangerZone />
      </main>
    </>
  );
}
