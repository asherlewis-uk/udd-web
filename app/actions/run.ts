"use server"

import { after } from "next/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-session"
import {
  getAITaskById,
  getRunSessionById,
  linkTaskToRunSession,
  deleteRunSession,
} from "@/lib/db/queries"
import { mapAITask, mapRunSession } from "@/lib/db/mappers"
import { driveSession, startRun, stopRun } from "@/lib/runtime/service"

/**
 * Create a run session and schedule the real executor to drive it after
 * the response is flushed.
 */
export async function startRunAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get("project_id") ?? "").trim()
  if (!projectId) throw new Error("Missing project id")

  const sessionId = await startRun(projectId)

  after(async () => {
    await driveSession(sessionId)
  })

  revalidatePath(`/projects/${projectId}/run`)
  revalidatePath(`/projects/${projectId}/logs`)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/projects")
}

/**
 * Stop an in-flight run.
 */
export async function stopRunAction(formData: FormData): Promise<void> {
  const sessionId = String(formData.get("session_id") ?? "").trim()
  const projectId = String(formData.get("project_id") ?? "").trim()
  if (!sessionId) throw new Error("Missing session id")

  await stopRun(sessionId)

  if (projectId) {
    revalidatePath(`/projects/${projectId}/run`)
    revalidatePath(`/projects/${projectId}/logs`)
  }
}

/**
 * Start a run session from a completed AI task result, linking the two so
 * the AI tab can surface a "View run" shortcut. Redirects to the Run tab.
 */
export async function startRunFromTaskAction(formData: FormData): Promise<void> {
  const taskId = String(formData.get("task_id") ?? "").trim()
  if (!taskId) throw new Error("Missing task id")

  const session = await getSession()
  if (!session) throw new Error("Not authenticated")
  const user = session.user

  const taskRaw = await getAITaskById(taskId, user.id)
  if (!taskRaw) throw new Error("Task not found")
  const task = mapAITask(taskRaw)
  if (task.status !== "completed") throw new Error("Task has not completed yet")

  const projectId = task.project_id as string

  // Reuse an existing linked session if one exists and is still live.
  let sessionId = (task.run_session_id as string | null) ?? null
  if (sessionId) {
    const existingRaw = await getRunSessionById(sessionId, user.id)
    const existing = existingRaw ? mapRunSession(existingRaw) : null
    // Treat 'stopping' as non-reusable too — the session is on its way out,
    // reusing it would race with stopRun's terminal transition.
    if (
      !existing ||
      existing.status === "stopped" ||
      existing.status === "error" ||
      existing.status === "stopping"
    ) {
      sessionId = null
    }
  }

  if (!sessionId) {
    // Create a session first so we have an id to link…
    const newSessionId = await startRun(projectId)

    // …then claim the link slot atomically. Guarding on
    // `run_session_id IS NULL` means only the first concurrent submit
    // wins; any later submit that raced past the earlier `task.run_session_id`
    // read will get zero affected rows here.
    const claimed = await linkTaskToRunSession(taskId, user.id, newSessionId)

    if (claimed) {
      // Won the race — drive the session we just created.
      sessionId = newSessionId
      after(async () => {
        await driveSession(newSessionId)
      })
    } else {
      // Lost the race (or the update errored). Our freshly-created session
      // is an orphan — delete it so there's no ghost session in the Run
      // tab history. `run_events.session_id` cascades, so the initial
      // "Run started." event is cleaned up automatically.
      await deleteRunSession(newSessionId, user.id)

      // Re-read the winner's link so we redirect to the correct run.
      const refreshedRaw = await getAITaskById(taskId, user.id)
      const refreshed = refreshedRaw ? mapAITask(refreshedRaw) : null
      sessionId = (refreshed?.run_session_id as string | null) ?? null
      // If the winner's session already terminalized between their claim
      // and our re-read, sessionId stays null. We still redirect to the
      // Run tab; the user can click "Run this result" again and will hit
      // the normal "no live linked session" path next render.
    }
  }

  revalidatePath(`/projects/${projectId}/ai`)
  revalidatePath(`/projects/${projectId}/run`)
  revalidatePath(`/projects/${projectId}/logs`)
  revalidatePath("/projects")
  redirect(`/projects/${projectId}/run`)
}
