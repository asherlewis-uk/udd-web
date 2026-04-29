"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Code,
  ExternalLink,
  KeyRound,
  Loader2,
  MessageSquare,
  MonitorPlay,
  Play,
  Settings2,
  Square,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { deleteProject } from "@/app/actions/projects";
import { startRunAction, stopRunAction } from "@/app/actions/run";
import { cn } from "@/lib/utils";
import type { MobileRunSession } from "./types";

export function ProjectActionsMenu({
  isOpen,
  projectId,
  runSession,
  filesCount,
  onClose,
}: {
  isOpen: boolean;
  projectId: string;
  runSession: MobileRunSession | null;
  filesCount: number;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  const status = runSession?.status ?? "idle";
  const previewUrl = runSession?.previewUrl ?? null;
  const canOpenPreview = status === "running" && Boolean(previewUrl);

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/55"
        onClick={onClose}
        aria-label="Close project actions"
      />

      <div className="fixed inset-x-3 bottom-4 z-50 max-h-[min(82dvh,44rem)] overflow-y-auto rounded-3xl border border-border/70 bg-secondary shadow-[0_24px_90px_-48px_rgba(0,0,0,0.95)]">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-medium text-foreground">
              Project actions
            </div>
            <div className="text-xs capitalize text-muted-foreground">
              Preview: {status}
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

        <ActionGroup title="Navigation">
          <ActionLink
            href={`/projects/${projectId}`}
            icon={<MessageSquare className="h-5 w-5" />}
            label="Chat"
            onClose={onClose}
          />
          <ActionLink
            href={`/projects/${projectId}/files`}
            icon={<Code className="h-5 w-5" />}
            label="View code"
            onClose={onClose}
          />
          <ActionLink
            href={`/projects/${projectId}/logs`}
            icon={<Terminal className="h-5 w-5" />}
            label="Console"
            onClose={onClose}
          />
          <ActionLink
            href={`/projects/${projectId}/run`}
            icon={<MonitorPlay className="h-5 w-5" />}
            label="Preview"
            onClose={onClose}
          />
          {canOpenPreview ? (
            <a
              href={previewUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
              onClick={onClose}
              className="flex w-full items-center gap-3 rounded-2xl p-3 text-left text-foreground transition hover:bg-background/45"
            >
              <ExternalLink className="h-5 w-5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-base">
                Open in Browser
              </span>
            </a>
          ) : (
            <UnavailableAction
              icon={<ExternalLink className="h-5 w-5" />}
              label="Open in Browser"
              detail="Preview not running"
            />
          )}
        </ActionGroup>

        <ActionGroup title="Project">
          <ActionLink
            href={`/projects/${projectId}/settings`}
            icon={<Settings2 className="h-5 w-5" />}
            label="Project settings"
            detail="Name, context, archive"
            onClose={onClose}
          />
          <ActionLink
            href="/settings"
            icon={<KeyRound className="h-5 w-5" />}
            label="Provider settings"
            detail="Model and credentials"
            onClose={onClose}
          />
        </ActionGroup>

        <ActionGroup title="Preview">
          <RuntimeAction
            projectId={projectId}
            runSession={runSession}
            filesCount={filesCount}
          />
        </ActionGroup>

        <ActionGroup title="Danger" destructive>
          <DeleteProjectAction projectId={projectId} />
        </ActionGroup>
      </div>
    </>
  );
}

function ActionGroup({
  title,
  destructive = false,
  children,
}: {
  title: string;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border/70 p-1">
      <div
        className={cn(
          "px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide",
          destructive ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function ActionLink({
  href,
  icon,
  label,
  detail,
  destructive = false,
  onClose,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  detail?: string;
  destructive?: boolean;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className={cn(
        "flex items-center gap-3 rounded-2xl p-3 text-foreground transition hover:bg-background/45",
        destructive && "text-destructive hover:bg-destructive/10",
      )}
    >
      <span
        className={destructive ? "text-destructive" : "text-muted-foreground"}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base">{label}</span>
        {detail ? (
          <span className="block truncate text-xs text-muted-foreground">
            {detail}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

function UnavailableAction({
  icon,
  label,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      disabled
      className="flex w-full cursor-not-allowed items-center gap-3 rounded-2xl p-3 text-left text-muted-foreground/65"
    >
      <span>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base">{label}</span>
        <span className="block truncate text-xs">{detail}</span>
      </span>
    </button>
  );
}

function RuntimeAction({
  projectId,
  runSession,
  filesCount,
}: {
  projectId: string;
  runSession: MobileRunSession | null;
  filesCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const status = runSession?.status ?? "idle";
  const isBusy = status === "starting" || status === "stopping";
  const isRunning = status === "running";
  const canStart = filesCount > 0;

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
    ? "Stop preview"
    : status === "error" || status === "stopped"
      ? "Restart preview"
      : isBusy
        ? status === "starting"
          ? "Starting preview"
          : "Stopping preview"
        : "Start preview";
  const detail = !canStart && !isRunning ? "Files needed" : undefined;

  return (
    <button
      type="button"
      onClick={isRunning ? handleStop : handleStart}
      disabled={pending || isBusy || (!isRunning && !canStart)}
      className="flex w-full items-center gap-3 rounded-2xl p-3 text-left text-foreground transition hover:bg-background/45 disabled:cursor-not-allowed disabled:text-muted-foreground/65"
    >
      {pending || isBusy ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : isRunning ? (
        <Square className="h-5 w-5 text-muted-foreground" />
      ) : (
        <Play className="h-5 w-5 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base">{label}</span>
        {detail ? (
          <span className="block truncate text-xs text-muted-foreground/80">
            {detail}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function DeleteProjectAction({ projectId }: { projectId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className="flex w-full items-center gap-3 rounded-2xl p-3 text-left text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Trash2 className="h-5 w-5" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base">Delete project</span>
            <span className="block truncate text-xs text-destructive/75">
              Permanently remove it
            </span>
          </span>
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete project?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the project, files, generation history, and
            console output.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() =>
              startTransition(async () => {
                try {
                  await deleteProject(projectId);
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : "Failed to delete",
                  );
                }
              })
            }
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
