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
          <div className="rounded-2xl bg-secondary/80">
            <SettingsLink
              href="/settings"
              icon={<User className="h-5 w-5" />}
              label={profile.displayName || profile.email}
              detail={profile.displayName ? profile.email : "Profile settings"}
            />
          </div>
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Provider
          </h2>
          <div className="rounded-2xl bg-secondary/80">
            <SettingsLink
              href="/settings"
              icon={<KeyRound className="h-5 w-5" />}
              label={activeProvider.label}
              detail={`${activeProvider.model} - ${providerReadiness.ready ? "ready" : "credential needed"}`}
            />
            <div className="mx-4 h-px bg-border/70" />
            <div className="px-4 py-3 text-xs text-muted-foreground">
              Saved credential:{" "}
              {providerReadiness.hasSavedCredential ? "present" : "not present"}
              . Environment fallback:{" "}
              {providerReadiness.hasEnvironmentCredential
                ? "available"
                : "not detected"}
              .
            </div>
          </div>
        </section>

        <section className="mb-6">
          <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Project
          </h2>
          <div className="rounded-2xl bg-secondary/80">
            <SettingsLink
              href={`/projects/${project.id}/settings`}
              icon={<Settings2 className="h-5 w-5" />}
              label={project.name}
              detail="Project metadata and danger zone"
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
