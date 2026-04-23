"use server"

import { after } from "next/server"
import { revalidatePath } from "next/cache"
import { driveSession, startRun, stopRun } from "@/lib/runtime/service"

/**
 * Create a run session and schedule simulated lifecycle processing after
 * the response is flushed. Returns the new session id.
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
