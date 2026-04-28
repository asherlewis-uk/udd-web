import { KeyRound, LogOut, User } from "lucide-react";

export function MobileAccountSettingsScreen({
  email,
  displayName,
  providerLabel,
  providerModel,
  providerReady,
  hasSavedCredential,
  environmentCredentialAvailable,
}: {
  email: string;
  displayName: string | null;
  providerLabel: string;
  providerModel: string;
  providerReady: boolean;
  hasSavedCredential: boolean;
  environmentCredentialAvailable: boolean;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-background px-4 pb-safe pt-safe text-foreground md:hidden">
      <header className="pt-5">
        <h1 className="text-2xl font-semibold">Settings</h1>
      </header>

      <div className="flex flex-1 flex-col gap-6 py-6">
        <SettingsGroup title="Account">
          <SettingsRow
            icon={<User className="h-5 w-5" />}
            label={displayName || email || "Account"}
            detail={displayName ? email : "Profile"}
          />
        </SettingsGroup>

        <SettingsGroup title="Provider">
          <SettingsRow
            icon={<KeyRound className="h-5 w-5" />}
            label={providerLabel}
            detail={`${providerModel} · ${providerReady ? "ready" : "credential needed"}`}
          />
          <div className="mx-4 h-px bg-border/60" />
          <div className="px-4 py-3 text-sm text-muted-foreground">
            Saved credential: {hasSavedCredential ? "present" : "not present"}.
            Environment fallback:{" "}
            {environmentCredentialAvailable ? "available" : "not detected"}.
          </div>
        </SettingsGroup>
      </div>

      <form action="/auth/logout" method="post" className="pb-4">
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-full border border-border/70 px-5 py-3 text-sm font-medium text-foreground transition active:scale-[0.99]"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </form>
    </main>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="overflow-hidden rounded-3xl bg-secondary/70">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  icon,
  label,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <span className="text-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium text-foreground">
          {label}
        </span>
        <span className="block truncate text-sm text-muted-foreground">
          {detail}
        </span>
      </span>
    </div>
  );
}
