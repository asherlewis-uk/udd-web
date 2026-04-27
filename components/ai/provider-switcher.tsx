"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveAIProviderConfig } from "@/app/actions/provider-configs";
import { getProviderOptions, type ProviderId } from "@/lib/ai/providers";

// Single source of truth: lib/ai/providers/index.ts. Do not duplicate.
const PROVIDER_OPTIONS = getProviderOptions();

/**
 * Inline provider switcher for the cockpit. Reuses the same server action
 * used by the Settings form, so there is exactly one write path for the
 * user's default AI provider. Credential readiness is rendered by the
 * surrounding provider controls so selection and secrets stay separate.
 */
export function ProviderSwitcher({
  currentProviderId,
  disabled,
  onProviderChange,
}: {
  currentProviderId: ProviderId;
  disabled?: boolean;
  onProviderChange?: (providerId: ProviderId) => void;
}) {
  const router = useRouter();
  // Optimistic value so the trigger updates immediately while the action runs.
  const [value, setValue] = useState<ProviderId>(currentProviderId);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(currentProviderId);
  }, [currentProviderId]);

  const handleChange = (next: string) => {
    if (next === value) return;
    const previous = value;
    const nextId = next as ProviderId;
    setValue(nextId);
    onProviderChange?.(nextId);
    setError(null);
    startTransition(async () => {
      try {
        await saveAIProviderConfig({ providerId: nextId, setAsDefault: true });
        // Refresh so server components (badge label, settings) re-read.
        router.refresh();
      } catch (err) {
        // Roll back optimistic state on failure.
        setValue(previous);
        onProviderChange?.(previous);
        setError(err instanceof Error ? err.message : "Failed to save.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <Select
        value={value}
        onValueChange={handleChange}
        disabled={disabled || isPending}
      >
        <SelectTrigger
          size="sm"
          className="h-7 w-auto gap-1.5 border-border/60 bg-transparent px-2 text-xs"
          aria-label="Active AI provider"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start">
          {PROVIDER_OPTIONS.map((p) => (
            <SelectItem key={p.id} value={p.id} className="text-xs">
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <span className="text-[11px] text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
