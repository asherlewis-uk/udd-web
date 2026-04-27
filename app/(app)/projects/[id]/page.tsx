import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileText } from "lucide-react";
import { AIPromptForm } from "@/components/ai/ai-prompt-form";
import { TaskPoller } from "@/components/ai/task-poller";
import { RunPoller } from "@/components/run/run-poller";
import { startRunAction } from "@/app/actions/run";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { deriveNextAction } from "@/lib/workspace/next-action";
import {
  getActiveProviderForOwner,
  getProviderCredentialStatusesForOwner,
  hasGatewayEnvironmentCredential,
} from "@/lib/ai/providers/server";
import type { Project } from "@/lib/types";
import type { AITaskEventPayload } from "@/lib/ai/types";
import type { ActiveProviderInfo } from "@/components/ai/ai-prompt-form";
import type {
  AITask,
  NextAction,
  RunSession,
  ValidationSummary,
} from "@/lib/workspace/next-action";

type LatestTask = AITask & {
  input?: unknown;
};

type LatestRunSession = RunSession & {
  created_at?: string;
  stopped_at?: string | null;
};

type SavedFile = {
  id: string;
  path: string;
  language: string | null;
  size_bytes: number;
  updated_at: string;
};

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [
    { data: projectData },
    { data: taskData },
    { count: filesCount, data: filesData },
    { data: latestRunData },
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("ai_tasks")
      .select("id, title, kind, status, input, created_at, finished_at, error")
      .eq("project_id", id)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("project_files")
      .select("id, path, language, size_bytes, updated_at", { count: "exact" })
      .eq("project_id", id)
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("run_sessions")
      .select("id, status, started_at, stopped_at, created_at")
      .eq("project_id", id)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!projectData) notFound();

  const [providerConfig, credentialStatuses] = await Promise.all([
    getActiveProviderForOwner(user.id, supabase),
    getProviderCredentialStatusesForOwner(user.id),
  ]);
  const activeProvider: ActiveProviderInfo = {
    id: providerConfig.id,
    label: providerConfig.label,
    model: providerConfig.model,
    credentialStatuses,
    environmentCredentialAvailable: hasGatewayEnvironmentCredential(),
  };

  const project = projectData as Project;
  const latestTask = taskData as LatestTask | null;
  const latestRunSession = latestRunData as LatestRunSession | null;
  const savedFiles = (filesData ?? []) as SavedFile[];
  const count = filesCount ?? savedFiles.length;

  let validationSummary: ValidationSummary | null = null;
  if (latestTask) {
    const { data: valEvent } = await supabase
      .from("ai_task_events")
      .select("payload")
      .eq("task_id", latestTask.id)
      .eq("owner_id", user.id)
      .eq("kind", "validation")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (valEvent) {
      const p = valEvent.payload as AITaskEventPayload;
      if (p.step === "summary") {
        validationSummary = {
          message: p.message ?? "",
          blocking_count: p.blocking_count ?? 0,
          warning_count: p.warning_count ?? 0,
          info_count: p.info_count ?? 0,
        };
      }
    }
  }

  const taskInFlight =
    latestTask?.status === "pending" || latestTask?.status === "running";
  const runInFlight =
    latestRunSession?.status === "starting" ||
    latestRunSession?.status === "running" ||
    latestRunSession?.status === "stopping";

  const nextAction = deriveNextAction({
    project,
    latestTask,
    validationSummary,
    projectFilesCount: count,
    latestRunSession,
  });

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto scroll-smooth px-6 py-6 space-y-2">
          <ConversationStream
            latestTask={latestTask}
            latestPrompt={extractPrompt(latestTask)}
          />
        </div>

        <div className="flex-none flex flex-col gap-2 px-6 pb-6 pt-5">
          <AssistantMessageBubble action={nextAction} projectId={id} />
          <CockpitPromptForm
            projectId={id}
            busy={taskInFlight}
            activeProvider={activeProvider}
          />
        </div>
      </div>

      <div className="hidden lg:flex w-[38%] shrink-0 border-l flex-col overflow-y-auto">
        <ContextSurface
          project={project}
          files={savedFiles}
          filesCount={count}
          validationSummary={validationSummary}
          latestRunSession={latestRunSession}
          latestTask={latestTask}
        />
      </div>

      <TaskPoller active={taskInFlight} />
      <RunPoller active={runInFlight} />
    </div>
  );
}

function ConversationStream({
  latestTask,
  latestPrompt,
}: {
  latestTask: LatestTask | null;
  latestPrompt: string | null;
}) {
  return (
    <>
      {latestPrompt ? (
        <ChatMessage role="user">
          <p className="text-sm leading-relaxed">{latestPrompt}</p>
        </ChatMessage>
      ) : null}

      {latestTask ? (
        <ChatMessage role="assistant">
          <div className="flex flex-wrap items-center gap-2">
            <WorkItemStatusBadge status={latestTask.status} />
            <span className="text-xs text-muted-foreground">
              {latestTask.finished_at
                ? `Updated ${formatRelative(latestTask.finished_at)}`
                : `Queued ${formatRelative(latestTask.created_at)}`}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed">{latestTask.title}</p>
          {latestTask.status === "failed" && latestTask.error ? (
            <p className="mt-2 text-sm text-destructive">{latestTask.error}</p>
          ) : null}
        </ChatMessage>
      ) : null}
    </>
  );
}

