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
import type { AITaskKind } from "@/lib/ai/types";

const PROVIDER_OPTIONS = getProviderOptions();

export type ProviderCredentialStatuses = Record<ProviderId, boolean>;

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
      activeProvider?.credentialStatuses ?? { openai: false, anthropic: false },
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
  const hasSavedCredential = credentialStatuses[selectedProviderId] ?? false;
  const providerReady =
    hasSavedCredential || !!activeProvider?.environmentCredentialAvailable;
  const providerReadinessCopy = hasSavedCredential
    ? "Stored credential will be used for new tasks."
    : activeProvider?.environmentCredentialAvailable
      ? "No saved key; UDD will use environment credentials unless you add one."
      : "Add a credential before submitting work to this provider.";

  const handleCredentialStatusChange = (
    providerId: ProviderId,
    hasCredential: boolean,
  ) => {
    setCredentialStatuses((current) => ({
      ...current,
      [providerId]: hasCredential,
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
        cockpit ? "w-full" : "rounded-lg border border-border bg-card p-4",
      )}
    >
      <input type="hidden" name="project_id" value={projectId} />
      {redirectTo ? (
        <input type="hidden" name="redirect_to" value={redirectTo} />
      ) : null}
      {cockpit && optimisticSubmission && pending ? (
        <div className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">
              Queuing generation run
            </span>
            <span className="rounded-sm bg-background px-1.5 py-0.5 text-muted-foreground">
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
            ? "min-h-30 max-h-64 rounded-lg border-border bg-background px-5 py-4 text-base leading-7 transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-foreground/20 md:text-base"
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
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-sm bg-muted px-1.5 py-0.5 font-medium text-foreground">
            {draftOperation.badge}
          </span>
          <span>{draftOperation.description}</span>
        </div>
      ) : null}
      {cockpit && activeProvider ? (
        <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="text-muted-foreground/80">
              Provider for new tasks
            </span>
            <ProviderSwitcher
              currentProviderId={activeProvider.id}
              disabled={pending}
              onProviderChange={setSelectedProviderId}
            />
            <span
              className={cn(
                "font-medium",
                providerReady
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-destructive",
              )}
            >
              {providerReady ? "Ready" : "Credential needed"}
            </span>
          </div>
          <span className="text-muted-foreground/70">
            {providerReadinessCopy}
          </span>
          {!hasSavedCredential ? (
            <ProviderCredentialControl
              providerId={selectedProviderId}
              providerLabel={selectedProvider.label}
              hasCredential={hasSavedCredential}
              disabled={pending || !!busy}
              compact
              allowDelete={false}
              onStatusChange={handleCredentialStatusChange}
            />
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {cockpit ? (
            busy ? (
              "UDD is working…"
            ) : (
              "UDD saves files only after validation passes."
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
            className="gap-1.5"
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
