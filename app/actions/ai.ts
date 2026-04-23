"use server"

import { after } from "next/server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { runAITask } from "@/lib/ai/service"
import { classifyPrompt } from "@/lib/ai/classify"

async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")
  return { supabase, user }
}

/**
 * Create a prompt + an ai_task in 'pending' state, then schedule background
 * processing via `after()`. Returns by redirecting to the AI tab focused on
 * the new task.
 */
export async function createAITask(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "").trim()
  const prompt = String(formData.get("prompt") ?? "").trim()
  if (!projectId) throw new Error("Missing project id")
  if (!prompt) throw new Error("Prompt is required")
  if (prompt.length > 4000) throw new Error("Prompt is too long (max 4000 chars)")

  const { supabase, user } = await getUser()

  // 1. Persist the prompt.
  const { data: promptRow, error: promptError } = await supabase
    .from("prompts")
    .insert({
      project_id: projectId,
      owner_id: user.id,
      body: prompt,
    })
    .select("id")
    .single()
  if (promptError) throw new Error(promptError.message)

  // 2. Create the task in pending state.
  const { kind, title } = classifyPrompt(prompt)
  const { data: taskRow, error: taskError } = await supabase
    .from("ai_tasks")
    .insert({
      project_id: projectId,
      owner_id: user.id,
      prompt_id: promptRow.id,
      kind,
      title,
      status: "pending",
      input: { prompt },
    })
    .select("id")
    .single()
  if (taskError) throw new Error(taskError.message)

  // 3. Touch the parent project so activity surfaces on the list immediately.
  await supabase
    .from("projects")
    .update({ status: "active", last_opened_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("owner_id", user.id)

  // 4. Schedule processing after the response is flushed so the UI
  //    returns immediately and the real model call runs in the background.
  after(async () => {
    await runAITask(taskRow.id)
  })

  revalidatePath(`/projects/${projectId}/ai`)
  revalidatePath("/projects")
  redirect(`/projects/${projectId}/ai?task=${taskRow.id}`)
}

/**
 * Manually retry / run a task still in 'pending'. Useful if a previous
 * `after()` invocation didn't complete (e.g. server restart). Accepts
 * FormData so it can be wired directly to a <form action={...}>.
 */
export async function retryPendingTask(formData: FormData) {
  const taskId = String(formData.get("task_id") ?? "").trim()
  const projectId = String(formData.get("project_id") ?? "").trim()
  if (!taskId || !projectId) return

  const { supabase, user } = await getUser()
  const { data } = await supabase
    .from("ai_tasks")
    .select("id, status")
    .eq("id", taskId)
    .eq("owner_id", user.id)
    .single()
  if (!data || data.status !== "pending") return

  after(async () => {
    await runAITask(taskId)
  })

  revalidatePath(`/projects/${projectId}/ai`)
}
