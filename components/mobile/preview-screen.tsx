"use client";

import {
  CircleAlert,
  ExternalLink,
  Info,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Play,
  Square,
} from "lucide-react";
import { startRunAction } from "@/app/actions/run";
import type { MobileRunEvent, MobileRunSession } from "./types";

export function PreviewScreen({
  projectId,
  projectName,
  filesCount,
  session,
  events,
  onBackToChat,
  onActionsClick,
  showHeader = true,
}: {
  projectId: string;
  projectName: string;
  filesCount: number;
  session: MobileRunSession | null;
  events: MobileRunEvent[];
  onBackToChat: () => void;
  onActionsClick: () => void;
  showHeader?: boolean;
}) {
  const status = session?.status ?? "idle";
  const previewUrl = session?.previewUrl ?? null;
  const hasPreview = status === "running" && Boolean(previewUrl);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {showHeader ? (
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 pt-4">
          <button
            type="button"
            onClick={onBackToChat}
            className="flex h-11 w-11 items-center justify-center rounded-full text-foreground transition active:scale-95"
            aria-label="Back to chat"
          >
            <MessageSquare className="h-5 w-5" />
          </button>
          <div className="min-w-0 text-center">
            <div className="truncate text-sm font-medium text-foreground">
              {projectName}
            </div>
            <div className="text-xs capitalize text-muted-foreground">
              {status === "idle" ? "Preview" : status}
            </div>
          </div>
          <button
            type="button"
            onClick={onActionsClick}
            className="flex h-11 w-11 items-center justify-center rounded-full text-foreground transition active:scale-95"
            aria-label="Project actions"
          >
            <MoreHorizontal className="h-6 w-6" />
          </button>
        </div>
      ) : null}

      <div
        className={
          showHeader ? "min-h-0 flex-1 px-4 py-4" : "min-h-0 flex-1 py-4"
        }
      >
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
                aria-label="Open preview"
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
        <div
          className={
            showHeader
              ? "mx-4 mb-3 max-h-28 overflow-auto rounded-2xl border border-border/60 bg-[oklch(0.13_0_0)] px-3 py-2 font-mono text-[11px] text-muted-foreground"
              : "mb-3 max-h-28 overflow-auto rounded-2xl border border-border/60 bg-[oklch(0.13_0_0)] px-3 py-2 font-mono text-[11px] text-muted-foreground"
          }
        >
          {events.slice(-4).map((event) => (
            <div key={event.id} className="flex gap-2 py-0.5">
              <span className="shrink-0 uppercase">{event.level}</span>
              <span className="min-w-0 break-all">{event.message}</span>
            </div>
          ))}
        </div>
      ) : null}

      {showHeader ? <div className="pb-safe" /> : null}
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
    filesCount > 0 &&
    (status === "idle" || status === "stopped" || status === "error");
  const copy = previewCopy(status, filesCount, error);

  return (
    <div className="flex h-full min-h-96 flex-col items-center justify-center gap-5 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
        {status === "starting" || status === "stopping" ? (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        ) : status === "error" ? (
          <CircleAlert className="h-8 w-8 text-destructive" />
        ) : status === "running" ? (
          <Info className="h-8 w-8 text-muted-foreground" />
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
                ? "Restart preview"
                : "Start preview"}
            </button>
          </form>
        ) : null}
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
      title: "Starting preview",
      body: "Preparing preview from saved files.",
    };
  }

  if (status === "running") {
    return {
      title: "Preview is still preparing",
      body: "The run is active, but a preview URL is not ready yet. Check console output for progress.",
    };
  }

  if (status === "stopping") {
    return {
      title: "Stopping preview",
      body: "The preview is stopping.",
    };
  }

  if (status === "stopped") {
    return {
      title: "Preview stopped",
      body: "Start again when files are ready.",
    };
  }

  if (status === "error") {
    return {
      title: "Preview blocked",
      body: error ?? "Preview could not start. Console has details.",
    };
  }

  if (filesCount === 0) {
    return {
      title: "Preview will appear here",
      body: "Start preview when files are ready.",
    };
  }

  return {
    title: "Preview will appear here",
    body: "Start preview to check this project.",
  };
}
