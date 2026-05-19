"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ProviderCredentialControl } from "@/components/ai/provider-credential-control";
import { ProviderSwitcher } from "@/components/ai/provider-switcher";
import { createAITask } from "@/app/actions/ai";
import { classifyPrompt } from "@/lib/ai/classify";
import { cn } from "@/lib/utils";
import { getProviderOptions, type ProviderId } from "@/lib/ai/providers";
import type { ProviderCredentialStatus } from "@/lib/ai/providers";
import type { AITaskKind } from "@/lib/ai/types";

const PROVIDER_OPTIONS = getProviderOptions();

export type ProviderCredentialStatuses = Record<
  ProviderId,
  ProviderCredentialStatus
>;

export type ActiveProviderInfo = {
  id: ProviderId;
  label: string;
  model: string;
  credentialStatuses: ProviderCredentialStatuses;
  environmentCredentialAvailable: boolean;
};

type State = { error: string | null };

async function action(_prev: State, formData: FormData): Promise<State> {
  try {
    await createAITask(formData);
    return { error: null };
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    // Next.js server action redirects throw a digest error — rethrow those.
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest?: unknown }).digest === "string" &&
      ((err as { digest: string }).digest as string).startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return {
      error: err instanceof Error ? err.message : "Something went wrong",
    };
  }
}

