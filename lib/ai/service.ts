import { createClient } from "@/lib/supabase/server";
import { generateResult } from "@/lib/ai/generator";
import {
  getActiveProviderForOwner,
  getCredentialForProvider,
} from "@/lib/ai/providers/server";
import type { ProviderConfig } from "@/lib/ai/providers";
import type {
  AITaskEventKind,
  AITaskEventPayload,
  AITaskKind,
  AITaskResult,
} from "@/lib/ai/types";
import {
  summarizeReport,
  validateProject,
  type ValidationFile,
  type ValidationIssue,
  type ValidationReport,
} from "@/lib/validation";

/** Maximum time allowed for a single AI generation call (5 minutes). */
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

function formatAITaskError(
  err: unknown,
  provider: ProviderConfig | null,
  usedStoredCredential: boolean,
): string {
  const message = err instanceof Error ? err.message : "Unknown error";

  if (
    /AI_GATEWAY_API_KEY|Unauthenticated request to AI Gateway|AI Gateway authentication failed/i.test(
      message,
    )
  ) {
    return "UDD could not authenticate with Vercel AI Gateway. Configure AI_GATEWAY_API_KEY or Vercel OIDC; stored provider keys still route through AI Gateway.";
  }

  if (
    provider &&
    usedStoredCredential &&
    /(invalid api key|api key|credential|authentication|unauthorized|forbidden|401|403)/i.test(
      message,
    )
  ) {
    return `The saved ${provider.label} credential could not be used. Replace or delete it, then retry the task.`;
  }

  return message;
}

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
  const supabase = await createClient();
  let generationProvider: ProviderConfig | null = null;
  let usedStoredCredential = false;

  // Load the task. RLS guarantees it belongs to the caller.
  const { data: task, error: loadError } = await supabase
    .from("ai_tasks")
    .select(
      "id, project_id, owner_id, kind, status, input, projects(name, idea, description)",
    )
    .eq("id", taskId)
    .single();

  if (loadError || !task) {
    console.log("[v0] runAITask: task not found", {
      taskId,
      error: loadError?.message,
    });
    return;
  }

  if (task.status !== "pending") {
    // Idempotent: avoid double-processing a task already picked up.
    return;
  }

  const ownerId = task.owner_id as string;
  const projectId = task.project_id as string;
  const kind = task.kind as AITaskKind;
  const input = (task.input ?? {}) as { prompt?: string };
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  const projectRel = task.projects as unknown as {
    name?: string;
    idea?: string | null;
    description?: string | null;
  } | null;
  const projectName = projectRel?.name?.trim() || "Project";
  const idea = projectRel?.idea ?? null;
  const description = projectRel?.description ?? null;

  const writeEvent = async (
    eventKind: AITaskEventKind,
    payload: AITaskEventPayload = {},
  ): Promise<void> => {
    await supabase.from("ai_task_events").insert({
      task_id: taskId,
      owner_id: ownerId,
      kind: eventKind,
      payload,
    });
  };

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
      .select("id");
    if (claimError) {
      console.log("[v0] runAITask: claim failed", {
        taskId,
        error: claimError.message,
      });
      return;
    }
    if (!claimed || claimed.length === 0) {
      // Another driver won the race — nothing to do.
      return;
    }
    await writeEvent("started", { message: "Task picked up" });

    // Resolve provider from per-user saved default (if any), falling back
    // to the env-based default. This wires getActiveProviderForOwner into
    // the generation path so saveAIProviderConfig has an effect.
    const provider = await getActiveProviderForOwner(ownerId, supabase);

    generationProvider = provider;

    // Resolve stored user credential for the selected provider. When present,
    // generateResult forwards it to AI Gateway as request-scoped BYOK data.
    const credential = await getCredentialForProvider(ownerId, provider.id);
    usedStoredCredential = Boolean(credential);

    // Create an AbortController with a timeout so a hung stream doesn't
    // orphan the task in 'running' forever. The reaper catches anything
    // that slips past, but this provides a faster, cleaner failure path.
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      GENERATION_TIMEOUT_MS,
    );

    let result: AITaskResult;
    try {
      // Real streaming generation. Hooks emit progress events as the object grows.
      result = await generateResult(
        { prompt, kind, projectName, idea, description },
        {
          provider,
          credential,
          abortSignal: controller.signal,
          hooks: {
            onStart: async ({ provider }) => {
              await writeEvent("progress", {
                step: "calling_model",
                message: `Calling ${provider.label} (${provider.model})`,
              });
            },
            onPartial: async ({ summaryChars, fileCount, latestFilePath }) => {
              const message =
                fileCount === 0
                  ? `Streaming response... (${summaryChars} chars)`
                  : latestFilePath
                    ? `Generating ${latestFilePath} (file ${fileCount})`
                    : `Generating file ${fileCount}`;
              await writeEvent("progress", {
                step: "streaming",
                message,
                file_count: fileCount,
              });
            },
          },
        },
      );
    } finally {
      clearTimeout(timeoutId);
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
      .select("id");
    if (stageError) {
      throw new Error(`Failed to stage task output: ${stageError.message}`);
    }
    if (!staged || staged.length === 0) {
      // Cancelled or otherwise terminalized between claim and stage.
      return;
    }

    // ------------------------------------------------------------------
    // Validation gate. Runs BEFORE persistFiles so invalid output never
    // reaches project_files and never surfaces through the Files tab.
    //
    // Validation is a pure function of the merged file-set: existing
    // project_files (for edit/refactor/etc) overlaid with the freshly
    // generated files. For scaffold tasks the merge is a full replace,
    // matching persistFiles's prune semantics.
    //
    // Blocking issues → throw (caught below, task ends 'failed' with the
    // validation summary as `error` and per-issue events for the UI).
    // Warnings/info → recorded as events, task still completes.
    //
    // No runtime / sandbox / execution is introduced. All signal comes
    // from static analysis of the file contents.
    // ------------------------------------------------------------------
    const report = await validateGeneratedResult(
      supabase,
      projectId,
      ownerId,
      result,
      kind,
    );
    await writeValidationEvents(writeEvent, report);
    if (!report.ok) {
      throw new Error(summarizeReport(report));
    }

    // Persist generated files into project_files. project_files is the
    // source of truth used by the Files tab and runtime validation, so a
    // failure here MUST fail the task — persistFiles throws on upsert error
    // and the catch below will mark status='failed'. The staged
    // ai_tasks.output above remains available for diagnostics/recovery.
    //
    // `kind` drives prune semantics: scaffold replaces the file set
    // entirely; edit/refactor/explain/other are additive.
    await persistFiles(supabase, projectId, ownerId, result, kind);

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
      .select("id");
    if (completeError) {
      throw new Error(`Failed to finalize task: ${completeError.message}`);
    }
    if (!completed || completed.length === 0) {
      // Cancelled or otherwise terminalized after persistence — skip the
      // completed event so the UI doesn't show a "completed" event on a
      // task that ended up 'cancelled'.
      return;
    }

    await writeEvent("completed", {
      summary: result.summary,
      file_count: result.files.length,
    });

    // Touch the parent project so list sorting reflects activity.
    await supabase
      .from("projects")
      .update({ status: "active", last_opened_at: new Date().toISOString() })
      .eq("id", projectId)
      .eq("owner_id", ownerId);
  } catch (err) {
    const message = formatAITaskError(
      err,
      generationProvider,
      usedStoredCredential,
    );
    await supabase
      .from("ai_tasks")
      .update({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", taskId)
      .eq("owner_id", ownerId);
    await writeEvent("failed", { error: message });
  }
}

/** Stale threshold in milliseconds (10 minutes). */
const STALE_TASK_MS = 10 * 60 * 1000;

/**
 * Opportunistic reaper: marks tasks stuck in pending/running as failed if
 * they've been in that state longer than STALE_TASK_MS. Called on AI tab load
 * so stale work gets cleaned up when the user visits — no cron needed.
 */
export async function reapStaleTasks(
  projectId: string,
  ownerId: string,
): Promise<number> {
  const supabase = await createClient();
  const cutoff = new Date(Date.now() - STALE_TASK_MS).toISOString();

  // Correlate each status with the right age column:
  //   pending → age measured from created_at (started_at is always NULL here)
  //   running → age measured from started_at (set by the driver on claim)
  // Supabase's `.or()` with nested `and(...)` groups expresses this as a
  // single statement so the whole reap runs in one round trip.
  const { data } = await supabase
    .from("ai_tasks")
    .update({
      status: "failed",
      error: "Task stalled — marked failed after timeout.",
      finished_at: new Date().toISOString(),
    })
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .or(
      `and(status.eq.pending,created_at.lt.${cutoff}),and(status.eq.running,started_at.lt.${cutoff})`,
    )
    .select("id");

  return data?.length ?? 0;
}

async function persistFiles(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  ownerId: string,
  result: AITaskResult,
  kind: AITaskKind,
): Promise<void> {
  if (!result.files.length) return;

  const rows = result.files.map((f) => ({
    project_id: projectId,
    owner_id: ownerId,
    path: f.path,
    content: f.content,
    language: f.language ?? null,
    size_bytes: new TextEncoder().encode(f.content).length,
    updated_at: new Date().toISOString(),
  }));

  // 1. Upsert first so the new file set is fully present before we prune.
  //    There is no moment where a scaffold leaves the Files tab empty —
  //    a concurrent reader during the prune will see the new files plus
  //    any about-to-be-pruned stale paths, never less than the new set.
  const { error: upsertError } = await supabase
    .from("project_files")
    .upsert(rows, { onConflict: "project_id,path" });

  if (upsertError) {
    // project_files is the source of truth for the Files tab and runtime
    // validation. A persist failure must fail the whole task — propagate so
    // runAITask's catch marks status='failed' with a real error message.
    throw new Error(`Failed to persist project files: ${upsertError.message}`);
  }

  // 2. For scaffold kind, remove stale paths that weren't in the new set.
  //    Scaffold semantically replaces the project layout; edit/refactor/
  //    explain/other are additive and keep prior files untouched.
  //
  //    We use a two-step fetch-then-delete rather than a PostgREST NOT IN
  //    filter: file paths can legitimately contain commas, parentheses,
  //    or quotes, which would break the `(v1,v2,v3)` grammar used by the
  //    PostgREST `not.in` operator. The explicit .in() delete below takes
  //    an array and handles escaping for us.
  if (kind === "scaffold") {
    const keepPaths = new Set(rows.map((r) => r.path));

    const { data: existing, error: selectError } = await supabase
      .from("project_files")
      .select("path")
      .eq("project_id", projectId)
      .eq("owner_id", ownerId);
    if (selectError) {
      throw new Error(
        `Failed to read project files for prune: ${selectError.message}`,
      );
    }

    const stale = (existing ?? [])
      .map((r) => r.path as string)
      .filter((p) => !keepPaths.has(p));

    if (stale.length > 0) {
      const { error: pruneError } = await supabase
        .from("project_files")
        .delete()
        .eq("project_id", projectId)
        .eq("owner_id", ownerId)
        .in("path", stale);

      if (pruneError) {
        // Prune failure is fatal: a scaffold that didn't prune leaves
        // the Files tab in a mixed state (new + stale) which violates
        // the scaffold contract.
        throw new Error(
          `Failed to prune stale project files: ${pruneError.message}`,
        );
      }
    }
  }
}

/** Cap on per-issue events emitted per task so the UI stays readable. */
const MAX_VALIDATION_ISSUE_EVENTS = 50;

/**
 * Build the merged file-set and run validateProject against it.
 *
 * For scaffold kind the merge is a full replace (scaffold semantically
 * replaces the project layout — this matches persistFiles's prune step).
 * For edit/refactor/explain/other the merge overlays freshly generated
 * files on top of the pre-existing project_files so imports resolving to
 * already-existing files don't get flagged as missing_import.
 */
async function validateGeneratedResult(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  ownerId: string,
  result: AITaskResult,
  kind: AITaskKind,
): Promise<ValidationReport> {
  const generated: ValidationFile[] = result.files.map((f) => ({
    path: f.path,
    content: f.content,
    language: f.language ?? null,
  }));
  const newPaths = new Set(generated.map((f) => f.path));

  let merged: ValidationFile[];
  if (kind === "scaffold") {
    merged = generated;
  } else {
    const { data: existing, error: existingError } = await supabase
      .from("project_files")
      .select("path, content, language")
      .eq("project_id", projectId)
      .eq("owner_id", ownerId);
    if (existingError) {
      throw new Error(
        `Failed to load project files for validation: ${existingError.message}`,
      );
    }
    const overlay = new Map<string, ValidationFile>();
    for (const row of existing ?? []) {
      overlay.set(row.path as string, {
        path: row.path as string,
        content: (row.content as string) ?? "",
        language: (row.language as string | null) ?? null,
      });
    }
    for (const f of generated) overlay.set(f.path, f);
    merged = Array.from(overlay.values());
  }

  return validateProject(merged, { newPaths });
}

async function writeValidationEvents(
  writeEvent: (
    kind: AITaskEventKind,
    payload?: AITaskEventPayload,
  ) => Promise<void>,
  report: ValidationReport,
): Promise<void> {
  // One summary event so the UI always shows a clear top-line even when
  // there are no individual issues.
  await writeEvent("validation", {
    step: "summary",
    message: summarizeReport(report),
    blocking_count: report.blockingCount,
    warning_count: report.warningCount,
    info_count: report.infoCount,
  });

  const toEmit = report.issues.slice(0, MAX_VALIDATION_ISSUE_EVENTS);
  for (const issue of toEmit) {
    await writeEvent("validation", issuePayload(issue));
  }
  if (report.issues.length > toEmit.length) {
    await writeEvent("validation", {
      step: "summary",
      message: `… and ${report.issues.length - toEmit.length} more issue${
        report.issues.length - toEmit.length === 1 ? "" : "s"
      } not shown.`,
    });
  }
}

function issuePayload(issue: ValidationIssue): AITaskEventPayload {
  return {
    severity: issue.severity,
    issue_kind: issue.kind,
    file_path: issue.path,
    line: issue.line,
    message: issue.message,
    suggestion: issue.suggestion,
  };
}
