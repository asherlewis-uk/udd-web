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
import {
  getAITaskByIdOnly,
  updateAITask,
  insertAITaskEvent,
  getProjectFilesForProject,
  deleteProjectFilesNotInPaths,
  upsertProjectFiles,
  updateProject,
  reapStaleAITasks,
  getProjectByIdAndOwner,
} from "@/lib/db/queries";

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

  if (/No .* API key configured/i.test(message)) {
    return message;
  }

  if (/UDD_DEFAULT_AI_BASE_URL is not configured/i.test(message)) {
    return "Ollama is not configured. Set UDD_DEFAULT_AI_BASE_URL in your environment.";
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
  let generationProvider: ProviderConfig | null = null;
  let usedStoredCredential = false;

  // Load the task.
  let task;
  try {
    task = await getAITaskByIdOnly(taskId);
  } catch (loadError: any) {
    console.log("[v0] runAITask: task not found", {
      taskId,
      error: loadError?.message,
    });
    return;
  }

  if (!task) {
    console.log("[v0] runAITask: task not found", { taskId });
    return;
  }

  if (task.status !== "pending") {
    // Idempotent: avoid double-processing a task already picked up.
    return;
  }

  const ownerId = task.ownerId;
  const projectId = task.projectId;
  const kind = task.kind as AITaskKind;
  const input = (task.input ?? {}) as { prompt?: string };
  const prompt = typeof input.prompt === "string" ? input.prompt : "";

  const project = await getProjectByIdAndOwner(projectId, ownerId).catch(
    () => null,
  );
  const projectName = project?.name?.trim() || "Project";
  const idea = project?.idea ?? null;
  const description = project?.description ?? null;

  const writeEvent = async (
    eventKind: AITaskEventKind,
    payload: AITaskEventPayload = {},
  ): Promise<void> => {
    await insertAITaskEvent({
      taskId,
      ownerId,
      kind: eventKind,
      payload,
    });
  };

  try {
    // pending → running. Conditional on status=pending so that if two
    // drivers race (e.g. double-click retry, or create+retry overlap), only
    // the first one actually claims the task. The other returns cleanly.
    let claimed;
    try {
      claimed = await updateAITask(
        taskId,
        ownerId,
        {
          status: "running",
          startedAt: new Date(),
        },
        "pending",
      );
    } catch (claimError: any) {
      console.log("[v0] runAITask: claim failed", {
        taskId,
        error: claimError.message,
      });
      return;
    }
    if (!claimed) {
      // Another driver won the race — nothing to do.
      return;
    }
    await writeEvent("started", { message: "Task picked up" });

    // Resolve provider from per-user saved default (if any), falling back
    // to the env-based default. This wires getActiveProviderForOwner into
    // the generation path so saveAIProviderConfig has an effect.
    const provider = await getActiveProviderForOwner(ownerId);

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
          ownerId,
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
    let staged;
    try {
      staged = await updateAITask(
        taskId,
        ownerId,
        { output: result },
        "running",
      );
    } catch (stageError: any) {
      throw new Error(`Failed to stage task output: ${stageError.message}`);
    }
    if (!staged) {
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
    await persistFiles(projectId, ownerId, result, kind);

    // running → completed. Only reachable after files have been persisted,
    // so 'completed' now implies the Files tab and runtime have real data.
    // Gated on status=running for the same concurrency reason as above;
    // if zero rows match we were cancelled after persistence (files are
    // already on disk, but we must not emit a 'completed' event).
    let completed;
    try {
      completed = await updateAITask(
        taskId,
        ownerId,
        {
          status: "completed",
          finishedAt: new Date(),
          error: null,
        },
        "running",
      );
    } catch (completeError: any) {
      throw new Error(`Failed to finalize task: ${completeError.message}`);
    }
    if (!completed) {
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
    await updateProject(projectId, ownerId, {
      status: "active",
      lastOpenedAt: new Date(),
    });
  } catch (err) {
    const message = formatAITaskError(
      err,
      generationProvider,
      usedStoredCredential,
    );
    await updateAITask(taskId, ownerId, {
      status: "failed",
      error: message,
      finishedAt: new Date(),
    });
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
  const cutoff = new Date(Date.now() - STALE_TASK_MS);
  const rows = await reapStaleAITasks(projectId, ownerId, cutoff);
  return rows.length;
}

async function persistFiles(
  projectId: string,
  ownerId: string,
  result: AITaskResult,
  kind: AITaskKind,
): Promise<void> {
  if (!result.files.length) return;

  const files = result.files.map((f) => ({
    path: f.path,
    content: f.content,
    language: f.language ?? null,
    sizeBytes: new TextEncoder().encode(f.content).length,
  }));

  // 1. Upsert first so the new file set is fully present before we prune.
  //    There is no moment where a scaffold leaves the Files tab empty —
  //    a concurrent reader during the prune will see the new files plus
  //    any about-to-be-pruned stale paths, never less than the new set.
  try {
    await upsertProjectFiles(projectId, ownerId, files);
  } catch (upsertError: any) {
    // project_files is the source of truth for the Files tab and runtime
    // validation. A persist failure must fail the whole task — propagate so
    // runAITask's catch marks status='failed' with a real error message.
    throw new Error(`Failed to persist project files: ${upsertError.message}`);
  }

  // 2. For scaffold kind, remove stale paths that weren't in the new set.
  //    Scaffold semantically replaces the project layout; edit/refactor/
  //    explain/other are additive and keep prior files untouched.
  if (kind === "scaffold") {
    const keepPaths = files.map((f) => f.path);

    try {
      await deleteProjectFilesNotInPaths(projectId, ownerId, keepPaths);
    } catch (pruneError: any) {
      // Prune failure is fatal: a scaffold that didn't prune leaves
      // the Files tab in a mixed state (new + stale) which violates
      // the scaffold contract.
      throw new Error(
        `Failed to prune stale project files: ${pruneError.message}`,
      );
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
    let existing;
    try {
      existing = await getProjectFilesForProject(projectId, ownerId);
    } catch (existingError: any) {
      throw new Error(
        `Failed to load project files for validation: ${existingError.message}`,
      );
    }
    const overlay = new Map<string, ValidationFile>();
    for (const row of existing) {
      overlay.set(row.path, {
        path: row.path,
        content: row.content ?? "",
        language: row.language ?? null,
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
