import { createClient } from "@/lib/supabase/server"
import { generateResult } from "@/lib/ai/simulator"
import type { AITaskEventKind, AITaskEventPayload, AITaskResult } from "@/lib/ai/types"

/**
 * The only entry point for executing an AI task.
 *
 * Today this is backed by a deterministic simulator in `lib/ai/simulator.ts`.
 * When real providers land, swap the `generateResult` call for a provider
 * adapter — the rest of this function (status transitions, events, output
 * persistence) stays the same.
 */
export async function runAITask(taskId: string): Promise<void> {
  const supabase = await createClient()

  // Load the task. RLS guarantees it belongs to the caller.
  const { data: task, error: loadError } = await supabase
    .from("ai_tasks")
    .select("id, project_id, owner_id, status, input, projects(name)")
    .eq("id", taskId)
    .single()

  if (loadError || !task) {
    console.log("[v0] runAITask: task not found", { taskId, error: loadError?.message })
    return
  }

  if (task.status !== "pending") {
    // Idempotent: avoid double-processing a task already picked up.
    return
  }

  const ownerId = task.owner_id as string
  const projectId = task.project_id as string
  const input = (task.input ?? {}) as { prompt?: string }
  const prompt = typeof input.prompt === "string" ? input.prompt : ""
  const projectName =
    (task.projects as unknown as { name?: string } | null)?.name?.trim() || "Project"

  const writeEvent = async (
    kind: AITaskEventKind,
    payload: AITaskEventPayload = {},
  ): Promise<void> => {
    await supabase.from("ai_task_events").insert({
      task_id: taskId,
      owner_id: ownerId,
      kind,
      payload,
    })
  }

  try {
    // pending → running
    await supabase
      .from("ai_tasks")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("owner_id", ownerId)
    await writeEvent("started", { message: "Task picked up" })

    // Simulated progress — fixed delays, no randomness.
    await delay(700)
    await writeEvent("progress", { step: "planning", message: "Analyzing prompt" })

    await delay(700)
    await writeEvent("progress", { step: "generating", message: "Drafting files" })

    await delay(700)

    // Produce the structured result via the pure simulator.
    const result: AITaskResult = generateResult(prompt, projectName)

    // running → completed (+ output)
    await supabase
      .from("ai_tasks")
      .update({
        status: "completed",
        output: result,
        finished_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", taskId)
      .eq("owner_id", ownerId)

    await writeEvent("completed", {
      summary: result.summary,
      file_count: result.files.length,
    })

    // Touch the parent project so list sorting reflects activity.
    await supabase
      .from("projects")
      .update({ status: "active", last_opened_at: new Date().toISOString() })
      .eq("id", projectId)
      .eq("owner_id", ownerId)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    await supabase
      .from("ai_tasks")
      .update({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .eq("owner_id", ownerId)
    await writeEvent("failed", { error: message })
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
