import { createClient } from "@/lib/supabase/server"
import { generateResult } from "@/lib/ai/generator"
import { getActiveProviderForOwner } from "@/lib/ai/providers/server"
import type {
  AITaskEventKind,
  AITaskEventPayload,
  AITaskKind,
  AITaskResult,
} from "@/lib/ai/types"

/**
 * The only entry point for executing an AI task.
 *
 * Backed by a real AI provider (see lib/ai/generator.ts + lib/ai/providers).
 * This function owns every side-effect: status transitions, event writes,
 * output persistence, and mirroring generated files into project_files.
 * Provider selection resolves from per-user provider_configs when available,
 * otherwise it falls back to UDD_AI_PROVIDER (and then OpenAI).
 */
export async function runAITask(taskId: string): Promise<void> {
  const supabase = await createClient()

  // Load the task. RLS guarantees it belongs to the caller.
  const { data: task, error: loadError } = await supabase
    .from("ai_tasks")
    .select(
      "id, project_id, owner_id, kind, status, input, projects(name, idea, description)",
    )
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
  const kind = task.kind as AITaskKind
  const input = (task.input ?? {}) as { prompt?: string }
  const prompt = typeof input.prompt === "string" ? input.prompt : ""
  const projectRel = task.projects as unknown as
    | { name?: string; idea?: string | null; description?: string | null }
    | null
  const projectName = projectRel?.name?.trim() || "Project"
  const idea = projectRel?.idea ?? null
  const description = projectRel?.description ?? null

  const writeEvent = async (
    eventKind: AITaskEventKind,
    payload: AITaskEventPayload = {},
  ): Promise<void> => {
    await supabase.from("ai_task_events").insert({
      task_id: taskId,
      owner_id: ownerId,
      kind: eventKind,
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

    // Real streaming generation. Hooks emit progress events as the object grows.
    const provider = await getActiveProviderForOwner(ownerId, supabase)
    const result: AITaskResult = await generateResult(
      { prompt, kind, projectName, idea, description },
      {
        onStart: async ({ provider }) => {
          await writeEvent("progress", {
            step: "calling_model",
            message: `Calling ${provider.label} (${provider.model})`,
          })
        },
        onPartial: async ({ summaryChars, fileCount, latestFilePath }) => {
          const message =
            fileCount === 0
              ? `Streaming response... (${summaryChars} chars)`
              : latestFilePath
                ? `Generating ${latestFilePath} (file ${fileCount})`
                : `Generating file ${fileCount}`
          await writeEvent("progress", {
            step: "streaming",
            message,
            file_count: fileCount,
          })
        },
      },
      provider,
    )

    // Persist generated files into project_files so the runtime executor has
    // a stable source of truth. This runs BEFORE marking the task completed:
    // if the upsert fails, the catch block below marks the task failed with
    // the DB error, rather than leaving a "completed" task with stale files.
    await persistFiles(supabase, projectId, ownerId, result)

    // running → completed (+ output). Only reached once files are persisted.
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

async function persistFiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  ownerId: string,
  result: AITaskResult,
): Promise<void> {
  if (!result.files.length) return

  const rows = result.files.map((f) => ({
    project_id: projectId,
    owner_id: ownerId,
    path: f.path,
    content: f.content,
    language: f.language ?? null,
    size_bytes: new TextEncoder().encode(f.content).length,
    updated_at: new Date().toISOString(),
  }))

  // Upsert so repeated tasks overwrite prior output for the same paths.
  // Throws on failure so the caller marks the task failed — a silent swallow
  // would leave ai_tasks looking "completed" while project_files is stale.
  const { error } = await supabase
    .from("project_files")
    .upsert(rows, { onConflict: "project_id,path" })

  if (error) {
    throw new Error(`Failed to persist project files: ${error.message}`)
  }
}
