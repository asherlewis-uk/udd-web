import { cn } from "@/lib/utils"
import type { RunStatus } from "@/lib/types"

const TONE: Record<RunStatus, string> = {
  idle: "border-border bg-card text-muted-foreground",
  starting: "border-border bg-card text-foreground",
  running: "border-accent/40 bg-accent/10 text-accent",
  stopping: "border-border bg-card text-foreground",
  stopped: "border-border bg-secondary text-muted-foreground",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
}

const LABEL: Record<RunStatus, string> = {
  idle: "Idle",
  starting: "Starting",
  running: "Running",
  stopping: "Stopping",
  stopped: "Stopped",
  error: "Error",
}

export function RunStatusBadge({
  status,
  className,
}: {
  status: RunStatus
  className?: string
}) {
  const pulsing = status === "starting" || status === "running" || status === "stopping"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider",
        TONE[status],
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "running" && "animate-pulse bg-accent",
          status === "starting" && "animate-pulse bg-foreground/70",
          status === "stopping" && "animate-pulse bg-foreground/70",
          status === "idle" && "bg-muted-foreground",
          status === "stopped" && "bg-muted-foreground/60",
          status === "error" && "bg-destructive",
          pulsing && "",
        )}
        aria-hidden
      />
      {LABEL[status]}
    </span>
  )
}
