"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Loader2, Settings2 } from "lucide-react";
import { createAITask } from "@/app/actions/ai";
import { classifyPrompt } from "@/lib/ai/classify";
import { cn } from "@/lib/utils";

type State = { error: string | null };

async function action(_prev: State, formData: FormData): Promise<State> {
  try {
    await createAITask(formData);
    return { error: null };
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest?: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return {
      error: err instanceof Error ? err.message : "Something went wrong",
    };
  }
}

export function Composer({
  projectId,
  busy,
  providerReady,
  providerLabel,
}: {
  projectId: string;
  busy: boolean;
  providerReady: boolean;
  providerLabel: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, {
    error: null,
  });
  const formRef = useRef<HTMLFormElement | null>(null);
  const [draft, setDraft] = useState("");
  const [queuedPrompt, setQueuedPrompt] = useState<string | null>(null);

  const trimmedDraft = draft.trim();
  const disabled = busy || pending || !providerReady;
  const draftKind = trimmedDraft ? classifyPrompt(trimmedDraft).kind : null;

  useEffect(() => {
    if (state.error) setQueuedPrompt(null);
  }, [state.error]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => {
        if (trimmedDraft) setQueuedPrompt(trimmedDraft);
      }}
      className="flex flex-col gap-2 px-4 pb-2"
    >
      <input type="hidden" name="project_id" value={projectId} />
      <input
        type="hidden"
        name="redirect_to"
        value={`/projects/${projectId}`}
      />

      {queuedPrompt && pending ? (
        <div className="rounded-2xl border border-border/60 bg-secondary/55 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Queuing generation
          </span>
          <span className="ml-2 rounded-full bg-background/70 px-2 py-0.5 font-mono uppercase">
            {draftKind ?? "generation"}
          </span>
          <p className="mt-1 line-clamp-2 whitespace-pre-wrap">
            {queuedPrompt}
          </p>
        </div>
      ) : null}

      {!providerReady ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/35 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span>
            {providerLabel} needs a saved key or environment fallback.
          </span>
          <Link
            href="/settings"
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 font-medium text-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Settings
          </Link>
        </div>
      ) : null}

      <div className="flex items-center gap-2 rounded-[1.75rem] border border-border/70 bg-secondary/80 p-1.5 shadow-[0_24px_80px_-56px_rgba(0,0,0,0.95)] backdrop-blur">
        <input
          name="prompt"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask UDD to build..."
          autoComplete="off"
          required
          disabled={disabled}
          className="h-11 min-w-0 flex-1 bg-transparent text-base text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-55"
        />

        <button
          type="submit"
          disabled={disabled || !trimmedDraft}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-45",
            pending && "animate-pulse",
          )}
          aria-label="Submit prompt"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-5 w-5" />
          )}
        </button>
      </div>

      {state.error ? (
        <div className="px-2 text-xs text-destructive" role="alert">
          {state.error}
        </div>
      ) : null}
    </form>
  );
}
