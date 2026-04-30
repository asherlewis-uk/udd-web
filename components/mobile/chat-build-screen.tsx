"use client";

import Link from "next/link";
import { Menu, Play, RefreshCw, Wrench } from "lucide-react";
import { repairFailedTask, retryFailedTask } from "@/app/actions/ai";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";
import { ProjectPill } from "./project-pill";
import type { MobileConversationEntry, MobileProject } from "./types";
import type { ActiveProviderInfo } from "@/components/ai/ai-prompt-form";
import type { NextAction, ProviderReadiness } from "@/lib/workspace/next-action";

export function ChatBuildScreen({
  project,
  conversation,
  activeProvider,
  providerReadiness,
  taskInFlight,
  nextAction,
  onMenuClick,
  onPreviewClick,
  onProjectPillClick,
}: {
  project: MobileProject;
  conversation: MobileConversationEntry[];
  activeProvider: ActiveProviderInfo;
  providerReadiness: ProviderReadiness;
  taskInFlight: boolean;
  nextAction: NextAction;
  onMenuClick: () => void;
  onPreviewClick: () => void;
  onProjectPillClick: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between px-4 pt-4">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground transition active:scale-95"
          aria-label="Open projects"
        >
          <Menu className="h-6 w-6" />
        </button>

        <button
          type="button"
          onClick={onPreviewClick}
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground transition active:scale-95"
          aria-label="Open preview"
        >
          <Play className="h-6 w-6" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">
        {conversation.length === 0 ? (
          <EmptyChatState />
        ) : (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-4">
            {conversation.map((entry) => (
              <ConversationMessage
                key={entry.id}
                entry={entry}
                projectId={project.id}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-none flex-col gap-3 pb-safe">
        <NextActionHint nextAction={nextAction} projectId={project.id} />
        <div className="flex justify-center">
          <ProjectPill
            projectTitle={project.name}
            status={project.status}
            onClick={onProjectPillClick}
          />
        </div>
        <div className="mx-auto w-full max-w-3xl">
          <Composer
            projectId={project.id}
            busy={taskInFlight}
            providerReady={providerReadiness.ready}
            providerLabel={activeProvider.label}
          />
        </div>
      </div>
    </div>
  );
}
function EmptyChatState() {
  return (
    <div className="flex h-full min-h-96 items-center justify-center text-center">
      <div className="flex max-w-xs flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border/60 bg-secondary/45">
          <span className="text-lg font-semibold tracking-wide text-muted-foreground">
            UDD
          </span>
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">
            Describe what you want to build
          </h2>
          <p className="text-sm text-muted-foreground">
            Start with an app idea, feature, or change and UDD will turn it into saved files.
          </p>
        </div>
      </div>
    </div>
  );
}

const SUPPRESS_HINT_ACTIONS = new Set(["local_prompt", "inspect_generation"]);

function NextActionHint({
  nextAction,
  projectId,
}: {
  nextAction: NextAction;
  projectId: string;
}) {
  if (SUPPRESS_HINT_ACTIONS.has(nextAction.cta.action)) return null;

  const isBlocked = nextAction.state === "blocked";

  return (
    <div className="mx-auto w-full max-w-3xl px-4">
      <div
        className={cn(
          "rounded-2xl border px-4 py-3 text-sm",
          isBlocked
            ? "border-amber-500/20 bg-amber-500/5"
            : "border-border/50 bg-secondary/35",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">{nextAction.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
              {nextAction.description}
            </p>
          </div>
          <Link
            href={
              nextAction.cta.taskId
                ? `/projects/${projectId}/ai?task=${nextAction.cta.taskId}`
                : nextAction.cta.href
            }
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-xs font-medium transition active:scale-95",
              isBlocked
                ? "bg-amber-500/15 text-amber-300"
                : "bg-foreground text-background",
            )}
          >
            {nextAction.cta.label}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ConversationMessage({
  entry,
  projectId,
}: {
  entry: MobileConversationEntry;
  projectId: string;
}) {
  const isUser = entry.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] text-sm leading-relaxed",
          isUser
            ? "rounded-3xl rounded-tr-md bg-foreground px-4 py-3 text-background"
            : "text-foreground",
        )}
      >
        {!isUser && entry.badges?.length ? (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {entry.badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-border/60 bg-secondary/65 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}
        <p className="whitespace-pre-wrap">{entry.body}</p>
        {!isUser && entry.facts?.length ? (
          <div className="mt-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
            {entry.facts.map((fact) => (
              <p
                key={`${entry.id}-${fact.label}`}
                className={cn(
                  fact.tone === "destructive" && "text-destructive",
                  fact.tone === "success" && "text-accent",
                )}
              >
                <span className="font-medium text-foreground">
                  {fact.label}:
                </span>{" "}
                {fact.value}
              </p>
            ))}
          </div>
        ) : null}
        {!isUser ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            {entry.href ? (
              <Link
                href={entry.href.url}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {entry.href.label}
              </Link>
            ) : null}
            <RepairRetryControls entry={entry} projectId={projectId} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function RepairRetryControls({
  entry,
  projectId,
}: {
  entry: MobileConversationEntry;
  projectId: string;
}) {
  if (!entry.taskId) return null;

  if (entry.canRepair) {
    return (
      <form action={repairFailedTask}>
        <input type="hidden" name="task_id" value={entry.taskId} />
        <input type="hidden" name="project_id" value={projectId} />
        <input
          type="hidden"
          name="redirect_to"
          value={`/projects/${projectId}`}
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          <Wrench className="h-3.5 w-3.5" />
          Repair
        </button>
      </form>
    );
  }

  if (entry.canRetry) {
    return (
      <form action={retryFailedTask}>
        <input type="hidden" name="task_id" value={entry.taskId} />
        <input type="hidden" name="project_id" value={projectId} />
        <input
          type="hidden"
          name="redirect_to"
          value={`/projects/${projectId}`}
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </form>
    );
  }

  return null;
}
