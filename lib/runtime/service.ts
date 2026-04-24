import { createClient } from "@/lib/supabase/server"
import { analyzeFile, formatBytes, loadProjectFiles } from "@/lib/runtime/executor"

/**
 * Public API (startRun / driveSession / stopRun) is unchanged. Internals are
 * now backed by the real executor in lib/runtime/executor.ts: every event
 * reflects actual source contents and real parse results.
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
    message: "Run started.",
  })

  await supabase
    .from("projects")
    .update({ status: "active", last_opened_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("owner_id", user.id)

  return session.id
}

/**
 * Stop a currently-running session. Transitions running → stopping → stopped.
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

  // running/starting → stopping. Conditional so a concurrent stop or an
  // error-path terminal write can't be silently reversed.
  const { data: toStopping } = await supabase
    .from("run_sessions")
    .update({ status: "stopping" })
    .eq("id", sessionId)
    .eq("owner_id", user.id)
    .in("status", ["running", "starting"])
    .select("id")
  if (!toStopping || toStopping.length === 0) return

  await writeEvent(supabase, {
    session_id: sessionId,
    project_id: session.project_id as string,
    owner_id: user.id,
    level: "system",
    source: "system",
    message: "Stopping...",
  })

  // stopping → stopped. Conditional for the same reason as above.
  const { data: toStopped } = await supabase
    .from("run_sessions")
    .update({
      status: "stopped",
      stopped_at: new Date().toISOString(),
    })
    .eq("id", sessionId)
    .eq("owner_id", user.id)
    .eq("status", "stopping")
    .select("id")
  if (!toStopped || toStopped.length === 0) return

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
 * Real execution driver: loads files, parses them, and records genuine
 * per-file results. Scheduled from the server action via `after()`.
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
  const previewUrl = `https://preview.local/${slug}?session=${sessionId.slice(0, 8)}`

  try {
    const files = await loadProjectFiles(supabase, projectId, ownerId)

    if (files.length === 0) {
      throw new Error(
        "No files to execute. Run an AI task first to populate project files.",
      )
    }

    const totalBytes = files.reduce(
      (sum, f) => sum + new TextEncoder().encode(f.content).length,
      0,
    )

    await writeEvent(supabase, {
      session_id: sessionId,
      project_id: projectId,
      owner_id: ownerId,
      level: "info",
      source: "system",
      message: `Loaded ${files.length} file${files.length === 1 ? "" : "s"} (${formatBytes(totalBytes)}).`,
    })

    // Real per-file analysis. No artificial delay — timing reflects parser work.
    let errorCount = 0
    let okCount = 0
    for (const file of files) {
      const result = analyzeFile(file)
      if (result.ok) {
        okCount += 1
        await writeEvent(supabase, {
          session_id: sessionId,
          project_id: projectId,
          owner_id: ownerId,
          level: "info",
          source: "build",
          message: `ok  ${file.path}  ${formatBytes(result.bytes)}`,
        })
      } else {
        errorCount += 1
        await writeEvent(supabase, {
          session_id: sessionId,
          project_id: projectId,
          owner_id: ownerId,
          level: "error",
          source: "build",
          message: `FAIL  ${file.path}: ${result.message ?? "Parse error"}`,
        })
      }
    }

    if (errorCount > 0) {
      const message = `Build failed — ${errorCount} of ${files.length} file${files.length === 1 ? "" : "s"} did not parse.`
      // Only terminalize if we're still the active driver — avoid stomping
      // on a concurrent stop that already moved the session to stopped.
      await supabase
        .from("run_sessions")
        .update({
          status: "error",
          error: message,
          stopped_at: new Date().toISOString(),
        })
        .eq("id", sessionId)
        .eq("owner_id", ownerId)
        .in("status", ["starting", "running"])

      await writeEvent(supabase, {
        session_id: sessionId,
        project_id: projectId,
        owner_id: ownerId,
        level: "error",
        source: "system",
        message,
      })
      return
    }

    // All files parsed — mark running, publish preview. Conditional update
    // so a duplicate driver or a concurrent stop doesn't resurrect the
    // session into 'running'.
    await writeEvent(supabase, {
      session_id: sessionId,
      project_id: projectId,
      owner_id: ownerId,
      level: "info",
      source: "stdout",
      message: `Build succeeded — ${okCount} file${okCount === 1 ? "" : "s"} parsed cleanly.`,
    })

    const { data: promoted } = await supabase
      .from("run_sessions")
      .update({ status: "running", preview_url: previewUrl })
      .eq("id", sessionId)
      .eq("owner_id", ownerId)
      .eq("status", "starting")
      .select("id")
    if (!promoted || promoted.length === 0) {
      // Lost the race — another driver already terminalized this session
      // (or the user stopped it). Skip preview side-effects.
      return
    }

    await supabase.from("previews").insert({
      project_id: projectId,
      owner_id: ownerId,
      session_id: sessionId,
      url: previewUrl,
    })

    await writeEvent(supabase, {
      session_id: sessionId,
      project_id: projectId,
      owner_id: ownerId,
      level: "info",
      source: "stdout",
      message: `Ready — served at ${previewUrl}`,
    })

    await supabase
      .from("projects")
      .update({ status: "active", last_opened_at: new Date().toISOString() })
      .eq("id", projectId)
      .eq("owner_id", ownerId)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown runtime error"
    // Only terminalize if we're still the active driver — don't overwrite
    // a concurrent stop or a prior error already written by another driver.
    await supabase
      .from("run_sessions")
      .update({
        status: "error",
        error: message,
        stopped_at: new Date().toISOString(),
      })
      .eq("id", sessionId)
      .eq("owner_id", ownerId)
      .in("status", ["starting", "running"])
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

/** Stale threshold in milliseconds (10 minutes). */
const STALE_SESSION_MS = 10 * 60 * 1000

/**
 * Opportunistic reaper: marks sessions stuck in starting/running as error if
 * they've been in that state longer than STALE_SESSION_MS. Called on Run tab
 * load so stale work gets cleaned up when the user visits — no cron needed.
 */
export async function reapStaleSessions(
  projectId: string,
  ownerId: string,
): Promise<number> {
  const supabase = await createClient()
  const cutoff = new Date(Date.now() - STALE_SESSION_MS).toISOString()

  const { data } = await supabase
    .from("run_sessions")
    .update({
      status: "error",
      error: "Session stalled — marked failed after timeout.",
      stopped_at: new Date().toISOString(),
    })
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .in("status", ["starting", "running"])
    .lt("started_at", cutoff)
    .select("id")

  return data?.length ?? 0
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
