import { createClient } from "@/lib/supabase/server"
import { generateResult } from "@/lib/ai/generator"
import { getActiveProviderForOwner } from "@/lib/ai/providers/server"
import type {
  AITaskEventKind,
  AITaskEventPayload,
  AITaskKind,
  AITaskResult,
} from "@/lib/ai/types"

/** Maximum time allowed for a single AI generation call (5 minutes). */
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000

/**
 * The only entry point for executing an AI task.
 *
 * Backed by a real AI provider (see lib/ai/generator.ts + lib/ai/providers).
 * This function owns every side-effect: status transitions, event writes,
 * output staging, and persisting generated files into project_files.
 *
 * project_files is the source of truth for the Files tab and runtime
 * validation. If file persistence fails, the task is marked 'failed' — it
 * is never 'completed' without successfully persisted files. The raw
 * generator output is staged onto ai_tasks.output before persistence so it
 * remains available for diagnostics/recovery on failed tasks.
 *
 * Swapping provider only means changing UDD_AI_PROVIDER — no code changes here.
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
    // pending → running. Conditional on status=pending so that if two
    // drivers race (e.g. double-click retry, or create+retry overlap), only
    // the first one actually claims the task. The other returns cleanly.
    const { data: claimed, error: claimError } = await supabase
      .from("ai_tasks")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("owner_id", ownerId)
      .eq("status", "pending")
      .select("id")
    if (claimError) {
      console.log("[v0] runAITask: claim failed", { taskId, error: claimError.message })
      return
    }
    if (!claimed || claimed.length === 0) {
      // Another driver won the race — nothing to do.
      return
    }
    await writeEvent("started", { message: "Task picked up" })

    // Resolve provider from per-user saved default (if any), falling back
    // to the env-based default. This wires getActiveProviderForOwner into
    // the generation path so saveAIProviderConfig has an effect.
    const provider = await getActiveProviderForOwner(ownerId, supabase)

    // Create an AbortController with a timeout so a hung stream doesn't
    // orphan the task in 'running' forever. The reaper catches anything
    // that slips past, but this provides a faster, cleaner failure path.
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS)

    let result: AITaskResult
    try {
      // Real streaming generation. Hooks emit progress events as the object grows.
      result = await generateResult(
        { prompt, kind, projectName, idea, description },
        {
          provider,
          abortSignal: controller.signal,
          hooks: {
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
        },
      )
    } finally {
      clearTimeout(timeoutId)
    }

    // Stage the generator output onto the task row while status is still
    // 'running'. This preserves the raw model output for diagnostics and
    // recovery even if the subsequent persist step fails and the task
    // ultimately ends up 'failed'. Gated on status=running so a concurrent
    // cancel/fail can't be silently overwritten. If the gate matches zero
    // rows the task was terminalized (e.g. cancelled) while the model was
    // streaming — short-circuit without persisting or completing.
    const { data: staged, error: stageError } = await supabase
      .from("ai_tasks")
      .update({ output: result })
      .eq("id", taskId)
      .eq("owner_id", ownerId)
      .eq("status", "running")
      .select("id")
    if (stageError) {
      throw new Error(`Failed to stage task output: ${stageError.message}`)
    }
    if (!staged || staged.length === 0) {
      // Cancelled or otherwise terminalized between claim and stage.
      return
    }

    // Persist generated files into project_files. project_files is the
    // source of truth used by the Files tab and runtime validation, so a
    // failure here MUST fail the task — persistFiles throws on upsert error
    // and the catch below will mark status='failed'. The staged
    // ai_tasks.output above remains available for diagnostics/recovery.
    await persistFiles(supabase, projectId, ownerId, result)

    // running → completed. Only reachable after files have been persisted,
    // so 'completed' now implies the Files tab and runtime have real data.
    // Gated on status=running for the same concurrency reason as above;
    // if zero rows match we were cancelled after persistence (files are
    // already on disk, but we must not emit a 'completed' event).
    const { data: completed, error: completeError } = await supabase
      .from("ai_tasks")
      .update({
        status: "completed",
        finished_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", taskId)
      .eq("owner_id", ownerId)
      .eq("status", "running")
      .select("id")
    if (completeError) {
      throw new Error(`Failed to finalize task: ${completeError.message}`)
    }
    if (!completed || completed.length === 0) {
      // Cancelled or otherwise terminalized after persistence — skip the
      // completed event so the UI doesn't show a "completed" event on a
      // task that ended up 'cancelled'.
      return
    }

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

/** Stale threshold in milliseconds (10 minutes). */
const STALE_TASK_MS = 10 * 60 * 1000

/**
 * Opportunistic reaper: marks tasks stuck in pending/running as failed if
 * they've been in that state longer than STALE_TASK_MS. Called on AI tab load
 * so stale work gets cleaned up when the user visits — no cron needed.
 */
export async function reapStaleTasks(
  projectId: string,
  ownerId: string,
): Promise<number> {
  const supabase = await createClient()
  const cutoff = new Date(Date.now() - STALE_TASK_MS).toISOString()

  // Conditional update: only flip tasks that are still pending/running and
  // whose started_at (or created_at for never-started tasks) is older than
  // the cutoff. Returns affected rows so caller can log if needed.
  const { data } = await supabase
    .from("ai_tasks")
    .update({
      status: "failed",
      error: "Task stalled — marked failed after timeout.",
      finished_at: new Date().toISOString(),
    })
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .in("status", ["pending", "running"])
    .or(`started_at.lt.${cutoff},started_at.is.null,created_at.lt.${cutoff}`)
    .select("id")

  return data?.length ?? 0
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
  const { error } = await supabase
    .from("project_files")
    .upsert(rows, { onConflict: "project_id,path" })

  if (error) {
    // project_files is the source of truth for the Files tab and runtime
    // validation. A persist failure must fail the whole task — propagate so
    // runAITask's catch marks status='failed' with a real error message.
    throw new Error(`Failed to persist project files: ${error.message}`)
  }
}
