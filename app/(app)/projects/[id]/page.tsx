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
import type {
  AITaskEventPayload,
  AITaskEventRow,
  AITaskKind,
  AITaskResult,
  AITaskRow,
} from "@/lib/ai/types";
import type { ActiveProviderInfo } from "@/components/ai/ai-prompt-form";
import type {
  NextAction,
  RunSession,
  ValidationSummary,
} from "@/lib/workspace/next-action";

const CONVERSATION_TASK_LIMIT = 6;
const CONVERSATION_RUN_LIMIT = 2;

type LatestTask = AITaskRow;

type LatestRunSession = RunSession & {
  created_at: string;
  stopped_at?: string | null;
  error?: string | null;
};

type PromptRow = {
  id: string;
  body: string;
};

type RunEventRow = {
  id: string;
  session_id: string;
  level: string;
  source: string;
  message: string;
  created_at: string;
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
    { data: tasksData },
    { count: filesCount, data: filesData },
    { data: runSessionsData },
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("ai_tasks")
      .select(
        "id, project_id, prompt_id, kind, title, status, input, output, error, run_session_id, created_at, started_at, finished_at",
      )
      .eq("project_id", id)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(CONVERSATION_TASK_LIMIT),
    supabase
      .from("project_files")
      .select("id, path, language, size_bytes, updated_at", { count: "exact" })
      .eq("project_id", id)
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("run_sessions")
      .select("id, status, started_at, stopped_at, created_at, error")
      .eq("project_id", id)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(CONVERSATION_RUN_LIMIT),
  ]);

  if (!projectData) notFound();

  const project = projectData as Project;
  const recentTasks = (tasksData ?? []) as LatestTask[];
  const latestTask = recentTasks[0] ?? null;
  const recentRunSessions = (runSessionsData ?? []) as LatestRunSession[];
  const latestRunSession = recentRunSessions[0] ?? null;
  const savedFiles = (filesData ?? []) as SavedFile[];
  const count = filesCount ?? savedFiles.length;

  const taskIds = recentTasks.map((task) => task.id);
  const promptIds = Array.from(
    new Set(
      recentTasks
        .map((task) => task.prompt_id)
        .filter((promptId): promptId is string => Boolean(promptId)),
    ),
  );
  const runSessionIds = recentRunSessions.map((session) => session.id);

  const promptRowsQuery = promptIds.length
    ? supabase
        .from("prompts")
        .select("id, body")
        .eq("project_id", id)
        .eq("owner_id", user.id)
        .in("id", promptIds)
    : Promise.resolve({ data: [] as PromptRow[] });
  const taskEventsQuery = taskIds.length
    ? supabase
        .from("ai_task_events")
        .select("id, task_id, kind, payload, created_at")
        .eq("owner_id", user.id)
        .in("task_id", taskIds)
        .order("created_at", { ascending: true })
        .limit(300)
    : Promise.resolve({ data: [] as AITaskEventRow[] });
  const runEventsQuery = runSessionIds.length
    ? supabase
        .from("run_events")
        .select("id, session_id, level, source, message, created_at")
        .eq("project_id", id)
        .eq("owner_id", user.id)
        .in("session_id", runSessionIds)
        .order("created_at", { ascending: true })
        .limit(120)
    : Promise.resolve({ data: [] as RunEventRow[] });

  const [
    providerConfig,
    credentialStatuses,
    { data: promptRowsData },
    { data: taskEventsData },
    { data: runEventsData },
  ] = await Promise.all([
    getActiveProviderForOwner(user.id, supabase),
    getProviderCredentialStatusesForOwner(user.id),
    promptRowsQuery,
    taskEventsQuery,
    runEventsQuery,
  ]);
  const activeProvider: ActiveProviderInfo = {
    id: providerConfig.id,
    label: providerConfig.label,
    model: providerConfig.model,
    credentialStatuses,
    environmentCredentialAvailable: hasGatewayEnvironmentCredential(),
  };

  const promptsById = new Map(
    ((promptRowsData ?? []) as PromptRow[]).map((prompt) => [
      prompt.id,
      prompt.body,
    ]),
  );
  const taskEventsByTaskId = groupTaskEvents(
    (taskEventsData ?? []) as AITaskEventRow[],
  );
  const runEventsBySessionId = groupRunEvents(
    (runEventsData ?? []) as RunEventRow[],
  );
  const validationSummary = latestTask
    ? extractValidationSummary(taskEventsByTaskId.get(latestTask.id) ?? [])
    : null;

  const taskInFlight = recentTasks.some(
    (task) => task.status === "pending" || task.status === "running",
  );
  const runInFlight = recentRunSessions.some(
    (session) =>
      session.status === "starting" ||
      session.status === "running" ||
      session.status === "stopping",
  );

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
            tasks={recentTasks}
            promptsById={promptsById}
            taskEventsByTaskId={taskEventsByTaskId}
            runSessions={recentRunSessions}
            runEventsBySessionId={runEventsBySessionId}
            projectId={id}
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
  tasks,
  promptsById,
  taskEventsByTaskId,
  runSessions,
  runEventsBySessionId,
  projectId,
}: {
  tasks: LatestTask[];
  promptsById: Map<string, string>;
  taskEventsByTaskId: Map<string, AITaskEventRow[]>;
  runSessions: LatestRunSession[];
  runEventsBySessionId: Map<string, RunEventRow[]>;
  projectId: string;
}) {
  const entries = [
    ...tasks.map((task) => ({
      kind: "task" as const,
      createdAt: task.created_at,
      task,
    })),
    ...runSessions.map((session) => ({
      kind: "run" as const,
      createdAt: session.created_at,
      session,
    })),
  ].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );

  if (entries.length === 0) return null;

  return (
    <>
      {entries.map((entry) => {
        if (entry.kind === "run") {
          return (
            <ChatMessage key={entry.session.id} role="assistant">
              <RunConversationSummary
                session={entry.session}
                events={runEventsBySessionId.get(entry.session.id) ?? []}
                projectId={projectId}
              />
            </ChatMessage>
          );
        }

        const prompt = promptForTask(entry.task, promptsById);
        return (
          <div key={entry.task.id} className="space-y-2">
            {prompt ? (
              <ChatMessage role="user">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {prompt}
                </p>
              </ChatMessage>
            ) : null}
            <ChatMessage role="assistant">
              <TaskConversationSummary
                task={entry.task}
                events={taskEventsByTaskId.get(entry.task.id) ?? []}
                projectId={projectId}
              />
            </ChatMessage>
          </div>
        );
      })}
    </>
  );
}

