import { notFound } from "next/navigation"
import { Terminal } from "lucide-react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { WorkspaceContainer, SectionHeading } from "@/components/workspace/workspace-container"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

const LEVEL_TONE: Record<string, string> = {
  info: "text-muted-foreground",
  warn: "text-foreground",
  error: "text-destructive",
  system: "text-accent",
}

export default async function LogsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Resolve user up-front so the query can belt-and-braces the RLS check
  // with an explicit owner filter. The (app) layout already redirects
  // unauthenticated users, so notFound() here is purely defensive.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data } = await supabase
    .from("run_events")
    .select("id, level, source, message, created_at")
    .eq("project_id", id)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200)

  const events = (data ?? []).slice().reverse()

  return (
    <WorkspaceContainer>
      <SectionHeading
        title="Logs"
        description="Build and runtime output from past and current run sessions."
      />

      {events.length === 0 ? (
        <Empty className="border border-dashed border-border bg-card/40">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Terminal className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>No logs yet</EmptyTitle>
            <EmptyDescription>
              Logs appear here as soon as you start a run. The runtime validates your generated
              files and reports build output in real time.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-[oklch(0.13_0_0)]">
          <pre className="max-h-[60vh] overflow-auto p-4 font-mono text-[12px] leading-relaxed">
            {events.map((e) => (
              <div key={e.id} className="flex gap-3">
                <span className="shrink-0 text-muted-foreground/70">
                  {new Date(e.created_at).toLocaleTimeString()}
                </span>
                <span
                  className={cn(
                    "shrink-0 uppercase tracking-wider",
                    LEVEL_TONE[e.level] ?? "text-muted-foreground",
                  )}
                >
                  {e.level}
                </span>
                <span className="shrink-0 text-muted-foreground">[{e.source}]</span>
                <span className="whitespace-pre-wrap break-all">{e.message}</span>
              </div>
            ))}
          </pre>
        </div>
      )}
    </WorkspaceContainer>
  )
}
