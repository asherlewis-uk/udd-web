import { notFound } from "next/navigation";
import { TaskPoller } from "@/components/ai/task-poller";
import { RunPoller } from "@/components/run/run-poller";
import { MobileShell } from "@/components/mobile/mobile-shell";
import { getSession } from "@/lib/auth-session";
import { formatRelative } from "@/lib/slug";
import { getRepairDisplayPrompt, getRepairMetadata } from "@/lib/ai/repair";
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
  MobileConversationEntry,
  MobileProject,
  MobileRunEvent,
  MobileRunSession,
} from "@/components/mobile/types";
import type {
  ProviderReadiness,
  RunSession,
  RuntimeSummary,
  ValidationSummary,
} from "@/lib/workspace/next-action";
import {
  getProjectByIdAndOwner,
  getProjectsForOwner,
  getProfileDisplayName,
  getRunSessionsForProject,
  countProjectFiles,
  getAITasksForProject,
  getProjectFilesForProject,
  getPromptById,
  getAITaskEvents,
  getRunEventsForSession,
} from "@/lib/db/queries";
import {
  mapProject,
  mapProjectList,
  mapRunSession,
  mapRunEvent,
  mapAITask,
  mapAITaskEvent,
  mapProjectFile,
} from "@/lib/db/mappers";

const CONVERSATION_TASK_LIMIT = 6;
const CONVERSATION_RUN_LIMIT = 2;

type LatestTask = AITaskRow;

type LatestRunSession = RunSession & {
  created_at: string;
  stopped_at?: string | null;
  error?: string | null;
  preview_url?: string | null;
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

  const session = await getSession();
  if (!session) notFound();
  const user = session.user;

  const [
    projectRow,
    taskRows,
    fileRows,
    runSessionRows,
    allProjectRows,
    displayName,
    filesCount,
  ] = await Promise.all([
    getProjectByIdAndOwner(id, user.id),
    getAITasksForProject(id, user.id, { limit: CONVERSATION_TASK_LIMIT }),
    getProjectFilesForProject(id, user.id, {
      orderByUpdatedAt: true,
      limit: 6,
    }),
    getRunSessionsForProject(id, user.id, { limit: CONVERSATION_RUN_LIMIT }),
    getProjectsForOwner(user.id, { limit: 30 }),
    getProfileDisplayName(user.id),
    countProjectFiles(id, user.id),
  ]);

  if (!projectRow) notFound();

  const project = mapProject(projectRow) as Project;
  const recentTasks = taskRows.map(mapAITask) as LatestTask[];
  const latestTask = recentTasks[0] ?? null;
  const recentRunSessions = runSessionRows.map(
    mapRunSession,
  ) as LatestRunSession[];
  const latestRunSession = recentRunSessions[0] ?? null;
  const savedFiles = fileRows.map(mapProjectFile) as SavedFile[];
  const count = filesCount;

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
    ? Promise.all(
        promptIds.map(async (promptId) => {
          const row = await getPromptById(promptId, user.id);
          return row ? { id: promptId, body: row.body } : null;
        }),
      ).then((rows) => rows.filter((r): r is PromptRow => r !== null))
    : Promise.resolve([] as PromptRow[]);
  const taskEventsQuery = taskIds.length
    ? Promise.all(
        taskIds.map(async (taskId) => {
          const rows = await getAITaskEvents(taskId, user.id, { limit: 300 });
          return rows.map(mapAITaskEvent) as AITaskEventRow[];
        }),
      ).then((arrays) => arrays.flat())
    : Promise.resolve([] as AITaskEventRow[]);
  const runEventsQuery = runSessionIds.length
    ? Promise.all(
        runSessionIds.map(async (sessionId) => {
          const rows = await getRunEventsForSession(sessionId, user.id, {
            limit: 120,
          });
          return rows.map(mapRunEvent) as RunEventRow[];
        }),
      ).then((arrays) => arrays.flat())
    : Promise.resolve([] as RunEventRow[]);

  const [
    providerConfig,
    credentialStatuses,
    promptRowsData,
    taskEventsData,
    runEventsData,
  ] = await Promise.all([
    getActiveProviderForOwner(user.id),
    getProviderCredentialStatusesForOwner(user.id),
    promptRowsQuery,
    taskEventsQuery,
    runEventsQuery,
  ]);
  const environmentCredentialAvailable = hasGatewayEnvironmentCredential();
  const activeProviderCredentialStatus =
    credentialStatuses[providerConfig.id] ?? "missing";
  const activeProviderHasSavedCredential =
    activeProviderCredentialStatus === "valid";
  const activeProviderHasInvalidCredential =
    activeProviderCredentialStatus === "invalid";
  const activeProvider: ActiveProviderInfo = {
    id: providerConfig.id,
    label: providerConfig.label,
    model: providerConfig.model,
    credentialStatuses,
    environmentCredentialAvailable,
  };
  const providerReadiness: ProviderReadiness = {
    id: providerConfig.id,
    label: providerConfig.label,
    model: providerConfig.model,
    hasSavedCredential: activeProviderHasSavedCredential,
    hasInvalidCredential: activeProviderHasInvalidCredential,
    hasEnvironmentCredential: environmentCredentialAvailable,
    ready: activeProviderHasSavedCredential || environmentCredentialAvailable,
  };

  const promptsById = new Map(
    promptRowsData.map((prompt) => [prompt.id, prompt.body]),
  );
  const taskEventsByTaskId = groupTaskEvents(taskEventsData);
  const runEventsBySessionId = groupRunEvents(runEventsData);
  const latestRunSummary = latestRunSession
    ? summarizeRuntimeEvents(
        runEventsBySessionId.get(latestRunSession.id) ?? [],
      )
    : null;
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
    latestProjectFileUpdatedAt: savedFiles[0]?.updated_at ?? null,
    latestRunSession,
    latestRunSummary,
    providerReadiness,
  });

  const latestRunEvents = latestRunSession
    ? (runEventsBySessionId.get(latestRunSession.id) ?? [])
    : [];
  const mobileProject = toMobileProject(project, id);
  const allProjects = mapProjectList(allProjectRows) as Project[];
  const mobileProjects = allProjects.map((item) => toMobileProject(item, id));
  const mobileLatestRunSession = latestRunSession
    ? toMobileRunSession(latestRunSession)
    : null;
  const mobileRunEvents = latestRunEvents.map(toMobileRunEvent);
  const mobileConversation = buildMobileConversation({
    tasks: recentTasks,
    promptsById,
    taskEventsByTaskId,
    runSessions: recentRunSessions,
    runEventsBySessionId,
    projectId: id,
  });

  return (
    <>
      <MobileShell
        project={mobileProject}
        projects={mobileProjects}
        profile={{
          email: user.email ?? "",
          displayName: displayName ?? null,
        }}
        conversation={mobileConversation}
        filesCount={count}
        latestRunSession={mobileLatestRunSession}
        runEvents={mobileRunEvents}
        nextAction={nextAction}
        activeProvider={activeProvider}
        providerReadiness={providerReadiness}
        taskInFlight={taskInFlight}
      />
      <TaskPoller active={taskInFlight} />
      <RunPoller active={runInFlight} />
    </>
  );
}

