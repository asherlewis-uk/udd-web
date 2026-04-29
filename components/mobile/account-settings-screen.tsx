"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, KeyRound, LogOut, User } from "lucide-react";
import { updateDisplayName } from "@/app/actions/profile";
import { saveAIProviderConfig } from "@/app/actions/provider-configs";
import {
  getProviderOptions,
  PROVIDERS,
  type ProviderId,
} from "@/lib/ai/providers";
import { cn } from "@/lib/utils";

const PROVIDER_OPTIONS = getProviderOptions();

export type MobileAccountProviderStatuses = Record<ProviderId, boolean>;

export function MobileAccountSettingsScreen({
  email,
  displayName,
  currentProviderId,
  savedProviderId,
  credentialStatuses,
  environmentCredentialAvailable,
}: {
  email: string;
  displayName: string | null;
  currentProviderId: ProviderId;
  savedProviderId: ProviderId | null;
  credentialStatuses: MobileAccountProviderStatuses;
  environmentCredentialAvailable: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const initialName = displayName ?? "";
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);

  const [selectedProvider, setSelectedProvider] =
    useState<ProviderId>(currentProviderId);
  const [savedProvider, setSavedProvider] = useState<ProviderId | null>(
    savedProviderId,
  );

  useEffect(() => {
    setName(initialName);
    setSavedName(initialName);
  }, [initialName]);

  useEffect(() => {
    setSelectedProvider(currentProviderId);
    setSavedProvider(savedProviderId);
  }, [currentProviderId, savedProviderId]);

  const trimmedName = name.trim();
  const nameDirty = trimmedName !== savedName.trim();
  const providerDirty = selectedProvider !== savedProvider;

  const selectedConfig = PROVIDERS[selectedProvider];
  const selectedHasCredential = credentialStatuses[selectedProvider] ?? false;
  const providerReady = selectedHasCredential || environmentCredentialAvailable;

  function saveProfile() {
    if (!nameDirty) return;
    startTransition(async () => {
      try {
        await updateDisplayName(trimmedName);
        setSavedName(trimmedName);
        toast.success("Profile saved");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save profile",
        );
      }
    });
  }

  function saveProvider() {
    if (!providerDirty) return;
    startTransition(async () => {
      try {
        await saveAIProviderConfig({
          providerId: selectedProvider,
          setAsDefault: true,
        });
        setSavedProvider(selectedProvider);
        toast.success("Provider saved");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save provider",
        );
      }
    });
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background px-4 pb-safe pt-safe text-foreground md:hidden">
      <header className="pt-5">
        <h1 className="text-2xl font-semibold">Settings</h1>
      </header>

      <div className="flex flex-1 flex-col gap-6 py-6">
        <SettingsGroup title="Account">
          <div className="flex items-center gap-3 px-4 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-background/60 text-foreground">
              <User className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-medium text-foreground">
                {savedName || email || "Account"}
              </span>
              <span className="block truncate text-sm text-muted-foreground">
                {email}
              </span>
            </span>
          </div>
          <div className="mx-4 h-px bg-border/60" />
          <label className="flex flex-col gap-2 px-4 py-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Display name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="How you want to be named"
              autoComplete="name"
              disabled={pending}
              className="h-11 rounded-2xl border border-border/60 bg-background/70 px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring disabled:opacity-60"
            />
          </label>
          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={saveProfile}
              disabled={pending || !nameDirty}
              className="w-full rounded-full border border-border/70 bg-background/70 px-5 py-3 text-sm font-medium text-foreground transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending && nameDirty ? "Saving..." : "Save profile"}
            </button>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Provider">
          <div className="px-4 py-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-base font-medium text-foreground">
                  <KeyRound className="h-5 w-5 text-muted-foreground" />
                  {selectedConfig.label}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {selectedConfig.modelDisplayName}
                </div>
              </div>
              <StatusPill ready={providerReady} />
            </div>
            <label className="flex flex-col gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Default provider
              </span>
              <select
                value={selectedProvider}
                onChange={(event) =>
                  setSelectedProvider(event.target.value as ProviderId)
                }
                disabled={pending}
                className="h-11 rounded-2xl border border-border/60 bg-background/70 px-3 text-base text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
              >
                {PROVIDER_OPTIONS.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mx-4 h-px bg-border/60" />
          <div className="grid grid-cols-2 gap-2 px-4 py-4 text-sm">
            <StatusTile
              label="Saved key"
              value={selectedHasCredential ? "Present" : "Not saved"}
              active={selectedHasCredential}
            />
            <StatusTile
              label="Environment"
              value={
                environmentCredentialAvailable ? "Available" : "Not detected"
              }
              active={environmentCredentialAvailable}
            />
          </div>
          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={saveProvider}
              disabled={pending || !providerDirty}
              className="w-full rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending && providerDirty ? "Saving..." : "Save provider"}
            </button>
          </div>
        </SettingsGroup>

        <SettingsGroup title="Credentials">
          <p className="px-4 pt-4 text-sm text-muted-foreground">
            Save and replace provider keys from the desktop app. Keys are
            validated, encrypted, and never returned to the browser.
          </p>
          <div className="flex flex-col px-4 pb-4 pt-2">
            {PROVIDER_OPTIONS.map((provider, index) => {
              const config = PROVIDERS[provider.id];
              const hasCredential = credentialStatuses[provider.id] ?? false;
              const isLast = index === PROVIDER_OPTIONS.length - 1;
              return (
                <div
                  key={provider.id}
                  className={cn(
                    "flex items-center justify-between gap-3 py-3",
                    !isLast && "border-b border-border/60",
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {config.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {config.modelDisplayName}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                      hasCredential
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-border/60 bg-background/50 text-muted-foreground",
                    )}
                  >
                    {hasCredential ? "Saved" : "Missing"}
                  </span>
                </div>
              );
            })}
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
      <div className="overflow-hidden rounded-3xl border border-border/50 bg-secondary/55">
        {children}
      </div>
    </section>
  );
}

function StatusPill({ ready }: { ready: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        ready
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-border/60 bg-background/50 text-muted-foreground",
      )}
    >
      {ready ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
      {ready ? "Ready" : "Needs key"}
    </span>
  );
}

function StatusTile({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-background/45 px-3 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-sm font-medium",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}
