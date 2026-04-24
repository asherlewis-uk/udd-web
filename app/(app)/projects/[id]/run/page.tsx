import { notFound } from "next/navigation"
import { WorkspaceContainer, SectionHeading } from "@/components/workspace/workspace-container"
import { RunControls } from "@/components/run/run-controls"
import { RunStatusBadge } from "@/components/run/run-status-badge"
import { RunPoller } from "@/components/run/run-poller"
import { LogStream } from "@/components/run/log-stream"
import { PreviewPanel } from "@/components/run/preview-panel"
import { SessionsHistory } from "@/components/run/sessions-history"
import { createClient } from "@/lib/supabase/server"
import { reapStaleSessions } from "@/lib/runtime/service"
import type { RunStatus } from "@/lib/types"

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", id)
    .maybeSingle()
  if (!project) notFound()

  // Get user for reaper call
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Opportunistically mark any long-stalled sessions as error before loading
  // the list. This keeps the UI honest without requiring a background job.
  if (user) {
    await reapStaleSessions(id, user.id)
  }

  const { data: sessionsData } = await supabase
    .from("run_sessions")
    .select("id, status, preview_url, started_at, stopped_at, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(20)

  const sessions = (sessionsData ?? []) as Array<{
    id: string
    status: RunStatus
    preview_url: string | null
    started_at: string | null
    stopped_at: string | null
    created_at: string
  }>

  const current = sessions[0] ?? null
  const status: RunStatus = current?.status ?? "idle"

  // Events for the current session (not the whole project) so the log panel
  // tracks this run specifically.
  const { data: eventsData } = current
    ? await supabase
        .from("run_events")
        .select("id, level, source, message, created_at")
        .eq("session_id", current.id)
        .order("created_at", { ascending: true })
        .limit(300)
    : { data: [] as never[] }

  const events = (eventsData ?? []) as Array<{
    id: string
    level: string
    source: string
    message: string
    created_at: string
  }>

  const inFlight =
    status === "starting" || status === "running" || status === "stopping"

  return (
    <WorkspaceContainer>
      <div className="flex items-start justify-between gap-4">
        <SectionHeading
          title="Run"
          description="Boot a sandboxed runtime and watch the build stream in."
        />
        <div className="flex items-center gap-3 pt-1">
          <RunStatusBadge status={status} />
          <RunControls projectId={id} sessionId={current?.id ?? null} status={status} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <PreviewPanel
            status={status}
            url={current?.preview_url ?? null}
            projectName={project.name as string}
          />
        </div>
        <div className="lg:col-span-2">
          <LogStream
            events={events}
            emptyLabel={
              current
                ? "Warming up..."
                : "No run yet. Press Start Run to boot a sandbox."
            }
          />
        </div>
      </div>

      {sessions.length > 1 ? (
        <section className="flex flex-col gap-2">
          <span className="px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Recent sessions
          </span>
          <SessionsHistory sessions={sessions.slice(1)} />
        </section>
      ) : null}

      <RunPoller active={inFlight} />
    </WorkspaceContainer>
  )
}
