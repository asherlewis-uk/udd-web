import Link from "next/link"
import { CheckCircle2, Circle, CircleAlert, CircleDot, ExternalLink, Loader2, Play, RotateCw } from "lucide-react"
import { AIStatusBadge } from "@/components/ai/ai-status-badge"
import { Button } from "@/components/ui/button"
import { formatRelative } from "@/lib/slug"
import { cn } from "@/lib/utils"
import type { AITaskEventRow, AITaskResult, AITaskRow } from "@/lib/ai/types"
import { retryPendingTask } from "@/app/actions/ai"
import { startRunFromTaskAction } from "@/app/actions/run"

type EventLike = Pick<AITaskEventRow, "id" | "kind" | "payload" | "created_at">

export function TaskDetail({
  task,
  events,
  prompt,
  projectId,
}: {
  task: AITaskRow
  events: EventLike[]
  prompt: string | null
  projectId: string
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{task.title}</h3>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono uppercase tracking-wider">{task.kind}</span>
            <span aria-hidden>&middot;</span>
            <span>Created {formatRelative(task.created_at)}</span>
            {task.finished_at ? (
              <>
                <span aria-hidden>&middot;</span>
                <span>Finished {formatRelative(task.finished_at)}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AIStatusBadge status={task.status} />
          <RetryPendingControl task={task} projectId={projectId} />
          <RunFromTaskControl task={task} projectId={projectId} />
        </div>
      </header>

      <div className="flex flex-col divide-y divide-border">
        <PromptBlock prompt={prompt} />
        <EventsBlock events={events} />
        <ResultBlock task={task} />
      </div>
    </section>
  )
}

function PromptBlock({ prompt }: { prompt: string | null }) {
  return (
    <div className="flex flex-col gap-2 px-5 py-4">
      <SectionLabel>Prompt</SectionLabel>
      {prompt ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{prompt}</p>
      ) : (
        <p className="text-sm text-muted-foreground">No prompt recorded.</p>
      )}
    </div>
  )
}

function EventsBlock({ events }: { events: EventLike[] }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <SectionLabel>Events</SectionLabel>
      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground">No events recorded yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5 text-xs">
              <EventIcon kind={e.kind} />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono uppercase tracking-wider text-foreground">
                    {e.kind}
                  </span>
                  <span className="text-muted-foreground">{formatRelative(e.created_at)}</span>
                </div>
                <EventPayload kind={e.kind} payload={e.payload} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function EventIcon({ kind }: { kind: AITaskEventRow["kind"] }) {
  const base = "mt-0.5 h-3.5 w-3.5 flex-none"
  if (kind === "started") return <CircleDot className={cn(base, "text-muted-foreground")} />
  if (kind === "progress") return <Loader2 className={cn(base, "text-accent")} />
  if (kind === "completed") return <CheckCircle2 className={cn(base, "text-accent")} />
  if (kind === "failed") return <CircleAlert className={cn(base, "text-destructive")} />
  return <Circle className={cn(base, "text-muted-foreground")} />
}

function EventPayload({
  kind,
  payload,
}: {
  kind: AITaskEventRow["kind"]
  payload: AITaskEventRow["payload"]
}) {
  const parts: string[] = []
  if (payload.step) parts.push(payload.step)
  if (payload.message) parts.push(payload.message)
  if (kind === "completed" && payload.summary) parts.push(payload.summary)
  if (kind === "failed" && payload.error) parts.push(payload.error)
  if (parts.length === 0) return null
  return <span className="text-muted-foreground">{parts.join(" — ")}</span>
}

function ResultBlock({ task }: { task: AITaskRow }) {
  const output = task.output as AITaskResult | null

  if (task.status === "failed") {
    return (
      <div className="flex flex-col gap-2 px-5 py-4">
        <SectionLabel>Result</SectionLabel>
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {task.error ?? "Task failed."}
        </div>
      </div>
    )
  }

  if (!output) {
    return (
      <div className="flex flex-col gap-2 px-5 py-4">
        <SectionLabel>Result</SectionLabel>
        <p className="text-xs text-muted-foreground">
          {task.status === "running"
            ? "Generating output…"
            : task.status === "pending"
              ? "Waiting to start."
              : "No output produced."}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <div className="flex flex-col gap-1.5">
        <SectionLabel>Summary</SectionLabel>
        <p className="text-sm text-foreground">{output.summary}</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <SectionLabel>
          Files <span className="font-mono text-muted-foreground">({output.files.length})</span>
        </SectionLabel>
        <div className="flex flex-col gap-3">
          {output.files.map((f) => (
            <CodeBlock
              key={f.path}
              path={f.path}
              language={f.language ?? "text"}
              content={f.content}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function CodeBlock({
  path,
  language,
  content,
}: {
  path: string
  language: string
  content: string
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-3 py-2">
        <span className="truncate font-mono text-xs text-foreground">{path}</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {language}
        </span>
      </div>
      <pre className="overflow-x-auto px-3 py-3 font-mono text-xs leading-relaxed text-foreground">
        <code>{content}</code>
      </pre>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  )
}

function RetryPendingControl({ task, projectId }: { task: AITaskRow; projectId: string }) {
  if (task.status !== "pending") return null

  return (
    <form action={retryPendingTask}>
      <input type="hidden" name="task_id" value={task.id} />
      <input type="hidden" name="project_id" value={projectId} />
      <Button size="sm" variant="secondary" type="submit">
        <RotateCw className="mr-1.5 h-3.5 w-3.5" />
        Retry
      </Button>
    </form>
  )
}

function RunFromTaskControl({ task, projectId }: { task: AITaskRow; projectId: string }) {
  if (task.status !== "completed") return null

  if (task.run_session_id) {
    return (
      <Button asChild size="sm" variant="secondary">
        <Link href={`/projects/${projectId}/run`}>
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          View run
        </Link>
      </Button>
    )
  }

  return (
    <form action={startRunFromTaskAction}>
      <input type="hidden" name="task_id" value={task.id} />
      <Button size="sm" type="submit">
        <Play className="mr-1.5 h-3.5 w-3.5" />
        Run this result
      </Button>
    </form>
  )
}
