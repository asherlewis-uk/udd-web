import { createClient } from "@/lib/supabase/server"

/**
 * The only entry point for starting a simulated run.
 *
 * Creates a run_session, then drives it through a deterministic lifecycle
 * (starting → running → ready) while writing run_events along the way.
 * When ready, inserts a previews row with a mock URL.
 *
 * When a real runtime lands, replace the body of `driveSession` with a
 * call into the real sandbox adapter — the schema and surrounding actions
 * don't have to change.
 */
export async function startRun(projectId: string): Promise<string> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  // Confirm the project exists and belongs to the caller (RLS also enforces this).
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, slug, owner_id")
    .eq("id", projectId)
    .single()
  if (projectError || !project) throw new Error("Project not found")

  // Create the session in 'starting'.
  const { data: session, error: sessionError } = await supabase
    .from("run_sessions")
    .insert({
      project_id: projectId,
      owner_id: user.id,
      status: "starting",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single()
  if (sessionError || !session) throw new Error(sessionError?.message ?? "Failed to start run")

  await writeEvent(supabase, {
    session_id: session.id,
    project_id: projectId,
    owner_id: user.id,
    level: "system",
    source: "system",
    message: "Booting sandbox...",
  })

  // Touch project so activity reflects immediately on the list.
  await supabase
    .from("projects")
    .update({ status: "active", last_opened_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("owner_id", user.id)

  return session.id
}

/**
 * Stop a currently-running session. Transitions running → stopping → stopped
 * with a brief delay and a terminal event.
 */
export async function stopRun(sessionId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: session } = await supabase
    .from("run_sessions")
    .select("id, project_id, owner_id, status")
    .eq("id", sessionId)
    .single()
  if (!session) return
  if (!(session.status === "running" || session.status === "starting")) return

  await supabase
    .from("run_sessions")
    .update({ status: "stopping" })
    .eq("id", sessionId)
    .eq("owner_id", user.id)

  await writeEvent(supabase, {
    session_id: sessionId,
    project_id: session.project_id as string,
    owner_id: user.id,
    level: "system",
    source: "system",
    message: "Stopping server...",
  })

  await delay(500)

  await supabase
    .from("run_sessions")
    .update({
      status: "stopped",
      stopped_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("owner_id", user.id)

  await writeEvent(supabase, {
    session_id: sessionId,
    project_id: session.project_id as string,
    owner_id: user.id,
    level: "system",
    source: "system",
    message: "Run stopped.",
  })
}

/**
 * Advance a session through its simulated lifecycle. Scheduled from the
 * server action via `after()` so it runs after the response is flushed.
 * Idempotent: it only runs when the session is still in 'starting'.
 */
export async function driveSession(sessionId: string): Promise<void> {
  const supabase = await createClient()

  const { data: session, error } = await supabase
    .from("run_sessions")
    .select("id, project_id, owner_id, status, projects(slug, name)")
    .eq("id", sessionId)
    .single()
  if (error || !session) return
  if (session.status !== "starting") return

  const ownerId = session.owner_id as string
  const projectId = session.project_id as string
  const projectRel = session.projects as unknown as { slug?: string; name?: string } | null
  const slug = projectRel?.slug ?? "project"
  const previewUrl = `https://preview.local/${slug}`

  try {
    // starting: ~1s boot
    await delay(1000)
    await writeEvent(supabase, {
      session_id: sessionId,
      project_id: projectId,
      owner_id: ownerId,
      level: "info",
      source: "system",
      message: "Installing dependencies...",
    })

    // transition → running
    await supabase
      .from("run_sessions")
      .update({ status: "running" })
      .eq("id", sessionId)
      .eq("owner_id", ownerId)

    await delay(1200)
    await writeEvent(supabase, {
      session_id: sessionId,
      project_id: projectId,
      owner_id: ownerId,
      level: "info",
      source: "build",
      message: "added 124 packages in 1.1s",
    })

    await delay(1000)
    await writeEvent(supabase, {
      session_id: sessionId,
      project_id: projectId,
      owner_id: ownerId,
      level: "info",
      source: "stdout",
      message: "Starting dev server on port 3000...",
    })

    await delay(1000)
    await writeEvent(supabase, {
      session_id: sessionId,
      project_id: projectId,
      owner_id: ownerId,
      level: "info",
      source: "stdout",
      message: `Ready — served at ${previewUrl}`,
    })

    // Persist preview URL and create the preview record.
    await supabase
      .from("run_sessions")
      .update({ preview_url: previewUrl })
      .eq("id", sessionId)
      .eq("owner_id", ownerId)

    await supabase.from("previews").insert({
      project_id: projectId,
      owner_id: ownerId,
      session_id: sessionId,
      url: previewUrl,
    })

    // Touch the project to reflect activity.
    await supabase
      .from("projects")
      .update({ status: "active", last_opened_at: new Date().toISOString() })
      .eq("id", projectId)
      .eq("owner_id", ownerId)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown runtime error"
    await supabase
      .from("run_sessions")
      .update({
        status: "error",
        error: message,
        stopped_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .eq("owner_id", ownerId)
    await writeEvent(supabase, {
      session_id: sessionId,
      project_id: projectId,
      owner_id: ownerId,
      level: "error",
      source: "system",
      message,
    })
  }
}

type EventInput = {
  session_id: string
  project_id: string
  owner_id: string
  level: "info" | "warn" | "error" | "system"
  source: "system" | "stdout" | "stderr" | "build"
  message: string
}

async function writeEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: EventInput,
): Promise<void> {
  await supabase.from("run_events").insert(input)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