type GenerationOperation = {
  badge: string;
  sentenceName: string;
  description: string;
  runningMessage: string;
  contextMessage: string;
};

function generationOperation(kind: AITaskKind): GenerationOperation {
  if (kind === "scaffold") {
    return {
      badge: "Scaffold run",
      sentenceName: "The scaffold run",
      description:
        "Scaffold · generated files replace the saved file set after validation and persistence pass.",
      runningMessage:
        "UDD is scaffolding a replacement file set. Files are saved only after validation and persistence pass.",
      contextMessage:
        "UDD is drafting a replacement file set. Saved files change only after validation and persistence pass.",
    };
  }

  if (kind === "refactor") {
    return {
      badge: "Refactor run",
      sentenceName: "The refactor run",
      description:
        "Refactor · generated files are checked against the existing saved file set and then persisted if validation passes.",
      runningMessage:
        "UDD is refactoring against the saved file set. Files are saved only after validation and persistence pass.",
      contextMessage:
        "UDD is drafting a refactor against saved files. Changes are saved only after validation passes.",
    };
  }

  if (kind === "explain") {
    return {
      badge: "Explain run",
      sentenceName: "The explanation run",
      description:
        "Explain · source classified this as an explanation request; any generated files still use the validation gate.",
      runningMessage:
        "UDD is processing an explanation request. Any generated files are saved only after validation and persistence pass.",
      contextMessage:
        "UDD is processing an explanation request through the same validation-before-save gate.",
    };
  }

  if (kind === "other") {
    return {
      badge: "Generation run",
      sentenceName: "The generation run",
      description:
        "Generation · general generated output is checked before anything is saved.",
      runningMessage:
        "UDD is generating output. Files are saved only after validation and persistence pass.",
      contextMessage:
        "UDD is generating files. They are saved only after validation passes.",
    };
  }

  return {
    badge: "Edit run",
    sentenceName: "The edit run",
    description:
      "Edit · generated files are checked against existing saved files and then persisted if validation passes.",
    runningMessage:
      "UDD is drafting changes against the saved file set. Files are saved only after validation and persistence pass.",
    contextMessage:
      "UDD is drafting changes against saved files. Changes are saved only after validation passes.",
  };
}

