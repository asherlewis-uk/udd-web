import type { ComponentType, ReactNode } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock,
  FileText,
  FolderTree,
  MessageSquareText,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react"
import { AIPromptForm } from "@/components/ai/ai-prompt-form"
import { TaskPoller } from "@/components/ai/task-poller"
import { RunPoller } from "@/components/run/run-poller"
import { Button } from "@/components/ui/button"
import { WorkspaceContainer } from "@/components/workspace/workspace-container"
import { startRunAction } from "@/app/actions/run"
import { createClient } from "@/lib/supabase/server"
import { formatRelative } from "@/lib/slug"
import { cn } from "@/lib/utils"
import { deriveNextAction } from "@/lib/workspace/next-action"
import type { Project } from "@/lib/types"
import type { AITaskEventPayload } from "@/lib/ai/types"
import type { AITask, NextAction, RunSession, ValidationSummary } from "@/lib/workspace/next-action"

type LatestTask = AITask & {
  input?: unknown
}

type LatestRunSession = RunSession & {
  created_at?: string
  stopped_at?: string | null
}

type SavedFile = {
  id: string
  path: string
  language: string | null
  size_bytes: number
  updated_at: string
}

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
  ])

  if (!projectData) notFound()

  const project = projectData as Project
  const latestTask = taskData as LatestTask | null
  const latestRunSession = latestRunData as LatestRunSession | null
  const savedFiles = (filesData ?? []) as SavedFile[]
  const count = filesCount ?? savedFiles.length

  // Fetch the validation summary event for the latest work item. The first
  // validation event is the aggregate summary; individual issues follow it.
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
    <WorkspaceContainer className="gap-5 lg:py-8">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.85fr)_minmax(19rem,1fr)] lg:items-start">
        <AgentCockpitPanel
          project={project}
          projectId={id}
          latestTask={latestTask}
          latestPrompt={extractPrompt(latestTask)}
          validationSummary={validationSummary}
          nextAction={nextAction}
          latestRunSession={latestRunSession}
        />

        <OutputPanel
          files={savedFiles}
          filesCount={count}
          validationSummary={validationSummary}
          latestRunSession={latestRunSession}
        />
      </div>

      <TaskPoller active={taskInFlight} />
      <RunPoller active={runInFlight} />
    </WorkspaceContainer>
  )
}

function AgentCockpitPanel({
  project,
  projectId,
  latestTask,
  latestPrompt,
  validationSummary,
  nextAction,
  latestRunSession,
}: {
  project: Project
  projectId: string
  latestTask: LatestTask | null
  latestPrompt: string | null
  validationSummary: ValidationSummary | null
  nextAction: NextAction
  latestRunSession: LatestRunSession | null
}) {
  const intent = project.idea || project.description

  return (
    <section className="flex min-h-[40rem] flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="border-b border-border bg-background/40 px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Agent cockpit
            </span>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">
              What should UDD change next?
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              UDD can check files, but does not run or preview the app yet.
            </p>
          </div>
          {latestTask ? <WorkItemStatusBadge status={latestTask.status} /> : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 px-5 py-5">
        {intent ? <IntentNote intent={intent} /> : null}
        {latestPrompt ? <UserPromptMessage prompt={latestPrompt} /> : null}
        <AssistantNextAction
          action={nextAction}
          projectId={projectId}
          latestTask={latestTask}
          validationSummary={validationSummary}
          latestRunSession={latestRunSession}
        />
      </div>

      <div className="border-t border-border bg-background/30 p-5">
        <AIPromptForm projectId={projectId} redirectTo={`/projects/${projectId}`} variant="cockpit" />
      </div>
    </section>
  )
}

function WorkItemStatusBadge({ status }: { status: LatestTask["status"] }) {
  const labels: Record<LatestTask["status"], string> = {
    pending: "queued",
    running: "working",
    completed: "saved",
    failed: "needs revision",
    cancelled: "cancelled",
  }
  const tone =
    status === "completed"
      ? "border-accent/40 bg-accent/10 text-accent"
      : status === "failed"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-border bg-background text-muted-foreground"

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize",
        tone,
      )}
    >
      {labels[status]}
    </span>
  )
}

function IntentNote({ intent }: { intent: string }) {
  return (
    <div className="rounded-md border border-border/70 bg-background/50 px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Current intent
      </div>
      <p className="mt-1 text-sm leading-relaxed text-foreground">{intent}</p>
    </div>
  )
}

function UserPromptMessage({ prompt }: { prompt: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[86%] rounded-lg rounded-tr-sm bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground">
        {prompt}
      </div>
    </div>
  )
}

const ACTION_DISPLAY: Record<
  NextAction["state"],
  {
    Icon: ComponentType<{ className?: string }>
    tone: string
  }
> = {
  idle: { Icon: MessageSquareText, tone: "border-border bg-background/70" },
  in_progress: { Icon: Clock, tone: "border-accent/40 bg-accent/10" },
  blocked: { Icon: CircleAlert, tone: "border-destructive/40 bg-destructive/10" },
  ready: { Icon: CheckCircle2, tone: "border-accent/40 bg-accent/10" },
}

