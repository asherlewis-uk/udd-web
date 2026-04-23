import { cn } from "@/lib/utils"
import type { ProjectStatus } from "@/lib/types"

const TONE: Record<ProjectStatus, string> = {
  draft: "border-border bg-card text-muted-foreground",
  active: "border-accent/40 bg-accent/10 text-accent",
  archived: "border-border bg-secondary text-muted-foreground",
  error: "border-destructive/40 bg-destructive/10 text-destructive",
}

const LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
  error: "Error",
}

export function StatusPill({
  status,
  className,
}: {
  status: ProjectStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONE[status],
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "active" && "bg-accent",
          status === "draft" && "bg-muted-foreground",
          status === "archived" && "bg-muted-foreground/60",
          status === "error" && "bg-destructive",
        )}
        aria-hidden
      />
      {LABEL[status]}
    </span>
  )
}
