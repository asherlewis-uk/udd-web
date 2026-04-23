import { Activity, Bot, Play } from "lucide-react"
import { formatRelative } from "@/lib/slug"
import { cn } from "@/lib/utils"
import type { AITaskStatus, RunStatus } from "@/lib/types"

export type ProjectActivity = {
  latestTask: {
    title: string
    status: AITaskStatus
    created_at: string
  } | null
  latestRun: {
    status: RunStatus
    created_at: string
  } | null
}

export function ActivitySummary({ activity }: { activity: ProjectActivity }) {
  const { latestTask, latestRun } = activity

  if (!latestTask && !latestRun) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Activity className="h-3 w-3" />
        <span>No activity yet</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      {latestTask ? (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Bot className="h-3 w-3 flex-none" />
          <span
            className={cn(
              "truncate",
              (latestTask.status === "running" || latestTask.status === "pending") && "text-accent",
              latestTask.status === "failed" && "text-destructive",
            )}
          >
            {statusPrefix(latestTask.status)} {latestTask.title}
          </span>
          <span className="ml-auto flex-none text-muted-foreground/80">
            {formatRelative(latestTask.created_at)}
          </span>
        </div>
      ) : null}
      {latestRun ? (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Play className="h-3 w-3 flex-none" />
          <span
            className={cn(
              "truncate",
              (latestRun.status === "running" ||
                latestRun.status === "starting" ||
                latestRun.status === "stopping") &&
                "text-accent",
              latestRun.status === "error" && "text-destructive",
            )}
          >
            Run {runLabel(latestRun.status)}
          </span>
          <span className="ml-auto flex-none text-muted-foreground/80">
            {formatRelative(latestRun.created_at)}
          </span>
        </div>
      ) : null}
    </div>
  )
}

function statusPrefix(status: AITaskStatus): string {
  switch (status) {
    case "pending":
      return "Queued:"
    case "running":
      return "Running:"
    case "completed":
      return "Completed:"
    case "failed":
      return "Failed:"
    case "cancelled":
      return "Cancelled:"
  }
}

function runLabel(status: RunStatus): string {
  switch (status) {
    case "idle":
      return "idle"
    case "starting":
      return "starting"
    case "running":
      return "live"
    case "stopping":
      return "stopping"
    case "stopped":
      return "stopped"
    case "error":
      return "errored"
  }
}
