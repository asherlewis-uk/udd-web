import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock,
  FileText,
  FolderTree,
  MessageSquareText,
  Play,
  Settings2,
  ShieldCheck,
  Terminal,
  TriangleAlert,
} from "lucide-react";
import { AIPromptForm } from "@/components/ai/ai-prompt-form";
import { AIStatusBadge } from "@/components/ai/ai-status-badge";
import { TaskPoller } from "@/components/ai/task-poller";
import { RunPoller } from "@/components/run/run-poller";
import { Button } from "@/components/ui/button";
import { startRunAction } from "@/app/actions/run";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/slug";
import { cn } from "@/lib/utils";
import { deriveNextAction } from "@/lib/workspace/next-action";
import { getActiveProviderForOwner } from "@/lib/ai/providers/server";
import type { Project, RunStatus } from "@/lib/types";
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

  const providerConfig = await getActiveProviderForOwner(user.id, supabase);
  const activeProvider: ActiveProviderInfo = {
    id: providerConfig.id,
    label: providerConfig.label,
    model: providerConfig.model,
  };

  const project = projectData as Project;
  const latestTask = taskData as LatestTask | null;
  const latestRunSession = latestRunData as LatestRunSession | null;
  const savedFiles = (filesData ?? []) as SavedFile[];
  const count = filesCount ?? savedFiles.length;

  // Fetch the validation summary event for the latest work item. The first
  // validation event is the aggregate summary; individual issues follow it.
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

const ACTION_DISPLAY: Record<
  NextAction["state"],
  {
    Icon: ComponentType<{ className?: string }>;
    tone: string;
  }
> = {
  idle: { Icon: MessageSquareText, tone: "border-border bg-background/70" },
  in_progress: { Icon: Clock, tone: "border-accent/40 bg-accent/10" },
  blocked: {
    Icon: CircleAlert,
    tone: "border-destructive/40 bg-destructive/10",
  },
  ready: { Icon: CheckCircle2, tone: "border-accent/40 bg-accent/10" },
};