function toMobileProject(
  project: Project,
  currentProjectId: string,
): MobileProject {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    status: project.status,
    updatedLabel: `Updated ${formatRelative(project.updated_at)}`,
    lastOpenedLabel: project.last_opened_at
      ? `Opened ${formatRelative(project.last_opened_at)}`
      : null,
    current: project.id === currentProjectId,
  };
}

function toMobileRunSession(session: LatestRunSession): MobileRunSession {
  return {
    id: session.id,
    status: session.status,
    previewUrl: session.preview_url ?? null,
    error: session.error ?? null,
    createdLabel: formatRelative(session.created_at),
    startedLabel: session.started_at
      ? formatRelative(session.started_at)
      : null,
    stoppedLabel: session.stopped_at
      ? formatRelative(session.stopped_at)
      : null,
  };
}

function toMobileRunEvent(event: RunEventRow): MobileRunEvent {
  return {
    id: event.id,
    level: event.level,
    source: event.source,
    message: event.message,
    createdLabel: formatRelative(event.created_at),
  };
}

function buildMobileConversation({
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
}): MobileConversationEntry[] {
  const rows: MobileConversationEntry[] = [];
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

  for (const entry of entries) {
    if (entry.kind === "run") {
      const events = runEventsBySessionId.get(entry.session.id) ?? [];
      const highlight = runEventHighlight(entry.session, events);
      rows.push({
        id: `run-${entry.session.id}`,
        role: "assistant",
        createdAt: entry.createdAt,
        body: runStatusMessage(entry.session),
        badges: ["Preview", runStatusLabel(entry.session.status)],
        status: entry.session.status,
        href: {
          label: entry.session.status === "error" ? "Console" : "Preview",
          url:
            entry.session.status === "error"
              ? `/projects/${projectId}/logs`
              : `/projects/${projectId}/run`,
        },
        facts: [
          {
            label: "State",
            value:
              "u did dat checked the saved app and opened preview when supported.",
          },
          ...(highlight
            ? [
                {
                  label: "Console",
                  value: highlight.message,
                  tone:
                    highlight.level === "error"
                      ? ("destructive" as const)
                      : ("default" as const),
                },
              ]
            : []),
          ...(entry.session.status === "error" && entry.session.error
            ? [
                {
                  label: "Failure",
                  value: entry.session.error,
                  tone: "destructive" as const,
                },
              ]
            : []),
        ],
      });
      continue;
    }

    const taskEvents = taskEventsByTaskId.get(entry.task.id) ?? [];
    const prompt = promptForTask(entry.task, promptsById);
    if (prompt) {
      rows.push({
        id: `prompt-${entry.task.id}`,
        role: "user",
        createdAt: entry.createdAt,
        body: prompt,
      });
    }

    const output = entry.task.output as AITaskResult | null;
    const operation = generationOperation(entry.task.kind, entry.task.input);
    const repairMetadata = getRepairMetadata(entry.task.input);
    const validation = extractValidationSummary(taskEvents);
    const latestProgress = latestEventByKind(taskEvents, "progress");
    const firstBlockingIssue = taskEvents.find(
      (event) =>
        event.kind === "validation" && event.payload.severity === "blocking",
    );
    const completedEvent = latestEventByKind(taskEvents, "completed");
    const completedFileCount =
      completedEvent?.payload.file_count ?? output?.files.length ?? 0;
    const canRepair =
      entry.task.status === "failed" &&
      hasBlockingValidationEvidence(taskEvents);

    rows.push({
      id: `task-${entry.task.id}`,
      role: "assistant",
      createdAt: entry.createdAt,
      body: taskStatusMessage(entry.task, output, operation),
      badges: [operation.badge, taskStatusLabel(entry.task.status)],
      status: entry.task.status,
      taskId: entry.task.id,
      canRepair,
      canRetry:
        (entry.task.status === "failed" || entry.task.status === "cancelled") &&
        !canRepair,
      href:
        entry.task.status === "completed"
          ? {
              label: "View code",
              url: `/projects/${projectId}/files`,
            }
          : undefined,
      facts: [
        { label: "Operation", value: operation.description },
        ...(repairMetadata
          ? [
              {
                label: "Repair source",
                value: `Uses recorded issues from failed run ${shortTaskId(repairMetadata.source_task_id)}.`,
              },
            ]
          : []),
        ...(entry.task.status === "running" && latestProgress?.payload.message
          ? [{ label: "Progress", value: latestProgress.payload.message }]
          : []),
        ...(output && entry.task.status === "completed"
          ? [
              {
                label: "Saved files",
                value: `Saved ${completedFileCount} file${completedFileCount === 1 ? "" : "s"}. ${output.summary}`,
                tone: "success" as const,
              },
            ]
          : []),
        ...(output && entry.task.status === "failed"
          ? [
              {
                label: "Not saved",
                value: `The draft produced ${output.files.length} file${output.files.length === 1 ? "" : "s"}, but the run failed before updating the project.`,
              },
            ]
          : []),
        ...(validation
          ? [
              {
                label: "Check",
                value: validationFact(validation),
                tone:
                  validation.blocking_count > 0
                    ? ("destructive" as const)
                    : ("default" as const),
              },
            ]
          : []),
        ...(firstBlockingIssue
          ? [
              {
                label: "Blocking issue",
                value: formatValidationIssue(firstBlockingIssue.payload),
                tone: "destructive" as const,
              },
            ]
          : []),
        ...(entry.task.status === "failed" && entry.task.error
          ? [
              {
                label: "Failure",
                value: entry.task.error,
                tone: "destructive" as const,
              },
            ]
          : []),
      ],
    });
  }

  return rows;
}

