import { Play } from "lucide-react"
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
import type { RunStatus } from "@/lib/types"

const STATUS_TONE: Record<RunStatus, string> = {
  idle: "text-muted-foreground",
  starting: "text-muted-foreground",
  running: "text-accent",
  stopping: "text-muted-foreground",
  stopped: "text-muted-foreground",
  error: "text-destructive",
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from("run_sessions")
    .select("id, status, preview_url, started_at, stopped_at, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(20)

  const sessions = data ?? []

  return (
    <WorkspaceContainer>
      <SectionHeading
        title="Run"
        description="Preview this project in a sandboxed runtime."
      />

      {sessions.length === 0 ? (
        <Empty className="border border-dashed border-border bg-card/40">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Play className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>No runs yet</EmptyTitle>
            <EmptyDescription>
              Runtime execution isn&apos;t wired up in this phase. When it is, starting a run will
              boot a sandbox and show a live preview here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-4 bg-background px-4 py-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs">{s.id}</div>
                <div className="text-xs text-muted-foreground">
                  Started {formatRelative(s.started_at ?? s.created_at)}
                  {s.stopped_at ? ` · stopped ${formatRelative(s.stopped_at)}` : ""}
                </div>
              </div>
              <span
                className={cn(
                  "font-mono text-xs uppercase tracking-wider",
                  STATUS_TONE[s.status as RunStatus],
                )}
              >
                {s.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WorkspaceContainer>
  )
}
