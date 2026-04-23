import Link from "next/link"
import { cn } from "@/lib/utils"
import { formatRelative } from "@/lib/slug"
import { AIStatusBadge } from "@/components/ai/ai-status-badge"
import type { AITaskListItem } from "@/lib/ai/types"

export function TaskList({
  tasks,
  projectId,
  selectedId,
}: {
  tasks: AITaskListItem[]
  projectId: string
  selectedId: string | null
}) {
  if (tasks.length === 0) {
    return (
      <div className="flex h-full min-h-40 items-center justify-center rounded-lg border border-dashed border-border bg-card/40 p-6 text-center text-xs text-muted-foreground">
        No tasks yet. Submit a prompt above to start one.
      </div>
    )
  }

  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {tasks.map((t) => {
        const isSelected = t.id === selectedId
        return (
          <li key={t.id}>
            <Link
              href={`/projects/${projectId}/ai?task=${t.id}`}
              scroll={false}
              className={cn(
                "flex flex-col gap-1.5 px-3 py-2.5 text-sm transition",
                isSelected
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-foreground">{t.title}</span>
                <AIStatusBadge status={t.status} />
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="font-mono uppercase tracking-wider opacity-70">{t.kind}</span>
                <span aria-hidden>&middot;</span>
                <span>{formatRelative(t.created_at)}</span>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
