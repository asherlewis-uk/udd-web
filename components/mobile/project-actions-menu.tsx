"use client";

import { useTransition } from "react";
import Link from "next/link";
import {
  Code,
  ExternalLink,
  FileText,
  Loader2,
  Play,
  Settings2,
  Square,
  Terminal,
  X,
} from "lucide-react";
import { startRunAction, stopRunAction } from "@/app/actions/run";
import { cn } from "@/lib/utils";
import type { MobileRunSession } from "./types";

export function ProjectActionsMenu({
  isOpen,
  projectId,
  runSession,
  onClose,
}: {
  isOpen: boolean;
  projectId: string;
  runSession: MobileRunSession | null;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  const status = runSession?.status ?? "idle";
  const previewUrl = runSession?.previewUrl ?? null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
        aria-label="Close project actions"
      />

      <div className="fixed inset-x-3 bottom-4 z-50 overflow-hidden rounded-3xl border border-border/70 bg-secondary shadow-[0_24px_90px_-48px_rgba(0,0,0,0.95)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-medium text-foreground">
              Project actions
            </div>
            <div className="text-xs text-muted-foreground">
              Runtime status: {status}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition active:scale-95"
            aria-label="Close actions"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-t border-border/70 p-1">
          <ActionLink
            href={`/projects/${projectId}/files`}
            icon={<Code className="h-5 w-5" />}
            label="View saved files"
            onClose={onClose}
          />
          <ActionLink
            href={`/projects/${projectId}/ai`}
            icon={<FileText className="h-5 w-5" />}
            label="Inspect generation runs"
            onClose={onClose}
          />
          <ActionLink
            href={`/projects/${projectId}/logs`}
            icon={<Terminal className="h-5 w-5" />}
            label="Runtime logs"
            onClose={onClose}
          />
          <ActionLink
            href={`/projects/${projectId}/settings`}
            icon={<Settings2 className="h-5 w-5" />}
            label="Project settings"
            onClose={onClose}
          />
        </div>

        <div className="border-t border-border/70 p-1">
          {previewUrl && status === "running" ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center gap-3 rounded-2xl p-3 text-left text-foreground transition hover:bg-accent/50"
            >
              <ExternalLink className="h-5 w-5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-base">
                Open local preview
              </span>
            </a>
          ) : null}
          <RuntimeAction projectId={projectId} runSession={runSession} />
        </div>
      </div>
    </>
  );
}

function ActionLink({
  href,
  icon,
  label,
  onClose,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className="flex items-center gap-3 rounded-2xl p-3 text-foreground transition hover:bg-accent/50"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-base">{label}</span>
    </Link>
  );
}

function RuntimeAction({
  projectId,
  runSession,
}: {
  projectId: string;
  runSession: MobileRunSession | null;
}) {
  const [pending, startTransition] = useTransition();
  const status = runSession?.status ?? "idle";
  const isBusy = status === "starting" || status === "stopping";
  const isRunning = status === "running";

  const handleStart = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("project_id", projectId);
      await startRunAction(formData);
    });
  };

  const handleStop = () => {
    if (!runSession) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("project_id", projectId);
      formData.set("session_id", runSession.id);
      await stopRunAction(formData);
    });
  };

  const label = isRunning
    ? "Stop local preview"
    : status === "error" || status === "stopped"
      ? "Restart local preview"
      : isBusy
        ? status === "starting"
          ? "Starting local preview"
          : "Stopping local preview"
        : "Start local preview";

  return (
    <button
      type="button"
      onClick={isRunning ? handleStop : handleStart}
      disabled={pending || isBusy}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl p-3 text-left text-foreground transition hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-60",
      )}
    >
      {pending || isBusy ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : isRunning ? (
        <Square className="h-5 w-5 text-muted-foreground" />
      ) : (
        <Play className="h-5 w-5 text-muted-foreground" />
      )}
      <span className="text-base">{label}</span>
    </button>
  );
}