function TaskConversationSummary({
  task,
  events,
  projectId,
}: {
  task: LatestTask;
  events: AITaskEventRow[];
  projectId: string;
}) {
  const output = task.output as AITaskResult | null;
  const operation = generationOperation(task.kind);
  const validationSummary = extractValidationSummary(events);
  const latestProgress = latestEventByKind(events, "progress");
  const firstBlockingIssue = events.find(
    (event) =>
      event.kind === "validation" && event.payload.severity === "blocking",
  );
  const completedEvent = latestEventByKind(events, "completed");
  const completedFileCount =
    completedEvent?.payload.file_count ?? output?.files.length ?? 0;

  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed">
      <div className="flex flex-wrap items-center gap-2">
        <WorkItemStatusBadge status={task.status} />
        <OperationKindBadge label={operation.badge} />
        <span className="text-xs text-muted-foreground">
          {task.finished_at
            ? `Updated ${formatRelative(task.finished_at)}`
            : task.started_at
              ? `Started ${formatRelative(task.started_at)}`
              : `Queued ${formatRelative(task.created_at)}`}
        </span>
      </div>

      <p className="text-foreground">
        {taskStatusMessage(task, output, operation)}
      </p>

      <ConversationFact label="Operation">
        {operation.description}
      </ConversationFact>

      {task.status === "running" && latestProgress?.payload.message ? (
        <ConversationFact label="Progress">
          {latestProgress.payload.message}
        </ConversationFact>
      ) : null}

      {output && task.status === "completed" ? (
        <ConversationFact label="Saved proof">
          Saved {completedFileCount} generated file
          {completedFileCount === 1 ? "" : "s"} after validation passed. {output.summary}
        </ConversationFact>
      ) : null}

      {output && task.status === "failed" ? (
        <ConversationFact label="Diagnostic output">
          {output.files.length} generated file
          {output.files.length === 1 ? "" : "s"} recorded for diagnostics; the
          task did not complete, so this result is not presented as saved.
        </ConversationFact>
      ) : null}

      {validationSummary ? (
        <ConversationFact label="Validation">
          {validationSummary.message || "Validation recorded."}
          {validationSummary.blocking_count ||
          validationSummary.warning_count ? (
            <span className="text-muted-foreground">
              {" "}
              ({validationSummary.blocking_count} blocking,{" "}
              {validationSummary.warning_count} warning
              {validationSummary.warning_count === 1 ? "" : "s"})
            </span>
          ) : null}
        </ConversationFact>
      ) : null}

      {firstBlockingIssue ? (
        <ConversationFact label="Blocking issue" tone="destructive">
          {formatValidationIssue(firstBlockingIssue.payload)}
        </ConversationFact>
      ) : null}

      {task.status === "failed" && task.error ? (
        <ConversationFact label="Failure" tone="destructive">
          {task.error}
        </ConversationFact>
      ) : null}

      {task.status === "failed" || task.status === "cancelled" ? (
        <ConversationFact label="Recovery">
          Review this generation run before retrying or submitting a revised
          prompt.
        </ConversationFact>
      ) : null}

      <Link
        href={`/projects/${projectId}/ai?task=${task.id}`}
        className="w-fit text-xs font-medium text-foreground underline-offset-4 hover:underline"
      >
        Inspect work item
      </Link>
    </div>
  );
}

