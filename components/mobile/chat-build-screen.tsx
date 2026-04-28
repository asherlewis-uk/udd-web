"use client";

import Link from "next/link";
import { Menu, Play, RefreshCw, Wrench } from "lucide-react";
import { repairFailedTask, retryFailedTask } from "@/app/actions/ai";
import { startRunAction } from "@/app/actions/run";
import { cn } from "@/lib/utils";
import { Composer } from "./composer";
import { ProjectPill } from "./project-pill";
import type { MobileConversationEntry, MobileProject } from "./types";
import type { ActiveProviderInfo } from "@/components/ai/ai-prompt-form";
import type {
  NextAction,
  ProviderReadiness,
} from "@/lib/workspace/next-action";

export function ChatBuildScreen({
  project,
  conversation,
  nextAction,
  activeProvider,
  providerReadiness,
  taskInFlight,
  onMenuClick,
  onPreviewClick,
  onProjectPillClick,
  onSettingsClick,
}: {
  project: MobileProject;
  conversation: MobileConversationEntry[];
  nextAction: NextAction;
  activeProvider: ActiveProviderInfo;
  providerReadiness: ProviderReadiness;
  taskInFlight: boolean;
  onMenuClick: () => void;
  onPreviewClick: () => void;
  onProjectPillClick: () => void;
  onSettingsClick: () => void;
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
          <EmptyChatState nextAction={nextAction} />
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
        <div className="mx-auto w-full max-w-3xl px-4">
          <NextActionLine
            action={nextAction}
            projectId={project.id}
            onSettingsClick={onSettingsClick}
          />
        </div>
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

function EmptyChatState({ nextAction }: { nextAction: NextAction }) {
  return (
    <div className="flex h-full min-h-96 flex-col items-center justify-center gap-5 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-secondary">
        <span className="text-2xl font-bold text-foreground">UDD</span>
      </div>
      <div className="max-w-xs space-y-2">
        <p className="text-sm text-muted-foreground">
          {nextAction.description}
        </p>
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

function NextActionLine({
  action,
  projectId,
  onSettingsClick,
}: {
  action: NextAction;
  projectId: string;
  onSettingsClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/80 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
      <span className="min-w-0 truncate" title={action.reason}>
        {action.description}
      </span>
      <NextActionCta
        action={action}
        projectId={projectId}
        onSettingsClick={onSettingsClick}
      />
    </div>
  );
}

function NextActionCta({
  action,
  projectId,
  onSettingsClick,
}: {
  action: NextAction;
  projectId: string;
  onSettingsClick: () => void;
}) {
  if (action.cta.action === "local_prompt") return null;

  if (action.cta.action === "start_validation") {
    return (
      <form action={startRunAction} className="shrink-0">
        <input type="hidden" name="project_id" value={projectId} />
        <button type="submit" className="font-medium text-foreground">
          {action.cta.label}
        </button>
      </form>
    );
  }

  if (action.cta.action === "repair" && action.cta.taskId) {
    return (
      <form action={repairFailedTask} className="shrink-0">
        <input type="hidden" name="task_id" value={action.cta.taskId} />
        <input type="hidden" name="project_id" value={projectId} />
        <input
          type="hidden"
          name="redirect_to"
          value={`/projects/${projectId}`}
        />
        <button type="submit" className="font-medium text-foreground">
          {action.cta.label}
        </button>
      </form>
    );
  }

  if (action.cta.action === "retry" && action.cta.taskId) {
    return (
      <form action={retryFailedTask} className="shrink-0">
        <input type="hidden" name="task_id" value={action.cta.taskId} />
        <input type="hidden" name="project_id" value={projectId} />
        <input
          type="hidden"
          name="redirect_to"
          value={`/projects/${projectId}`}
        />
        <button type="submit" className="font-medium text-foreground">
          {action.cta.label}
        </button>
      </form>
    );
  }

  if (action.cta.action === "provider_credential") {
    return (
      <button
        type="button"
        onClick={onSettingsClick}
        className="shrink-0 font-medium text-foreground"
      >
        Settings
      </button>
    );
  }

  return (
    <Link
      href={action.cta.href}
      className="shrink-0 font-medium text-foreground"
    >
      {action.cta.label}
    </Link>
  );
}
