import { cn } from "@/lib/utils"
import type { AiTaskStatus } from "@/lib/types"

const TONE: Record<AiTaskStatus, string> = {
  pending: "border-border bg-card text-muted-foreground",
  running: "border-accent/40 bg-accent/10 text-accent",
  completed: "border-border bg-secondary text-foreground",
  failed: "border-destructive/40 bg-destructive/10 text-destructive",
  cancelled: "border-border bg-card text-muted-foreground",
}

const LABEL: Record<AiTaskStatus, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
}

export function AIStatusBadge({
  status,
  className,
}: {
  status: AiTaskStatus
  className?: string
}) {
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
          status === "pending" && "bg-muted-foreground",
          status === "completed" && "bg-foreground",
          status === "failed" && "bg-destructive",
          status === "cancelled" && "bg-muted-foreground/60",
        )}
        aria-hidden
      />
      {LABEL[status]}
    </span>
  )
}
