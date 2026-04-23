import { Bot } from "lucide-react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { WorkspaceContainer, SectionHeading } from "@/components/workspace/workspace-container"
import { createClient } from "@/lib/supabase/server"
import { formatRelative } from "@/lib/slug"
import { cn } from "@/lib/utils"
import type { AiTaskStatus } from "@/lib/types"

const STATUS_TONE: Record<AiTaskStatus, string> = {
  pending: "text-muted-foreground",
  running: "text-accent",
  completed: "text-foreground",
  failed: "text-destructive",
  cancelled: "text-muted-foreground",
}

export default async function AiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from("ai_tasks")
    .select("id, title, kind, status, created_at, finished_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(50)

  const tasks = data ?? []

  return (
    <WorkspaceContainer>
      <SectionHeading
        title="AI"
        description="Scaffolds, edits and refactors issued against this project."
      />

      {tasks.length === 0 ? (
        <Empty className="border border-dashed border-border bg-card/40">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bot className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>No AI tasks yet</EmptyTitle>
            <EmptyDescription>
              AI orchestration is not wired up in this phase. When it is, every task and its
              streamed events will show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-4 bg-background px-4 py-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{t.title}</div>
                <div className="text-xs text-muted-foreground">
                  {t.kind} &middot; {formatRelative(t.created_at)}
                </div>
              </div>
              <span
                className={cn(
                  "font-mono text-xs uppercase tracking-wider",
                  STATUS_TONE[t.status as AiTaskStatus],
                )}
              >
                {t.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WorkspaceContainer>
  )
}
