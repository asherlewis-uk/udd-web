"use client";

import Link from "next/link";
import { CircleAlert, ExternalLink, Loader2, Play, Square } from "lucide-react";
import { startRunAction } from "@/app/actions/run";
import { BottomControls } from "./bottom-controls";
import type { MobileRunEvent, MobileRunSession } from "./types";

export function PreviewScreen({
  projectId,
  projectName,
  filesCount,
  session,
  events,
  onBackToChat,
  onActionsClick,
}: {
  projectId: string;
  projectName: string;
  filesCount: number;
  session: MobileRunSession | null;
  events: MobileRunEvent[];
  onBackToChat: () => void;
  onActionsClick: () => void;
}) {
  const status = session?.status ?? "idle";
  const previewUrl = session?.previewUrl ?? null;
  const hasPreview = status === "running" && Boolean(previewUrl);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between px-4 pt-4">
        <button
          type="button"
          onClick={onBackToChat}
          className="flex h-11 items-center gap-2 rounded-full px-2 text-sm text-foreground transition active:scale-95"
        >
          Chat
        </button>
        <div className="min-w-0 text-center">
          <div className="truncate text-sm font-medium text-foreground">
            {projectName}
          </div>
          <div className="text-xs text-muted-foreground">Local preview</div>
        </div>
        <button
          type="button"
          onClick={onActionsClick}
          className="flex h-11 items-center rounded-full px-2 text-sm text-foreground transition active:scale-95"
        >
          Actions
        </button>
      </div>

      <div className="min-h-0 flex-1 px-4 py-4">
        {hasPreview ? (
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/80">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
              <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                {previewUrl}
              </span>
              <a
                href={previewUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Open local preview"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            <iframe
              title={`${projectName} local preview`}
              src={previewUrl ?? undefined}
              sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"
              referrerPolicy="no-referrer"
              className="min-h-0 flex-1 bg-white"
            />
          </div>
        ) : (
          <PreviewState
            projectId={projectId}
            status={status}
            filesCount={filesCount}
            error={session?.error ?? null}
          />
        )}
      </div>

      {events.length > 0 ? (
        <div className="mx-4 mb-3 max-h-28 overflow-auto rounded-2xl border border-border/60 bg-[oklch(0.13_0_0)] px-3 py-2 font-mono text-[11px] text-muted-foreground">
          {events.slice(-4).map((event) => (
            <div key={event.id} className="flex gap-2 py-0.5">
              <span className="shrink-0 uppercase">{event.level}</span>
              <span className="min-w-0 break-all">{event.message}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="pb-safe">
        <BottomControls
          activeMode="preview"
          onChatClick={onBackToChat}
          onPreviewClick={() => {}}
          onActionsClick={onActionsClick}
        />
      </div>
    </div>
  );
}

function PreviewState({
  projectId,
  status,
  filesCount,
  error,
}: {
  projectId: string;
  status: MobileRunSession["status"] | "idle";
  filesCount: number;
  error: string | null;
}) {
  const canStart =
    status === "idle" || status === "stopped" || status === "error";
  const copy = previewCopy(status, filesCount, error);

  return (
    <div className="flex h-full min-h-96 flex-col items-center justify-center gap-5 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
        {status === "starting" || status === "stopping" ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : status === "error" || (status === "running" && !error) ? (
          <CircleAlert className="h-8 w-8 text-destructive" />
        ) : status === "stopped" ? (
          <Square className="h-8 w-8 text-muted-foreground" />
        ) : (
          <Play className="h-8 w-8 text-muted-foreground" />
        )}
      </div>

      <div className="max-w-sm space-y-2">
        <h2 className="text-xl font-semibold text-foreground">{copy.title}</h2>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
      </div>

      <div className="flex items-center gap-3">
        {canStart ? (
          <form action={startRunAction}>
            <input type="hidden" name="project_id" value={projectId} />
            <button
              type="submit"
              className="rounded-full bg-foreground px-6 py-3 text-sm font-medium text-background transition active:scale-95"
            >
              {status === "error" || status === "stopped"
                ? "Restart local preview"
                : "Start local preview"}
            </button>
          </form>
        ) : null}
        <Link
          href={`/projects/${projectId}/run`}
          className="rounded-full border border-border/70 px-5 py-3 text-sm font-medium text-foreground transition hover:bg-secondary"
        >
          Inspect run
        </Link>
      </div>
    </div>
  );
}

function previewCopy(
  status: MobileRunSession["status"] | "idle",
  filesCount: number,
  error: string | null,
): { title: string; body: string } {
  if (status === "starting") {
    return {
      title: "Starting local preview",
      body: "UDD is validating saved files and starting a bounded local Next dev process when the project shape supports it.",
    };
  }

  if (status === "running") {
    return {
      title: "Preview endpoint missing",
      body: "This run is marked running, but no real preview URL is recorded. Inspect the run output before trusting the session.",
    };
  }

  if (status === "stopping") {
    return {
      title: "Stopping local preview",
      body: "The local process is stopping and its temporary workspace is being cleaned up.",
    };
  }

  if (status === "stopped") {
    return {
      title: "Preview stopped",
      body: "Start again to validate the current saved files and launch a new local preview when supported.",
    };
  }

  if (status === "error") {
    return {
      title: "Run failed",
      body:
        error ??
        "The run ended with a validation, startup, dependency, or runtime error. Inspect the recorded logs for details.",
    };
  }

  if (filesCount === 0) {
    return {
      title: "No saved files yet",
      body: "Generate files first. The preview surface only uses files that passed validation and persistence.",
    };
  }

  return {
    title: "No local preview yet",
    body: `${filesCount} saved file${filesCount === 1 ? "" : "s"} can be checked by starting a local preview run.`,
  };
}
