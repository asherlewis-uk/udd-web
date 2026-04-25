import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock,
  FolderTree,
  Play,
  Settings2,
  ShieldCheck,
  Terminal,
  TriangleAlert,
} from "lucide-react"
import { WorkspaceContainer } from "@/components/workspace/workspace-container"
import { AIStatusBadge } from "@/components/ai/ai-status-badge"
import { TaskPoller } from "@/components/ai/task-poller"
import { RunPoller } from "@/components/run/run-poller"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { formatRelative } from "@/lib/slug"
import { cn } from "@/lib/utils"
import { deriveNextAction } from "@/lib/workspace/next-action"
import type { Project, RunStatus } from "@/lib/types"
import type { AITaskEventPayload } from "@/lib/ai/types"
import type { AITask, NextAction, RunSession, ValidationSummary } from "@/lib/workspace/next-action"

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const [
    { data: projectData },
    { data: taskData },
    { count: filesCount, data: filesData },
    { data: latestRunData },
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("ai_tasks")
      .select("id, title, kind, status, created_at, finished_at, error")
      .eq("project_id", id)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("project_files")
      .select("updated_at", { count: "exact" })
      .eq("project_id", id)
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1),
    supabase
      .from("run_sessions")
      .select("id, status, started_at")
      .eq("project_id", id)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!projectData) notFound()

  const project = projectData as Project
  const latestTask = taskData as AITask | null
  const latestRunSession = latestRunData as RunSession | null
  const latestFileUpdated =
    (filesData?.[0] as { updated_at: string } | undefined)?.updated_at ?? null

  // Fetch the validation summary event for the latest task (first validation
  // event, which is always the aggregate summary — see lib/ai/service.ts
  // writeValidationEvents: summary is written before individual issue events).
  let validationSummary: ValidationSummary | null = null
  if (latestTask) {
    const { data: valEvent } = await supabase
      .from("ai_task_events")
      .select("payload")
      .eq("task_id", latestTask.id)
      .eq("owner_id", user.id)
      .eq("kind", "validation")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()

    if (valEvent) {
      const p = valEvent.payload as AITaskEventPayload
      if (p.step === "summary") {
        validationSummary = {
          message: p.message ?? "",
          blocking_count: p.blocking_count ?? 0,
          warning_count: p.warning_count ?? 0,
          info_count: p.info_count ?? 0,
        }
      }
    }
  }

  const count = filesCount ?? 0
  const taskInFlight = latestTask?.status === "pending" || latestTask?.status === "running"
  const runInFlight =
    latestRunSession?.status === "starting" ||
    latestRunSession?.status === "running" ||
    latestRunSession?.status === "stopping"

  const nextAction = deriveNextAction({
    project,
    latestTask,
    validationSummary,
    projectFilesCount: count,
    latestRunSession,
  })

  return (
    <WorkspaceContainer>
      <IntentPanel project={project} projectId={id} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <AgentStatePanel latestTask={latestTask} validationSummary={validationSummary} projectId={id} />
          <ProofPanel filesCount={count} latestFileUpdated={latestFileUpdated} latestRunSession={latestRunSession} projectId={id} />
        </div>
        <NextActionPanel action={nextAction} />
      </div>

      <DetailLinks projectId={id} filesCount={count} latestTask={latestTask} latestRunSession={latestRunSession} />

      <TaskPoller active={taskInFlight} />
      <RunPoller active={runInFlight} />
    </WorkspaceContainer>
  )
}

// ---------------------------------------------------------------------------
// Intent panel
// ---------------------------------------------------------------------------

function IntentPanel({ project, projectId }: { project: Project; projectId: string }) {
  const intent = project.idea || project.description
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
              <p className="text-sm text-muted-foreground">No intent recorded yet.</p>
              <Link
                href={`/projects/${projectId}/settings`}
                className="text-xs text-accent transition hover:underline"
              >
                Add a description in Settings →
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
  )
}

// ---------------------------------------------------------------------------
// Agent state panel
// ---------------------------------------------------------------------------

function AgentStatePanel({
  latestTask,
  validationSummary,
  projectId,
}: {
  latestTask: AITask | null
  validationSummary: ValidationSummary | null
  projectId: string
}) {
  if (!latestTask) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Agent state
        </span>
        <p className="mt-3 text-sm text-muted-foreground">
          No tasks yet. Submit a prompt above to start generating files.
        </p>
      </div>
    )
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
        <p className="text-sm font-medium text-foreground">{latestTask.title}</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-wider">{latestTask.kind}</span>
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
          View full task detail →
        </Link>
      </div>
    </div>
  )
}