function AssistantNextAction({
  action,
  projectId,
  latestTask,
  validationSummary,
  latestRunSession,
}: {
  action: NextAction;
  projectId: string;
  latestTask: LatestTask | null;
  validationSummary: ValidationSummary | null;
  latestRunSession: LatestRunSession | null;
}) {
  const { Icon, tone } = ACTION_DISPLAY[action.state];
  const showValidationButton = action.cta.label === "Start validation check";
  const showInspectLink =
    !showValidationButton &&
    action.cta.label !== "Submit a prompt" &&
    action.cta.label !== "Submit new prompt" &&
    action.cta.label !== "Continue building";

  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
        <Bot className="h-4 w-4" />
      </div>
      <div
        className={cn(
          "min-w-0 flex-1 rounded-lg rounded-tl-sm border p-4",
          tone,
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            UDD
          </span>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <p className="mt-2 text-sm font-medium text-foreground">
          {action.label}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {action.description}
        </p>

        {latestTask?.status === "failed" && latestTask.error ? (
          <p className="mt-3 rounded-md border border-destructive/30 bg-background/70 px-3 py-2 text-xs text-destructive">
            {latestTask.error}
          </p>
        ) : null}

        {validationSummary ? (
          <div className="mt-3">
            <ValidationSummaryInline summary={validationSummary} />
          </div>
        ) : null}

        {latestRunSession?.status === "starting" ||
        latestRunSession?.status === "stopping" ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Validation check started{" "}
            {formatRelative(latestRunSession.started_at)}.
          </p>
        ) : null}

        {showValidationButton ? (
          <ValidationCheckForm projectId={projectId} />
        ) : showInspectLink ? (
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href={action.cta.href}>
              {action.cta.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ValidationCheckForm({ projectId }: { projectId: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="mt-4">
      <Link href={`/projects/${projectId}/run`}>
        Start validation check
        <ShieldCheck className="h-3.5 w-3.5" />
      </Link>
    </Button>
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

function IntentPanel({
  project,
  projectId,
}: {
  project: Project;
  projectId: string;
}) {
  const intent = project.idea || project.description;
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Project intent
          </span>
          {intent ? (
            <p className="text-sm leading-relaxed text-foreground">{intent}</p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">
                No intent recorded yet.
              </p>
              <Link
                href={`/projects/${projectId}/settings`}
                className="text-xs text-accent transition hover:underline"
              >
                Add a description in Settings
              </Link>
            </div>
          )}
        </div>
        <Button asChild size="sm">
          <Link href={`/projects/${projectId}/ai`}>
            Submit prompt
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function AgentStatePanel({
  latestTask,
  validationSummary,
  projectId,
}: {
  latestTask: AITask | null;
  validationSummary: ValidationSummary | null;
  projectId: string;
}) {
  if (!latestTask) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Agent state
        </span>
        <p className="mt-3 text-sm text-muted-foreground">
          No work items yet. Submit a prompt above to start generating files.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Agent state
        </span>
        <AIStatusBadge status={latestTask.status} />
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <p className="text-sm font-medium text-foreground">
          {latestTask.title}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-wider">
            {latestTask.kind}
          </span>
          {" · "}
          {latestTask.finished_at
            ? `Finished ${formatRelative(latestTask.finished_at)}`
            : `Queued ${formatRelative(latestTask.created_at)}`}
        </p>
        {latestTask.status === "failed" && latestTask.error ? (
          <p className="mt-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {latestTask.error}
          </p>
        ) : null}
      </div>

      {validationSummary ? (
        <div className="mt-4 border-t border-border pt-4">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Static validation
          </span>
          <div className="mt-2">
            <ValidationSummaryRow summary={validationSummary} />
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <Link
          href={`/projects/${projectId}/ai`}
          className="text-xs text-muted-foreground transition hover:text-foreground"
        >
          View full work item detail
        </Link>
      </div>
    </div>
  );
}

function ValidationSummaryRow({ summary }: { summary: ValidationSummary }) {
  if (summary.blocking_count === 0 && summary.warning_count === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-accent">
        <ShieldCheck className="h-3.5 w-3.5" />
        No blocking issues
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {summary.blocking_count > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          <CircleAlert className="h-3.5 w-3.5" />
          {summary.blocking_count} blocking
        </span>
      ) : null}
      {summary.warning_count > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-foreground/70">
          <TriangleAlert className="h-3.5 w-3.5" />
          {summary.warning_count} warning
          {summary.warning_count === 1 ? "" : "s"}
        </span>
      ) : null}
      {summary.info_count > 0 ? (
        <span className="text-muted-foreground">{summary.info_count} info</span>
      ) : null}
    </div>
  );
}

function ProofPanel({
  filesCount,
  latestFileUpdated,
  latestRunSession,
  projectId,
}: {
  filesCount: number;
  latestFileUpdated: string | null;
  latestRunSession: RunSession | null;
  projectId: string;
}) {
  const RUN_LABELS: Partial<Record<RunStatus, string>> = {
    starting: "Validating",
    running: "Files validated",
    stopping: "Stopping",
    stopped: "Stopped",
    error: "Parse errors found",
  };

  const runLabel = latestRunSession
    ? (RUN_LABELS[latestRunSession.status] ?? latestRunSession.status)
    : "No validation check yet";
  const runClass =
    latestRunSession?.status === "running"
      ? "text-accent"
      : latestRunSession?.status === "error"
        ? "text-destructive"
        : "text-foreground";

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Proof
      </span>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Saved files</dt>
          <dd
            className={cn(
              "tabular-nums",
              filesCount > 0 ? "font-semibold" : "text-muted-foreground",
            )}
          >
            {filesCount > 0 ? filesCount : "None"}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Last file update</dt>
          <dd className="text-foreground">
            {formatRelative(latestFileUpdated)}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Validation check</dt>
          <dd className={cn("text-sm", runClass)}>{runLabel}</dd>
        </div>
      </dl>
      <p className="mt-4 text-[11px] text-muted-foreground">
        UDD can check files, but does not run or preview the app yet.
      </p>
      <div className="mt-3 flex flex-wrap gap-4">
        <Link
          href={`/projects/${projectId}/files`}
          className="text-xs text-muted-foreground transition hover:text-foreground"
        >
          Browse files
        </Link>
        <Link
          href={`/projects/${projectId}/run`}
          className="text-xs text-muted-foreground transition hover:text-foreground"
        >
          View validation check
        </Link>
      </div>
    </div>
  );
}

const LEGACY_STATE_DISPLAY: Record<
  NextAction["state"],
  {
    variant: "default" | "secondary" | "outline";
    Icon: ComponentType<{ className?: string }>;
  }
> = {
  idle: { variant: "default", Icon: Bot },
  in_progress: { variant: "secondary", Icon: Clock },
  blocked: { variant: "default", Icon: CircleAlert },
  ready: { variant: "default", Icon: CheckCircle2 },
};

function NextActionPanel({ action }: { action: NextAction }) {
  const { variant, Icon } = LEGACY_STATE_DISPLAY[action.state];
  return (
    <div className="flex flex-col justify-between gap-6 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Recommended action
        </span>
        <Icon className="h-5 w-5 text-muted-foreground" />
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground">{action.label}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {action.description}
          </p>
        </div>
      </div>
      <Button asChild variant={variant} size="sm" className="w-full">
        <Link href={action.cta.href}>{action.cta.label}</Link>
      </Button>
    </div>
  );
}

function DetailLinks({
  projectId,
  filesCount,
  latestTask,
  latestRunSession,
}: {
  projectId: string;
  filesCount: number;
  latestTask: AITask | null;
  latestRunSession: RunSession | null;
}) {
  const links = [
    {
      href: `/projects/${projectId}/ai`,
      Icon: Bot,
      label: "AI",
      meta: latestTask
        ? `Last work item: ${latestTask.status}`
        : "No work items yet",
    },
    {
      href: `/projects/${projectId}/files`,
      Icon: FolderTree,
      label: "Files",
      meta:
        filesCount > 0
          ? `${filesCount} saved file${filesCount === 1 ? "" : "s"}`
          : "No files yet",
    },
    {
      href: `/projects/${projectId}/run`,
      Icon: Play,
      label: "Run",
      meta: latestRunSession
        ? `Last validation check: ${latestRunSession.status}`
        : "Validation-only",
    },
    {
      href: `/projects/${projectId}/logs`,
      Icon: Terminal,
      label: "Logs",
      meta: "Session event log",
    },
    {
      href: `/projects/${projectId}/settings`,
      Icon: Settings2,
      label: "Settings",
      meta: "Name, idea, danger zone",
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <span className="px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Detail views
      </span>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {links.map(({ href, Icon, label, meta }) => (
          <Link
            key={label}
            href={href}
            className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition hover:border-border/80 hover:bg-card/80"
          >
            <div className="flex items-center justify-between">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:text-foreground" />
            </div>
            <div>
              <div className="text-sm font-medium">{label}</div>
              <div className="text-xs text-muted-foreground">{meta}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ValidationSummaryInline({ summary }: { summary: ValidationSummary }) {
  if (summary.blocking_count === 0 && summary.warning_count === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-accent">
        <ShieldCheck className="h-3.5 w-3.5" />
        No blocking issues
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {summary.blocking_count > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          <CircleAlert className="h-3.5 w-3.5" />
          {summary.blocking_count} blocking
        </span>
      ) : null}
      {summary.warning_count > 0 ? (
        <span className="inline-flex items-center gap-1.5 text-foreground/70">
          <TriangleAlert className="h-3.5 w-3.5" />
          {summary.warning_count} warning
          {summary.warning_count === 1 ? "" : "s"}
        </span>
      ) : null}
      {summary.info_count > 0 ? (
        <span className="text-muted-foreground">{summary.info_count} info</span>
      ) : null}
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
