"use client";

import Link from "next/link";
import { ChevronLeft, KeyRound, Settings2, User } from "lucide-react";
import type { ActiveProviderInfo } from "@/components/ai/ai-prompt-form";
import type { ProviderReadiness } from "@/lib/workspace/next-action";
import type { MobileProfile, MobileProject } from "./types";

export function SettingsScreen({
  project,
  profile,
  activeProvider,
  providerReadiness,
  onBack,
}: {
  project: MobileProject;
  profile: MobileProfile;
  activeProvider: ActiveProviderInfo;
  providerReadiness: ProviderReadiness;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-3 px-4 pb-4 pt-safe">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground transition active:scale-95"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-safe">
        <section className="mb-6">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Account
          </h2>
          <div className="overflow-hidden rounded-3xl border border-border/50 bg-secondary/55">
            <SettingsLink
              href="/settings"
              icon={<User className="h-5 w-5" />}
              label={profile.displayName || profile.email}
              detail={
                profile.displayName ? profile.email : "Profile and sign out"
              }
            />
          </div>
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Provider
          </h2>
          <div className="overflow-hidden rounded-3xl border border-border/50 bg-secondary/55">
            <SettingsLink
              href="/settings"
              icon={<KeyRound className="h-5 w-5" />}
              label="Provider settings"
              detail={`${activeProvider.label} · ${activeProvider.model}`}
            />
            <div className="mx-4 h-px bg-border/70" />
            <div className="grid grid-cols-2 gap-2 px-4 py-4 text-xs">
              <StatusTile
                label="Saved key"
                value={
                  providerReadiness.hasSavedCredential ? "Present" : "Not saved"
                }
              />
              <StatusTile
                label="Environment"
                value={
                  providerReadiness.hasEnvironmentCredential
                    ? "Available"
                    : "Not detected"
                }
              />
            </div>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Project
          </h2>
          <div className="overflow-hidden rounded-3xl border border-border/50 bg-secondary/55">
            <SettingsLink
              href={`/projects/${project.id}/settings`}
              icon={<Settings2 className="h-5 w-5" />}
              label={project.name}
              detail="Project details and controls"
            />
          </div>
        </section>

        <form action="/auth/logout" method="post" className="pt-2">
          <button
            type="submit"
            className="w-full rounded-full border border-border/70 px-5 py-3 text-sm font-medium text-foreground transition hover:bg-secondary"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

function SettingsLink({
  href,
  icon,
  label,
  detail,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 p-4">
      <span className="text-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base text-foreground">
          {label}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {detail}
        </span>
      </span>
    </Link>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/45 px-3 py-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-medium text-foreground">
        {value}
      </div>
    </div>
  );
}