function ValidationSummaryRow({ summary }: { summary: ValidationSummary }) {
  if (summary.blocking_count === 0 && summary.warning_count === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-accent">
        <ShieldCheck className="h-3.5 w-3.5" />
        No blocking issues — validation passed
      </span>
    )
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
          {summary.warning_count} warning{summary.warning_count === 1 ? "" : "s"}
        </span>
      ) : null}
      {summary.info_count > 0 ? (
        <span className="text-muted-foreground">{summary.info_count} info</span>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Proof panel
// ---------------------------------------------------------------------------

function ProofPanel({
  filesCount,
  latestFileUpdated,
  latestRunSession,
  projectId,
}: {
  filesCount: number
  latestFileUpdated: string | null
  latestRunSession: RunSession | null
  projectId: string
}) {
  const RUN_LABELS: Partial<Record<RunStatus, string>> = {
    starting: "Validating…",
    running: "Files validated",
    stopping: "Stopping…",
    stopped: "Stopped",
    error: "Parse errors found",
  }

  const runLabel = latestRunSession
    ? (RUN_LABELS[latestRunSession.status] ?? latestRunSession.status)
    : "No validation run yet"
  const runClass =
    latestRunSession?.status === "running"
      ? "text-accent"
      : latestRunSession?.status === "error"
        ? "text-destructive"
        : "text-foreground"

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Proof
      </span>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Files persisted</dt>
          <dd className={cn("tabular-nums", filesCount > 0 ? "font-semibold" : "text-muted-foreground")}>
            {filesCount > 0 ? filesCount : "None"}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Last file update</dt>
          <dd className="text-foreground">{formatRelative(latestFileUpdated)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Validation run</dt>
          <dd className={cn("text-sm", runClass)}>{runLabel}</dd>
        </div>
      </dl>
      <p className="mt-4 text-[11px] text-muted-foreground">
        No live preview or serving — this system performs static validation only.
      </p>
      <div className="mt-3 flex flex-wrap gap-4">
        <Link
          href={`/projects/${projectId}/files`}
          className="text-xs text-muted-foreground transition hover:text-foreground"
        >
          Browse files →
        </Link>
        <Link
          href={`/projects/${projectId}/run`}
          className="text-xs text-muted-foreground transition hover:text-foreground"
        >
          View validation run →
        </Link>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Next action panel
// Rendering concerns (icon, button variant) are derived from NextAction.state.
// All decision logic lives in lib/workspace/next-action.ts.
// ---------------------------------------------------------------------------

const STATE_DISPLAY: Record<
  NextAction["state"],
  {
    variant: "default" | "secondary" | "outline"
    Icon: React.ComponentType<{ className?: string }>
  }
> = {
  idle: { variant: "default", Icon: Bot },
  in_progress: { variant: "secondary", Icon: Clock },
  blocked: { variant: "default", Icon: CircleAlert },
  ready: { variant: "default", Icon: CheckCircle2 },
}

function NextActionPanel({ action }: { action: NextAction }) {
  const { variant, Icon } = STATE_DISPLAY[action.state]
  return (
    <div className="flex flex-col justify-between gap-6 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-3">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Recommended action
        </span>
        <Icon className="h-5 w-5 text-muted-foreground" />
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground">{action.label}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{action.description}</p>
        </div>
      </div>
      <Button asChild variant={variant} size="sm" className="w-full">
        <Link href={action.cta.href}>{action.cta.label}</Link>
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail links
// ---------------------------------------------------------------------------

function DetailLinks({
  projectId,
  filesCount,
  latestTask,
  latestRunSession,
}: {
  projectId: string
  filesCount: number
  latestTask: AITask | null
  latestRunSession: RunSession | null
}) {
  const links = [
    {
      href: `/projects/${projectId}/ai`,
      Icon: Bot,
      label: "AI",
      meta: latestTask ? `Last task: ${latestTask.status}` : "No tasks yet",
    },
    {
      href: `/projects/${projectId}/files`,
      Icon: FolderTree,
      label: "Files",
      meta:
        filesCount > 0
          ? `${filesCount} file${filesCount === 1 ? "" : "s"} persisted`
          : "No files yet",
    },
    {
      href: `/projects/${projectId}/run`,
      Icon: Play,
      label: "Run",
      meta: latestRunSession
        ? `Last run: ${latestRunSession.status}`
        : "Validation-only — no runs yet",
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
  ]

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
  )
}