function ChatMessage({
  role,
  children,
}: {
  role: "assistant" | "user";
  children: ReactNode;
}) {
  const isUser = role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%]",
          isUser
            ? "rounded-lg rounded-tr-sm bg-primary px-4 py-3 text-primary-foreground"
            : "py-2 text-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function WorkItemStatusBadge({ status }: { status: LatestTask["status"] }) {
  const labels: Record<LatestTask["status"], string> = {
    pending: "queued",
    running: "working",
    completed: "saved",
    failed: "needs revision",
    cancelled: "cancelled",
  };
  const tone =
    status === "completed"
      ? "text-accent"
      : status === "failed"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <span className={cn("text-xs font-medium capitalize", tone)}>
      {labels[status]}
    </span>
  );
}

function AssistantMessageBubble({
  action,
  projectId,
}: {
  action: NextAction;
  projectId: string;
}) {
  const aiHref = `/projects/${projectId}/ai`;
  // Suppress CTAs that point back to the cockpit's own input surface.
  const isLocalAction =
    action.cta.href === aiHref || action.cta.href === `/projects/${projectId}`;
  const isValidationStart = action.cta.label === "Start validation check";

  return (
    <div className="flex items-baseline gap-2 py-1 text-sm text-muted-foreground/80">
      <span className="leading-relaxed">{action.description}</span>
      {isValidationStart ? (
        <form action={startRunAction} className="contents">
          <input type="hidden" name="project_id" value={projectId} />
          <button
            type="submit"
            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-4 hover:underline"
          >
            Start validation check
            <ArrowRight className="h-3 w-3" />
          </button>
        </form>
      ) : !isLocalAction ? (
        <Link
          href={action.cta.href}
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-4 hover:underline"
        >
          {action.cta.label}
          <ArrowRight className="h-3 w-3" />
        </Link>
      ) : null}
    </div>
  );
}

function CockpitPromptForm({
  projectId,
  busy,
  activeProvider,
}: {
  projectId: string;
  busy?: boolean;
  activeProvider: ActiveProviderInfo;
}) {
  return (
    <AIPromptForm
      projectId={projectId}
      redirectTo={`/projects/${projectId}`}
      variant="cockpit"
      busy={busy}
      activeProvider={activeProvider}
    />
  );
}

function ContextSurface({
  project,
  files,
  filesCount,
  validationSummary,
  latestRunSession,
  latestTask,
}: {
  project: Project;
  files: SavedFile[];
  filesCount: number;
  validationSummary: ValidationSummary | null;
  latestRunSession: LatestRunSession | null;
  latestTask: LatestTask | null;
}) {
  const runActive =
    latestRunSession?.status === "running" ||
    latestRunSession?.status === "starting" ||
    latestRunSession?.status === "stopping";

  if (runActive) {
    return <RunStatusView project={project} session={latestRunSession!} />;
  }

  if (latestTask?.status === "pending" || latestTask?.status === "running") {
    return <WorkingStateView />;
  }

  if (validationSummary) {
    return <ValidationSummaryView summary={validationSummary} />;
  }

  if (filesCount > 0) {
    return <FileSummaryView files={files} filesCount={filesCount} />;
  }

  return <EmptyStateView />;
}

function RunStatusView({
  project,
  session,
}: {
  project: Project;
  session: LatestRunSession;
}) {
  const isActive =
    session.status === "starting" || session.status === "stopping";
  return (
    <div className="flex min-h-full flex-col px-6 py-6 text-sm">
      {isActive ? (
        <p className="leading-relaxed text-muted-foreground">
          Validating saved files…
        </p>
      ) : (
        <>
          <p className="leading-relaxed text-muted-foreground">
            Saved files for {project.name} parsed cleanly.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Checked {formatRelative(session.started_at)}
          </p>
        </>
      )}
    </div>
  );
}

function ValidationSummaryView({ summary }: { summary: ValidationSummary }) {
  return (
    <div className="flex min-h-full flex-col px-6 py-6 text-sm">
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>{summary.blocking_count} blocking</span>
        <span>
          {summary.warning_count} warning
          {summary.warning_count === 1 ? "" : "s"}
        </span>
        <span>{summary.info_count} info</span>
      </div>
      {summary.message ? (
        <p className="mt-4 leading-relaxed text-muted-foreground">
          {summary.message}
        </p>
      ) : null}
    </div>
  );
}

function FileSummaryView({
  files,
  filesCount,
}: {
  files: SavedFile[];
  filesCount: number;
}) {
  return (
    <div className="flex min-h-full flex-col px-6 py-6 text-sm">
      <div className="flex flex-col divide-y divide-border/60">
        {files.map((file) => (
          <div
            key={file.id}
            className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
          >
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-xs text-foreground">
                {file.path}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {file.language ?? "file"} · {formatBytes(file.size_bytes)} ·
                Updated {formatRelative(file.updated_at)}
              </p>
            </div>
          </div>
        ))}
      </div>
      {filesCount > files.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the most recently updated {files.length} saved files.
        </p>
      ) : null}
    </div>
  );
}

function WorkingStateView() {
  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-6 text-sm">
      <p className="text-muted-foreground">Working…</p>
      <p className="mt-1 text-xs text-muted-foreground/70">
        UDD is drafting saved files.
      </p>
    </div>
  );
}

function EmptyStateView() {
  return (
    <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
      No activity yet
    </div>
  );
}

function extractPrompt(task: LatestTask | null): string | null {
  if (!task || !task.input || typeof task.input !== "object") return null;
  const prompt = (task.input as { prompt?: unknown }).prompt;
  return typeof prompt === "string" && prompt.trim() ? prompt : null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