function RunConversationSummary({
  session,
  events,
  projectId,
}: {
  session: LatestRunSession;
  events: RunEventRow[];
  projectId: string;
}) {
  const highlight = runEventHighlight(session, events);

  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed">
      <div className="flex flex-wrap items-center gap-2">
        <ValidationCheckStatusBadge status={session.status} />
        <span className="text-xs text-muted-foreground">
          {session.stopped_at
            ? `Updated ${formatRelative(session.stopped_at)}`
            : session.started_at
              ? `Started ${formatRelative(session.started_at)}`
              : `Queued ${formatRelative(session.created_at)}`}
        </span>
      </div>
      <p className="text-foreground">{runStatusMessage(session)}</p>
      <ConversationFact label="Operation">
        Validation check · parser validation of saved files only.
      </ConversationFact>
      {highlight ? (
        <ConversationFact
          label="Parser output"
          tone={highlight.level === "error" ? "destructive" : "default"}
        >
          {highlight.message}
        </ConversationFact>
      ) : null}
      {session.status === "error" && session.error ? (
        <ConversationFact label="Failure" tone="destructive">
          {session.error}
        </ConversationFact>
      ) : null}
      <Link
        href={`/projects/${projectId}/run`}
        className="w-fit text-xs font-medium text-foreground underline-offset-4 hover:underline"
      >
        Inspect validation check
      </Link>
    </div>
  );
}

function ConversationFact({
  label,
  tone = "default",
  children,
}: {
  label: string;
  tone?: "default" | "destructive";
  children: ReactNode;
}) {
  return (
    <p
      className={cn(
        "text-sm text-muted-foreground",
        tone === "destructive" && "text-destructive",
      )}
    >
      <span className="font-medium text-foreground">{label}:</span> {children}
    </p>
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
    running: "generating",
    completed: "validated and saved",
    failed: "failed",
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

function OperationKindBadge({ label }: { label: string }) {
  return (
    <span className="rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
      {label}
    </span>
  );
}

function ValidationCheckStatusBadge({
  status,
}: {
  status: LatestRunSession["status"];
}) {
  const labels: Record<LatestRunSession["status"], string> = {
    idle: "idle",
    starting: "validating",
    running: "validated",
    stopping: "stopping",
    stopped: "stopped",
    error: "validation failed",
  };
  const tone =
    status === "running"
      ? "text-accent"
      : status === "error"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <span className={cn("text-xs font-medium capitalize", tone)}>
      {labels[status]}
    </span>
  );
}

function taskStatusMessage(
  task: LatestTask,
  output: AITaskResult | null,
  operation: GenerationOperation,
): string {
  if (task.status === "pending") {
    return `${operation.sentenceName} queued. No generated output is recorded yet.`;
  }

  if (task.status === "running") {
    return operation.runningMessage;
  }

  if (task.status === "completed") {
    const fileCount = output?.files.length ?? 0;
    if (fileCount === 0) {
      return `${operation.sentenceName} completed after validation and persistence.`;
    }
    return `${operation.sentenceName} completed: validation passed and ${fileCount} generated file${
      fileCount === 1 ? " is" : "s are"
    } saved.`;
  }

  if (task.status === "failed") {
    return output
      ? `${operation.sentenceName} staged generated output, but failed before completion. Saved files are not represented by this result.`
      : `${operation.sentenceName} failed before a generated result was recorded.`;
  }

  return `${operation.sentenceName} was cancelled before a completed result was recorded.`;
}

function runStatusMessage(session: LatestRunSession): string {
  if (session.status === "starting") {
    return "UDD is parsing saved files for a validation check. No app is served or previewed.";
  }

  if (session.status === "running") {
    return "Saved files parsed cleanly. This is validation only; no app is served or previewed.";
  }

  if (session.status === "stopping") {
    return "The validation check is stopping.";
  }

  if (session.status === "stopped") {
    return "The parser validation check was stopped.";
  }

  if (session.status === "error") {
    return "The parser validation check ended with an error recorded by the parser or file loader.";
  }

  return "No validation check is active.";
}

function promptForTask(
  task: LatestTask,
  promptsById: Map<string, string>,
): string | null {
  if (task.prompt_id) {
    const prompt = promptsById.get(task.prompt_id);
    if (prompt?.trim()) return prompt;
  }

  if (!task.input || typeof task.input !== "object") return null;
  const prompt = (task.input as { prompt?: unknown }).prompt;
  return typeof prompt === "string" && prompt.trim() ? prompt : null;
}

function extractValidationSummary(
  events: AITaskEventRow[],
): ValidationSummary | null {
  const summaryEvent = events.find(
    (event) => event.kind === "validation" && event.payload.step === "summary",
  );
  if (!summaryEvent) return null;

  const payload = summaryEvent.payload as AITaskEventPayload;
  return {
    message: payload.message ?? "",
    blocking_count: payload.blocking_count ?? 0,
    warning_count: payload.warning_count ?? 0,
    info_count: payload.info_count ?? 0,
  };
}

function latestEventByKind(
  events: AITaskEventRow[],
  kind: AITaskEventRow["kind"],
): AITaskEventRow | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].kind === kind) return events[index];
  }
  return null;
}

