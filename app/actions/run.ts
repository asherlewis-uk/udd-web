"use server"

import { after } from "next/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
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

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const { data: task, error: taskError } = await supabase
    .from("ai_tasks")
    .select("id, project_id, status, run_session_id")
    .eq("id", taskId)
    .eq("owner_id", user.id)
    .single()
  if (taskError || !task) throw new Error("Task not found")
  if (task.status !== "completed") throw new Error("Task has not completed yet")

  const projectId = task.project_id as string

  // Reuse an existing linked session if one exists and is still live.
  let sessionId = (task.run_session_id as string | null) ?? null
  if (sessionId) {
    const { data: existing } = await supabase
      .from("run_sessions")
      .select("status")
      .eq("id", sessionId)
      .single()
    if (!existing || existing.status === "stopped" || existing.status === "error") {
      sessionId = null
    }
  }

  if (!sessionId) {
    sessionId = await startRun(projectId)
    await supabase
      .from("ai_tasks")
      .update({ run_session_id: sessionId })
      .eq("id", taskId)
      .eq("owner_id", user.id)

    after(async () => {
      await driveSession(sessionId!)
    })
  }

  revalidatePath(`/projects/${projectId}/ai`)
  revalidatePath(`/projects/${projectId}/run`)
  revalidatePath(`/projects/${projectId}/logs`)
  revalidatePath("/projects")
  redirect(`/projects/${projectId}/run`)
}