export function AIPromptForm({
  projectId,
  redirectTo,
  variant = "default",
  busy,
  activeProvider,
}: {
  projectId: string;
  redirectTo?: string;
  variant?: "default" | "cockpit";
  busy?: boolean;
  activeProvider?: ActiveProviderInfo;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, {
    error: null,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cockpit = variant === "cockpit";
  const isDisabled = pending || !!busy;
  const [draftPrompt, setDraftPrompt] = useState("");
  const [optimisticSubmission, setOptimisticSubmission] = useState<{
    prompt: string;
    operation: PromptOperation;
  } | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<ProviderId>(
    activeProvider?.id ?? "openai",
  );
  const [credentialStatuses, setCredentialStatuses] =
    useState<ProviderCredentialStatuses>(
      activeProvider?.credentialStatuses ?? {
        openai: "missing",
        anthropic: "missing",
        ollama: "missing",
      },
    );

  const draftOperation = draftPrompt.trim()
    ? promptOperationForKind(classifyPrompt(draftPrompt).kind)
    : null;

  useEffect(() => {
    if (!activeProvider) return;
    setSelectedProviderId(activeProvider.id);
    setCredentialStatuses(activeProvider.credentialStatuses);
  }, [activeProvider]);

  useEffect(() => {
    if (state.error) setOptimisticSubmission(null);
  }, [state.error]);

  const selectedProvider =
    PROVIDER_OPTIONS.find((provider) => provider.id === selectedProviderId) ??
    PROVIDER_OPTIONS[0];
  const selectedCredentialStatus =
    credentialStatuses[selectedProviderId] ?? "missing";
  const hasSavedCredential = selectedCredentialStatus === "valid";
  const hasInvalidCredential = selectedCredentialStatus === "invalid";
  const providerReady =
    hasSavedCredential || !!activeProvider?.environmentCredentialAvailable;
  const providerReadinessCopy = hasSavedCredential
    ? "Stored credential will be used for new tasks."
    : hasInvalidCredential
      ? "Saved key could not be read. Replace or delete it before using BYOK."
    : activeProvider?.environmentCredentialAvailable
      ? "No saved key; u did dat will use environment credentials unless you add one."
      : "Add a credential before submitting work to this provider.";

  const handleCredentialStatusChange = (
    providerId: ProviderId,
    hasCredential: boolean,
  ) => {
    setCredentialStatuses((current) => ({
      ...current,
      [providerId]: hasCredential ? "valid" : "missing",
    }));
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    setDraftPrompt(el.value);
    if (cockpit) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!cockpit) return;
    const formData = new FormData(e.currentTarget);
    const prompt = String(formData.get("prompt") ?? "").trim();
    if (!prompt) return;
    setOptimisticSubmission({
      prompt,
      operation: promptOperationForKind(classifyPrompt(prompt).kind),
    });
  };

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={handleSubmit}
      className={cn(
        "flex flex-col gap-3",
        cockpit
          ? "w-full rounded-lg border border-border/80 bg-card/85 p-2 shadow-[0_24px_80px_-48px_rgba(0,0,0,0.95)] backdrop-blur"
          : "rounded-lg border border-border bg-card p-4",
      )}
    >
      <input type="hidden" name="project_id" value={projectId} />
      {redirectTo ? (
        <input type="hidden" name="redirect_to" value={redirectTo} />
      ) : null}
      {cockpit && optimisticSubmission && pending ? (
        <div className="rounded-md border border-accent/25 bg-accent/10 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">
              Queuing generation run
            </span>
            <span className="rounded-sm border border-border/60 bg-background/70 px-1.5 py-0.5 text-muted-foreground">
              {optimisticSubmission.operation.badge}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-muted-foreground">
            {optimisticSubmission.prompt}
          </p>
        </div>
      ) : null}
      <Textarea
        ref={textareaRef}
        name="prompt"
        placeholder={
          cockpit
            ? "Describe a scaffold, edit, or refactor..."
            : "Describe a generation run. e.g. Scaffold a landing page with a hero and a CTA."
        }
        rows={cockpit ? 4 : 3}
        required
        disabled={isDisabled}
        className={cn(
          "resize-none shadow-none",
          cockpit
            ? "min-h-32 max-h-72 rounded-md border-0 bg-transparent px-3 py-3 text-[15px] leading-7 transition-shadow duration-150 placeholder:text-muted-foreground/55 focus-visible:ring-0 md:text-base"
            : "border-0 bg-transparent p-0 text-sm focus-visible:ring-0",
        )}
        onInput={handleInput}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
      {cockpit && draftOperation ? (
        <div className="flex flex-wrap items-center gap-2 px-2 text-[11px] text-muted-foreground">
          <span className="rounded-sm border border-border/60 bg-background/60 px-1.5 py-0.5 font-medium text-foreground">
            {draftOperation.badge}
          </span>
          <span>{draftOperation.description}</span>
        </div>
      ) : null}
      {cockpit && activeProvider ? (
        <div className="flex flex-col gap-2 border-t border-border/60 px-2 pt-3 text-[11px] text-muted-foreground">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="text-muted-foreground/80">Provider</span>
              <ProviderSwitcher
                currentProviderId={activeProvider.id}
                disabled={pending}
                onProviderChange={setSelectedProviderId}
              />
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 font-medium",
                providerReady
                  ? "border-accent/35 bg-accent/10 text-accent"
                  : "border-destructive/35 bg-destructive/10 text-destructive",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  providerReady ? "bg-accent" : "bg-destructive",
                )}
                aria-hidden
              />
              {providerReady
                ? "Ready"
                : hasInvalidCredential
                  ? "Credential stale"
                  : "Credential needed"}
            </span>
          </div>
          <span className="text-muted-foreground/70">
            {providerReadinessCopy}
          </span>
          {!hasSavedCredential ? (
            <ProviderCredentialControl
              providerId={selectedProviderId}
              providerLabel={selectedProvider.label}
              credentialStatus={selectedCredentialStatus}
              disabled={pending || !!busy}
              compact
              allowDelete={false}
              onStatusChange={handleCredentialStatusChange}
            />
          ) : null}
        </div>
      ) : null}
      <div
        className={cn(
          "flex items-center justify-between gap-3",
          cockpit && "border-t border-border/60 px-2 pt-3",
        )}
      >
        <p className="text-xs text-muted-foreground">
          {cockpit ? (
            busy ? (
              "Generation run in progress."
            ) : (
              "u did dat saves files only after validation passes."
            )
          ) : (
            <>
              Generation lifecycle —{" "}
              <span className="font-mono text-[11px]">
                queued → generating → saved
              </span>
            </>
          )}
        </p>
        <div className="flex items-center gap-3">
          {state.error ? (
            <span className="text-xs text-destructive" role="alert">
              {state.error}
              {cockpit &&
              state.error.includes("generation runs in progress") ? (
                <>
                  {" "}
                  <Link
                    href={`/projects/${projectId}/ai`}
                    className="underline hover:opacity-80"
                  >
                    Manage generation runs
                  </Link>
                </>
              ) : null}
            </span>
          ) : null}
          <Button
            type="submit"
            size="sm"
            disabled={
              isDisabled || (cockpit && activeProvider ? !providerReady : false)
            }
            className="h-9 gap-1.5 rounded-md px-4"
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Queuing run
              </>
            ) : (
              <>
                Start run
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}

type PromptOperation = {
  badge: string;
  description: string;
};

function promptOperationForKind(kind: AITaskKind): PromptOperation {
  if (kind === "scaffold") {
    return {
      badge: "Scaffold run",
      description:
        "Full generated file set; saved files are replaced after validation passes.",
    };
  }

  if (kind === "refactor") {
    return {
      badge: "Refactor run",
      description:
        "Generated changes are checked against existing saved files.",
    };
  }

  if (kind === "explain") {
    return {
      badge: "Explain run",
      description:
        "Classified as explanation; any generated files still validate before save.",
    };
  }

  if (kind === "other") {
    return {
      badge: "Generation run",
      description: "Generated files are checked before anything is saved.",
    };
  }

  return {
    badge: "Edit run",
    description: "Generated changes are checked against the saved file set.",
  };
}