function runEventHighlight(
  session: LatestRunSession,
  events: RunEventRow[],
): RunEventRow | null {
  if (events.length === 0) return null;

  if (session.status === "error") {
    return latestRunEventMatching(events, (event) => event.level === "error");
  }

  if (session.status === "running") {
    return (
      latestRunEventMatching(events, (event) =>
        /Validation complete|Parsed cleanly/i.test(event.message),
      ) ?? events[events.length - 1]
    );
  }

  return events[events.length - 1];
}

function latestRunEventMatching(
  events: RunEventRow[],
  predicate: (event: RunEventRow) => boolean,
): RunEventRow | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (predicate(events[index])) return events[index];
  }
  return null;
}

function formatValidationIssue(payload: AITaskEventPayload): string {
  const location = payload.file_path
    ? `${payload.file_path}${payload.line ? `:${payload.line}` : ""}`
    : null;
  const details = [location, payload.message].filter(Boolean).join(" — ");
  return details || "Blocking validation issue recorded.";
}

function groupTaskEvents(
  events: AITaskEventRow[],
): Map<string, AITaskEventRow[]> {
  const groupedEvents = new Map<string, AITaskEventRow[]>();
  for (const event of events) {
    const existingEvents = groupedEvents.get(event.task_id) ?? [];
    existingEvents.push(event);
    groupedEvents.set(event.task_id, existingEvents);
  }
  return groupedEvents;
}

function groupRunEvents(events: RunEventRow[]): Map<string, RunEventRow[]> {
  const groupedEvents = new Map<string, RunEventRow[]>();
  for (const event of events) {
    const existingEvents = groupedEvents.get(event.session_id) ?? [];
    existingEvents.push(event);
    groupedEvents.set(event.session_id, existingEvents);
  }
  return groupedEvents;
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
    return <WorkingStateView task={latestTask} />;
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

function WorkingStateView({ task }: { task: LatestTask }) {
  const operation = generationOperation(task.kind);

  return (
    <div className="flex min-h-full flex-col justify-center px-6 py-6 text-sm">
      <p className="text-muted-foreground">{operation.badge} in progress</p>
      <p className="mt-1 text-xs text-muted-foreground/70">
        {operation.contextMessage}
      </p>
    </div>
  );
}

function EmptyStateView() {
  return (
    <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
      No generation runs yet
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