function validationFact(summary: ValidationSummary): string {
  const counts = [
    `${summary.blocking_count} blocking`,
    `${summary.warning_count} warning${summary.warning_count === 1 ? "" : "s"}`,
    `${summary.info_count} info`,
  ].join(", ");
  return summary.message ? `${summary.message} (${counts})` : counts;
}

function taskStatusLabel(status: LatestTask["status"]): string {
  const labels: Record<LatestTask["status"], string> = {
    pending: "queued",
    running: "generating",
    completed: "validated and saved",
    failed: "failed",
    cancelled: "cancelled",
  };
  return labels[status];
}

function runStatusLabel(status: LatestRunSession["status"]): string {
  const labels: Record<LatestRunSession["status"], string> = {
    idle: "idle",
    starting: "starting",
    running: "running",
    stopping: "stopping",
    stopped: "stopped",
    error: "failed",
  };
  return labels[status];
}

type GenerationOperation = {
  badge: string;
  sentenceName: string;
  description: string;
  runningMessage: string;
  contextMessage: string;
};

function generationOperation(
  kind: AITaskKind,
  input?: Record<string, unknown> | null,
): GenerationOperation {
  if (getRepairMetadata(input)) {
    return {
      badge: "Repair",
      sentenceName: "Repair",
      description:
        "Repair · u did dat uses the recorded issues to draft corrected files.",
      runningMessage:
        "u did dat is repairing the draft. Files update only if checks pass.",
      contextMessage: "u did dat is repairing the draft from recorded issues.",
    };
  }

  if (kind === "scaffold") {
    return {
      badge: "Build",
      sentenceName: "Build",
      description: "Build · u did dat is creating a fresh app from your prompt.",
      runningMessage:
        "u did dat is building a fresh app. Files update only if checks pass.",
      contextMessage: "u did dat is drafting a fresh app from your prompt.",
    };
  }

  if (kind === "refactor") {
    return {
      badge: "Refactor",
      sentenceName: "Refactor",
      description: "Refactor · u did dat is reshaping the current app.",
      runningMessage:
        "u did dat is refactoring the app. Files update only if checks pass.",
      contextMessage: "u did dat is drafting a refactor for the current app.",
    };
  }

  if (kind === "explain") {
    return {
      badge: "Explain",
      sentenceName: "Explanation",
      description: "Explain · u did dat is answering a question about the app.",
      runningMessage: "u did dat is preparing an explanation.",
      contextMessage: "u did dat is preparing an explanation.",
    };
  }

  if (kind === "other") {
    return {
      badge: "Build",
      sentenceName: "Generation",
      description: "Build · u did dat is drafting the requested change.",
      runningMessage:
        "u did dat is drafting the change. Files update only if checks pass.",
      contextMessage: "u did dat is drafting the requested change.",
    };
  }

  return {
    badge: "Edit",
    sentenceName: "Edit",
    description: "Edit · u did dat is changing the current app.",
    runningMessage: "u did dat is editing the app. Files update only if checks pass.",
    contextMessage: "u did dat is drafting changes for the current app.",
  };
}

