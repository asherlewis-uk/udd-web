"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ProviderCredentialControl } from "@/components/ai/provider-credential-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveAIProviderConfig } from "@/app/actions/provider-configs";
import type { ProviderCredentialStatuses } from "@/components/ai/ai-prompt-form";
import { getProviderOptions, type ProviderId } from "@/lib/ai/providers";

const PROVIDER_OPTIONS = getProviderOptions();

export function ProviderForm({
  currentProviderId,
  credentialStatuses,
  environmentCredentialAvailable,
}: {
  currentProviderId: ProviderId | null;
  credentialStatuses: ProviderCredentialStatuses;
  environmentCredentialAvailable: boolean;
}) {
  // When nothing is saved, the Select visually shows "openai" but there is
  // no row in provider_configs yet. We track the baseline as-selected in
  // the UI so the Save button is only enabled on a real change.
  const initial: ProviderId = currentProviderId ?? "openai";
  const [selected, setSelected] = useState<ProviderId>(initial);
  const [baseline, setBaseline] = useState<ProviderId>(initial);
  const [statuses, setStatuses] = useState(credentialStatuses);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const isDirty = selected !== baseline;

  useEffect(() => {
    setStatuses(credentialStatuses);
  }, [credentialStatuses]);

  const handleSave = () => {
    setMessage(null);
    startTransition(async () => {
      try {
        await saveAIProviderConfig({
          providerId: selected,
          setAsDefault: true,
        });
        // Move the baseline so Save greys out until the user changes
        // selection again.
        setBaseline(selected);
        setMessage("Provider preference saved.");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to save.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ai-provider">Default provider</Label>
        <Select
          value={selected}
          onValueChange={(v) => setSelected(v as ProviderId)}
          disabled={isPending}
        >
          <SelectTrigger id="ai-provider" className="w-full max-w-xs">
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent>
            {PROVIDER_OPTIONS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Choose the default provider. If no saved key exists, UDD uses
          environment credentials when available.
        </p>
        <p className="text-xs text-muted-foreground">
          Environment fallback is {environmentCredentialAvailable ? "available" : "not detected"}.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isPending || !isDirty} size="sm">
          {isPending ? "Saving..." : "Save"}
        </Button>
        {message && (
          <span className="text-xs text-muted-foreground">{message}</span>
        )}
      </div>
      <div className="flex flex-col gap-4 border-t border-border pt-4">
        <div>
          <h3 className="text-sm font-medium">Provider credentials</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Saved keys are validated before encryption and are never shown after save.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          {PROVIDER_OPTIONS.map((provider) => (
            <div key={provider.id} className="flex flex-col gap-2">
              <div className="text-sm font-medium">{provider.label}</div>
              <ProviderCredentialControl
                providerId={provider.id}
                providerLabel={provider.label}
                hasCredential={statuses[provider.id]}
                onStatusChange={(providerId, hasCredential) => {
                  setStatuses((current) => ({
                    ...current,
                    [providerId]: hasCredential,
                  }));
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
