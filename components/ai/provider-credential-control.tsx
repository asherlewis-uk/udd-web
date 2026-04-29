"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteProviderCredential,
  saveProviderCredential,
} from "@/app/actions/secrets";
import { cn } from "@/lib/utils";
import type { ProviderId } from "@/lib/ai/providers";

type ProviderCredentialControlProps = {
  providerId: ProviderId;
  providerLabel: string;
  hasCredential: boolean;
  disabled?: boolean;
  compact?: boolean;
  mobileLayout?: boolean;
  allowDelete?: boolean;
  onStatusChange?: (providerId: ProviderId, hasCredential: boolean) => void;
};

export function ProviderCredentialControl({
  providerId,
  providerLabel,
  hasCredential,
  disabled,
  compact,
  mobileLayout,
  allowDelete = true,
  onStatusChange,
}: ProviderCredentialControlProps) {
  const router = useRouter();
  const [stored, setStored] = useState(hasCredential);
  const [apiKey, setApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setStored(hasCredential);
    setApiKey("");
    setMessage(null);
    setError(null);
  }, [providerId, hasCredential]);

  const trimmedKey = apiKey.trim();
  const canSave = trimmedKey.length >= 20 && !disabled && !isPending;

  const handleSave = () => {
    if (!canSave) return;
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        await saveProviderCredential(providerId, trimmedKey);
        setStored(true);
        setApiKey("");
        setMessage("Credential saved.");
        onStatusChange?.(providerId, true);
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save credential.",
        );
      }
    });
  };

  const handleDelete = () => {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        await deleteProviderCredential(providerId);
        setStored(false);
        setApiKey("");
        setMessage("Credential deleted.");
        onStatusChange?.(providerId, false);
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete credential.",
        );
      }
    });
  };

  return (
    <div
      className={cn("flex flex-col gap-2", compact ? "text-[11px]" : "text-xs")}
    >
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          mobileLayout && !compact && "items-stretch",
        )}
      >
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-medium",
            mobileLayout && !compact && "w-full",
            stored
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground",
          )}
        >
          <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
          {stored ? "BYOK ready" : "Credential missing"}
        </span>
        {!compact || !stored ? (
          <div
            className={cn(
              "flex min-w-0 items-center gap-2",
              compact
                ? "flex-1"
                : mobileLayout
                  ? "w-full flex-col"
                  : "w-full sm:w-auto",
            )}
          >
            <Input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={`${providerLabel} API key`}
              autoComplete="off"
              spellCheck={false}
              disabled={disabled || isPending}
              className={cn(
                "h-8",
                compact
                  ? "min-w-44 flex-1 text-xs"
                  : mobileLayout
                    ? "h-11 w-full rounded-2xl border-border/60 bg-background/70"
                    : "w-full sm:w-72",
              )}
            />
            <Button
              type="button"
              size="sm"
              variant={stored ? "outline" : "secondary"}
              disabled={!canSave}
              onClick={handleSave}
              className={cn(
                mobileLayout &&
                  !compact &&
                  "h-10 w-full justify-center rounded-full",
              )}
            >
              {isPending ? "Saving..." : stored ? "Replace" : "Save key"}
            </Button>
          </div>
        ) : null}
        {!compact && stored && allowDelete ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled || isPending}
            onClick={handleDelete}
            className={cn(
              "gap-1.5",
              mobileLayout && "h-10 w-full justify-center rounded-full",
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        ) : null}
      </div>
      {compact && stored ? (
        <span className="text-muted-foreground/75">
          Saved key is used for new {providerLabel} tasks.
        </span>
      ) : compact ? (
        <span className="text-muted-foreground/75">
          Save a key here to use {providerLabel} without leaving the cockpit.
        </span>
      ) : (
        <span className="text-muted-foreground">
          {stored
            ? `${providerLabel} has a saved key. The value is never shown after save.`
            : `No ${providerLabel} key is saved. Add one to use BYOK for this provider.`}
        </span>
      )}
      {message ? (
        <span className="text-muted-foreground">{message}</span>
      ) : null}
      {error ? (
        <span className="text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