function AssistantNextAction({
  action,
  projectId,
  latestTask,
  validationSummary,
  latestRunSession,
}: {
  action: NextAction
  projectId: string
  latestTask: LatestTask | null
  validationSummary: ValidationSummary | null
  latestRunSession: LatestRunSession | null
}) {
  const { Icon, tone } = ACTION_DISPLAY[action.state]
  const showValidationButton = action.cta.label === "Start validation check"
  const showInspectLink =
    !showValidationButton &&
    action.cta.label !== "Submit a prompt" &&
    action.cta.label !== "Submit new prompt" &&
    action.cta.label !== "Continue building"

  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground">
        <Bot className="h-4 w-4" />
      </div>
      <div className={cn("min-w-0 flex-1 rounded-lg rounded-tl-sm border p-4", tone)}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            UDD
          </span>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <p className="mt-2 text-sm font-medium text-foreground">{action.label}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{action.description}</p>

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

        {latestRunSession?.status === "starting" || latestRunSession?.status === "stopping" ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Validation check started {formatRelative(latestRunSession.started_at)}.
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
  )
}

function ValidationCheckForm({ projectId }: { projectId: string }) {
  return (
    <form action={startRunAction} className="mt-4">
      <input type="hidden" name="project_id" value={projectId} />
      <Button type="submit" size="sm">
        <ShieldCheck className="h-3.5 w-3.5" />
        Start validation check
      </Button>
    </form>
  )
}

function OutputPanel({
  files,
  filesCount,
  validationSummary,
  latestRunSession,
}: {
  files: SavedFile[]
  filesCount: number
  validationSummary: ValidationSummary | null
  latestRunSession: LatestRunSession | null
}) {
  if (latestRunSession?.status === "starting" || latestRunSession?.status === "stopping") {
    return <ValidationStatusOutput session={latestRunSession} />
  }

  if (latestRunSession?.status === "running" || latestRunSession?.status === "error") {
    return <ValidationResultOutput session={latestRunSession} />
  }

  if (filesCount > 0) {
    return <SavedFilesOutput files={files} filesCount={filesCount} />
  }

  if (validationSummary) {
    return <ValidationSummaryOutput summary={validationSummary} />
  }

  return <EmptyOutput />
}

function OutputShell({
  eyebrow,
  title,
  children,
  Icon,
}: {
  eyebrow: string
  title: string
  children: ReactNode
  Icon: ComponentType<{ className?: string }>
}) {
  return (
    <aside className="rounded-lg border border-border bg-card p-4 lg:sticky lg:top-6">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </div>
          <h3 className="mt-1 text-sm font-semibold text-foreground">{title}</h3>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </aside>
  )
}

function ValidationStatusOutput({ session }: { session: LatestRunSession }) {
  const label = session.status === "starting" ? "Checking saved files" : "Finishing check"

  return (
    <OutputShell eyebrow="Validation check" title={label} Icon={Clock}>
      <p className="text-sm leading-relaxed text-muted-foreground">
        UDD is checking file syntax and imports with a parser. UDD can check files, but
        does not run or preview the app yet.
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        Started {formatRelative(session.started_at)}
      </p>
    </OutputShell>
  )
}

function ValidationResultOutput({ session }: { session: LatestRunSession }) {
  const passed = session.status === "running"

  return (
    <OutputShell
      eyebrow="Validation results"
      title={passed ? "Validation check passed" : "Validation check needs attention"}
      Icon={passed ? CheckCircle2 : CircleAlert}
    >
      <p className={cn("text-sm leading-relaxed", passed ? "text-muted-foreground" : "text-destructive")}>
        {passed
          ? "Saved files parsed cleanly in the latest validation check."
          : "The latest validation check found parse errors. Inspect the details, then revise the prompt."}
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        Checked {formatRelative(session.started_at)}
      </p>
    </OutputShell>
  )
}

function SavedFilesOutput({ files, filesCount }: { files: SavedFile[]; filesCount: number }) {
  return (
    <OutputShell eyebrow="Saved files" title={`${filesCount} saved file${filesCount === 1 ? "" : "s"}`} Icon={FolderTree}>
      <div className="flex flex-col divide-y divide-border/70">
        {files.map((file) => (
          <div key={file.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-xs text-foreground">{file.path}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {file.language ?? "file"} · {formatBytes(file.size_bytes)} · Updated{" "}
                {formatRelative(file.updated_at)}
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
    </OutputShell>
  )
}

function ValidationSummaryOutput({ summary }: { summary: ValidationSummary }) {
  return (
    <OutputShell eyebrow="Validation results" title="Latest validation check" Icon={ShieldCheck}>
      <ValidationSummaryInline summary={summary} />
      {summary.message ? (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{summary.message}</p>
      ) : null}
    </OutputShell>
  )
}

function EmptyOutput() {
  return (
    <OutputShell eyebrow="Output" title="Nothing saved yet" Icon={FolderTree}>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Describe a work item in the cockpit. Proof appears here only after UDD has
        saved files or produced validation results.
      </p>
      <p className="mt-3 text-xs text-muted-foreground">
        UDD can check files, but does not run or preview the app yet.
      </p>
    </OutputShell>
  )
}

function ValidationSummaryInline({ summary }: { summary: ValidationSummary }) {
  if (summary.blocking_count === 0 && summary.warning_count === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-accent">
        <ShieldCheck className="h-3.5 w-3.5" />
        No blocking issues
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

function extractPrompt(task: LatestTask | null): string | null {
  if (!task || !task.input || typeof task.input !== "object") return null
  const prompt = (task.input as { prompt?: unknown }).prompt
  return typeof prompt === "string" && prompt.trim() ? prompt : null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