function taskStatusMessage(
  task: LatestTask,
  output: AITaskResult | null,
  operation: GenerationOperation,
): string {
  if (task.status === "pending") {
    return `${operation.sentenceName} queued.`;
  }

  if (task.status === "running") {
    return operation.runningMessage;
  }

  if (task.status === "completed") {
    const fileCount = output?.files.length ?? 0;
    if (fileCount === 0) {
      return `${operation.sentenceName} finished.`;
    }
    return `${operation.sentenceName} finished: ${fileCount} file${
      fileCount === 1 ? " is" : "s are"
    } ready.`;
  }

  if (task.status === "failed") {
    return output
      ? `${operation.sentenceName} failed before the project was updated.`
      : `${operation.sentenceName} failed before a draft was recorded.`;
  }

  return `${operation.sentenceName} was cancelled.`;
}

function runStatusMessage(session: LatestRunSession): string {
  if (session.status === "starting") {
    return "Preview is starting.";
  }

  if (session.status === "running") {
    return session.preview_url
      ? "Preview is running."
      : "Preview needs attention; no preview URL was recorded.";
  }

  if (session.status === "stopping") {
    return "Preview is stopping.";
  }

  if (session.status === "stopped") {
    return "Preview stopped.";
  }

  if (session.status === "error") {
    return "Preview could not start.";
  }

  return "Preview will appear here.";
}

function promptForTask(
  task: LatestTask,
  promptsById: Map<string, string>,
): string | null {
  const repairDisplayPrompt = getRepairDisplayPrompt(task.input);
  if (repairDisplayPrompt) return repairDisplayPrompt;

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
        /Local preview ready|Validation passed|Parsed cleanly/i.test(
          event.message,
        ),
      ) ?? events[events.length - 1]
    );
  }

  return events[events.length - 1];
}

function summarizeRuntimeEvents(events: RunEventRow[]): RuntimeSummary {
  return {
    hasCleanValidationEvent: events.some(
      (event) =>
        event.level !== "error" &&
        /Validation passed|Build succeeded|Validation complete/i.test(
          event.message,
        ),
    ),
    hasLivePreviewEvent: events.some(
      (event) =>
        event.level !== "error" && /Local preview ready/i.test(event.message),
    ),
    latestErrorMessage:
      latestRunEventMatching(events, (event) => event.level === "error")
        ?.message ?? null,
  };
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

function hasBlockingValidationEvidence(events: AITaskEventRow[]): boolean {
  return events.some(
    (event) =>
      event.kind === "validation" && event.payload.severity === "blocking",
  );
}

function shortTaskId(taskId: string): string {
  return taskId.slice(0, 8);
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
