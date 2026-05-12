"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type ProviderConfigRow = {
  name: string;
  config: unknown;
};

export function ProviderForm({
  currentProviderId,
  credentialStatuses,
  environmentCredentialAvailable,
  providerConfigs,
}: {
  currentProviderId: ProviderId | null;
  credentialStatuses: ProviderCredentialStatuses;
  environmentCredentialAvailable: boolean;
  providerConfigs: ProviderConfigRow[];
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

  // Custom endpoint inputs per provider
  const configMap = new Map(
    providerConfigs.map((p) => {
      const cfg =
        p.config && typeof p.config === "object" && !Array.isArray(p.config)
          ? (p.config as Record<string, unknown>)
          : null;
      return [p.name, cfg?.baseURL as string | undefined];
    }),
  );
  const [endpoints, setEndpoints] = useState<Record<ProviderId, string>>(() => {
    const initialEndpoints: Record<ProviderId, string> = {
      openai: configMap.get("openai") ?? "",
      anthropic: configMap.get("anthropic") ?? "",
      ollama: configMap.get("ollama") ?? "",
    };
    return initialEndpoints;
  });

  const isDirty = selected !== baseline;

  useEffect(() => {
    setStatuses(credentialStatuses);
  }, [credentialStatuses]);

  useEffect(() => {
    const next: Record<ProviderId, string> = {
      openai: configMap.get("openai") ?? "",
      anthropic: configMap.get("anthropic") ?? "",
      ollama: configMap.get("ollama") ?? "",
    };
    setEndpoints(next);
  }, [providerConfigs]);

  const handleSaveProvider = () => {
    setMessage(null);
    startTransition(async () => {
      try {
        await saveAIProviderConfig({
          providerId: selected,
          setAsDefault: true,
        });
        setBaseline(selected);
        setMessage("Provider preference saved.");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to save.");
      }
    });
  };

  const handleSaveEndpoint = (providerId: ProviderId) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const baseURL = endpoints[providerId]?.trim() || undefined;
        await saveAIProviderConfig({
          providerId,
          metadata: baseURL ? { baseURL } : {},
          setAsDefault: false,
        });
        setMessage("Endpoint saved.");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to save endpoint.");
      }
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-background/35 p-4">
        <Label htmlFor="ai-provider">Default provider</Label>
        <Select
          value={selected}
          onValueChange={(v) => setSelected(v as ProviderId)}
          disabled={isPending}
        >
          <SelectTrigger
            id="ai-provider"
            className="w-full max-w-sm border-border/70 bg-background/70"
          >
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
        <p className="w-fit rounded-sm border border-border/60 bg-card/60 px-2 py-1 text-xs text-muted-foreground">
          Environment fallback is{" "}
          {environmentCredentialAvailable ? "available" : "not detected"}.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={handleSaveProvider} disabled={isPending || !isDirty} size="sm">
          {isPending ? "Saving..." : "Save"}
        </Button>
        {message && (
          <span className="text-xs text-muted-foreground">{message}</span>
        )}
      </div>
      <div className="flex flex-col gap-4 border-t border-border/70 pt-5">
        <div>
          <h3 className="text-sm font-medium">Provider credentials</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Saved keys are validated before encryption and are never shown after
            save.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          {PROVIDER_OPTIONS.map((provider) => {
            const status = statuses[provider.id] ?? "missing";
            const hasCredential = status === "valid";
            const hasInvalidCredential = status === "invalid";
            return (
              <div
                key={provider.id}
                className="flex flex-col gap-3 rounded-md border border-border/60 bg-background/35 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">{provider.label}</div>
                  <span className="rounded-sm border border-border/60 bg-card/60 px-2 py-1 text-xs text-muted-foreground">
                    {hasCredential
                      ? provider.id === "ollama"
                        ? "Local instance"
                        : "Saved key"
                      : hasInvalidCredential
                        ? "Key needs replacement"
                        : "No saved key"}
                  </span>
                </div>
                <ProviderCredentialControl
                  providerId={provider.id}
                  providerLabel={provider.label}
                  credentialStatus={status}
                  onStatusChange={(providerId, hasCredential) => {
                    setStatuses((current) => ({
                      ...current,
                      [providerId]: hasCredential ? "valid" : "missing",
                    }));
                  }}
                />
                {provider.id !== "ollama" && (
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Custom endpoint (optional)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="url"
                        value={endpoints[provider.id] ?? ""}
                        onChange={(e) =>
                          setEndpoints((prev) => ({
                            ...prev,
                            [provider.id]: e.target.value,
                          }))
                        }
                        placeholder="https://api.example.com/v1"
                        disabled={isPending}
                        className="h-8 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => handleSaveEndpoint(provider.id)}
                      >
                        Save
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Override the default API base URL for this provider.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
