/**
 * Deterministic next-action decision engine for the Agent Workspace.
 *
 * Pure function — no I/O, no async, no side effects.
 * All decision branches are grounded in docs/system-state.md and the
 * Product Truth Contract in CLAUDE.md. Comments on each branch cite the
 * exact section that justifies the decision.
 */

import type { AITaskStatus, Project, RunStatus } from "@/lib/types";
import { isRepairTaskInput } from "@/lib/ai/repair";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type AITask = {
  id: string;
  title: string;
  kind: string;
  status: AITaskStatus;
  input: Record<string, unknown> | null;
  created_at: string;
  finished_at: string | null;
  error: string | null;
};

export type ValidationSummary = {
  message: string;
  blocking_count: number;
  warning_count: number;
  info_count: number;
};

export type RunSession = {
  id: string;
  status: RunStatus;
  started_at: string | null;
};

// ---------------------------------------------------------------------------
// Output type
// ---------------------------------------------------------------------------

export type NextAction = {
  /** Short headline — what should happen. */
  label: string;
  /** Plain-English explanation for a non-coder. */
  description: string;
  /** The one CTA the user should take. */
  cta: {
    label: string;
    href: string;
    action?: "repair";
    taskId?: string;
  };
  /** Prose reasoning grounded in system-state.md — for auditability. */
  reason: string;
  /** Semantic bucket — drives icon / visual tone in the panel. */
  state: "idle" | "in_progress" | "blocked" | "ready";
};

// ---------------------------------------------------------------------------
// Decision engine
// ---------------------------------------------------------------------------

export function deriveNextAction(input: {
  project: Project;
  latestTask: AITask | null;
  validationSummary: ValidationSummary | null;
  projectFilesCount: number;
  latestRunSession: RunSession | null;
}): NextAction {
  const {
    project,
    latestTask,
    validationSummary,
    projectFilesCount,
    latestRunSession,
  } = input;
  const aiHref = `/projects/${project.id}/ai`;
  const runHref = `/projects/${project.id}/run`;

  // ── 1. No tasks exist ─────────────────────────────────────────────────────
  // No ai_tasks row exists for this project. Nothing has been generated.
  // Work must be explicitly initiated by the user — there is no automatic
  // task scheduling or background orchestration.
  // (system-state.md §Execution Semantics — Explicit absence of automation:
  //  "No automatic task-to-run chaining … a run session is created only
  //  when the user explicitly calls startRunAction or startRunFromTaskAction.")
  if (!latestTask) {
    return {
      label: "Start a generation run",
      description:
        "No generation runs yet. Describe the first scaffold or change and UDD will draft saved files.",
      cta: { label: "Start run", href: aiHref },
      reason:
        "No ai_tasks row for this project. Work is entirely user-initiated.",
      state: "idle",
    };
  }

  const operation = nextActionOperation(latestTask.kind);

  // ── 2. Task pending ───────────────────────────────────────────────────────
  // The ai_tasks row was inserted by createAITask and the after() callback
  // has been scheduled but has not yet claimed the task. The system will
  // transition it to running once runAITask executes.
  // (system-state.md §AI Pipeline — Task state transitions:
  //  "pending → running claim via conditional update eq('status','pending')")
  if (latestTask.status === "pending") {
    return {
      label: `${operation.label} queued`,
      description: `${operation.sentenceName} is queued and will start drafting files shortly.`,
      cta: { label: "Inspect generation run", href: aiHref },
      reason:
        "Task status is pending — runAITask has been scheduled via after() but has not started yet " +
        "(system-state.md §AI Pipeline Task state transitions).",
      state: "in_progress",
    };
  }

  // ── 3. Task running ───────────────────────────────────────────────────────
  // The model is generating output. The task will transition to completed
  // (if validation passes and files persist) or failed (on any error).
  // No user action is meaningful until the task settles.
  // (system-state.md §AI Pipeline — Task state transitions:
  //  "running → completed after validation passes AND persistFiles succeeds"
  //  "running → failed on any error: generation, timeout, validation, or persistence")
  if (latestTask.status === "running") {
    return {
      label: `${operation.label} in progress`,
      description: operation.runningDescription,
      cta: { label: "Inspect generation run", href: aiHref },
      reason:
        "Task status is running — the model is generating output. Outcome will be " +
        "completed or failed (system-state.md §AI Pipeline Task state transitions).",
      state: "in_progress",
    };
  }

  // ── 3b / 4. Task failed ───────────────────────────────────────────────────
  // running → failed on any error: generation, timeout, validation, or
  // persistence. No files are written on failure.
  // (system-state.md §AI Pipeline — Task state transitions:
  //  "running → failed on any error: generation, timeout, validation, or persistence")
  // Sub-case: if the validation summary shows blocking issues, the failure was
  // specifically caused by validateProject throwing — zero files written.
  // (system-state.md §Staging vs persistence order §2:
  //  "validateProject called … Blocking issues → throws → task ends failed, no files written")
  if (latestTask.status === "failed") {
    const blockingCount = validationSummary?.blocking_count ?? 0;
    const repairAttempt = isRepairTaskInput(latestTask.input);
    return {
      label:
        blockingCount > 0
          ? repairAttempt
            ? "Repair attempt failed"
            : "Repair failed generation run"
          : "Review failed generation run",
      description:
        blockingCount > 0
          ? `The ${operation.name} failed validation with ${blockingCount} blocking issue${blockingCount === 1 ? "" : "s"}. Use the recorded validation evidence to queue a repair run.`
          : `The last ${operation.name} failed. Review the error and try again.`,
      cta: {
        label:
          blockingCount > 0 ? "Repair with evidence" : "Inspect generation run",
        href: aiHref,
        action: blockingCount > 0 ? "repair" : undefined,
        taskId: blockingCount > 0 ? latestTask.id : undefined,
      },
      reason:
        blockingCount > 0
          ? `Task failed because validateProject emitted blocking issues; no files written ` +
            `(system-state.md §Staging vs persistence order §2, Intentional Constraint §2). ` +
            `Repair is user-triggered and uses stored validation events from the failed task.`
          : "Task failed — generation, timeout, or persistence error " +
            "(system-state.md §AI Pipeline Task state transitions).",
      state: "blocked",
    };
  }

  // ── Cancelled ─────────────────────────────────────────────────────────────
  // The user explicitly cancelled the task. This is a deliberate action, not
  // an error. No automatic retry exists — the user must submit a new prompt.
  // (system-state.md §Execution Semantics — Explicit absence of automation:
  //  "No automatic fail-to-retry: a failed task is retried only when the user
  //  explicitly calls retryFailedTask.")
  if (latestTask.status === "cancelled") {
    return {
      label: "Resume generation",
      description:
        "The last generation run was cancelled. Submit a new prompt to continue.",
      cta: { label: "Start new run", href: aiHref },
      reason:
        "Task was cancelled by the user. No automatic retry — " +
        "(system-state.md §Execution Semantics Explicit absence of automation).",
      state: "idle",
    };
  }

  // ── From here: latestTask.status === "completed" ─────────────────────────
  //
  // Per Intentional Constraint §1 (system-state.md):
  //   "completed implies validateProject passed (blocking_count === 0)
  //    AND persistFiles succeeded."
  // This means:
  //   a) No blocking issues can be present in the validation summary.
  //   b) At least some files must exist in project_files.
  // Both sub-branches below are defensive — they should not be reachable
  // under normal operation.

  // ── 4. Defensive: completed with blocking issues ──────────────────────────
  // impossible by design — completed implies validation passed with zero blocking.
  // (system-state.md §Intentional Constraints §1:
  //  "completed implies … validateProject passed … AND persistFiles succeeded"
  //  §Staging vs persistence order §2:
  //  "Blocking issues → throws → task ends failed, no files written")
  // If we observe this state, it is a data inconsistency — surface it.
  const blockingOnCompleted = validationSummary?.blocking_count ?? 0;
  if (blockingOnCompleted > 0) {
    return {
      label: "Unexpected state",
      description:
        "A saved generation run has blocking validation issues recorded. This should not occur.",
      cta: { label: "Inspect generation run", href: aiHref },
      reason:
        "completed+blocking_count>0 is impossible per Intentional Constraint §1 " +
        "(system-state.md). Data inconsistency detected.",
      state: "blocked",
    };
  }

  // ── 7. Completed but no project_files ─────────────────────────────────────
  // Per Intentional Constraint §1: completed implies persistFiles returned
  // without error, so projectFilesCount should be > 0. Zero files after
  // completion is a data inconsistency.
  // (system-state.md §Intentional Constraints §1:
  //  "The Files tab and the runtime pipeline read project_files without
  //  checking task status. A task marked completed with missing or empty
  //  files would silently produce an incorrect view.")
  if (projectFilesCount === 0) {
    return {
      label: "Saved files missing",
      description:
        "The last generation run finished but no saved files were found. This may indicate a data issue.",
      cta: { label: "Inspect generation run", href: aiHref },
      reason:
        "completed implies persistFiles succeeded (Intentional Constraint §1) but " +
        "projectFilesCount is 0. Data inconsistency.",
      state: "blocked",
    };
  }

  // ── 9. Run session in progress ────────────────────────────────────────────
  // A validation-only run is active. The parser is processing files.
  // (system-state.md §Runtime Pipeline — State machine:
  //  "[none] → starting startRun inserts with status='starting'"
  //  "starting → running all files parse cleanly"
  //  "running/starting → stopping stopRun conditional update")
  // The runtime does not serve an app — validation-only.
  // (system-state.md §Runtime Pipeline — preview_url behavior:
  //  "preview_url is always null at runtime")
  if (
    latestRunSession?.status === "starting" ||
    latestRunSession?.status === "stopping"
  ) {
    return {
      label: "Validation check in progress",
      description:
        "UDD is checking saved files with a parser. UDD can check files, but does not run or preview the app yet.",
      cta: { label: "Inspect validation check", href: runHref },
      reason:
        "Run session status is starting/stopping — the parser is processing files " +
        "(system-state.md §Runtime Pipeline state machine). Nothing is served.",
      state: "in_progress",
    };
  }

  // ── 11. Run session completed cleanly ────────────────────────────────────
  // status === "running" means all files parsed cleanly — the validation
  // check passed. Nothing is executed or served; the session stays "running"
  // to signal clean parse state.
  // (system-state.md §Runtime Pipeline — State machine:
  //  "starting → running all files parse cleanly")
  // (system-state.md §Intentional Constraints §4:
  //  "run_sessions.preview_url must remain null — nothing is served")
  if (latestRunSession?.status === "running") {
    return {
      label: "Continue building",
      description: `${projectFilesCount} saved file${projectFilesCount === 1 ? "" : "s"} passed the validation check. Describe the next change to keep going.`,
      cta: { label: "Continue building", href: aiHref },
      reason:
        "Run session status is running — all files parsed cleanly " +
        "(system-state.md §Runtime Pipeline state machine). Nothing is served.",
      state: "ready",
    };
  }

  // ── 10. Run session error ─────────────────────────────────────────────────
  // One or more files failed to parse. The session ended in error state.
  // (system-state.md §Runtime Pipeline — State machine:
  //  "starting → error any file fails to parse"
  //  "starting → error no files found after loading")
  if (latestRunSession?.status === "error") {
    return {
      label: "Review validation output",
      description:
        "The last validation check found parse errors. Revise the prompt or inspect the details.",
      cta: { label: "Inspect validation check", href: runHref },
      reason:
        "Run session status is error — at least one file failed to parse " +
        "(system-state.md §Runtime Pipeline state machine).",
      state: "blocked",
    };
  }

  // ── 5. Completed with warnings, no run session ────────────────────────────
  // Validation passed (no blocking — see Intentional Constraint §1 above),
  // but warnings were emitted. Warnings do not block task completion.
  // (system-state.md §Validation Layer — ok definition:
  //  "report.ok === true iff blockingCount === 0.
  //   Warnings and info issues do not flip this bit.")
  // A validation-only run will surface the warnings in per-file context.
  const warnings = validationSummary?.warning_count ?? 0;
  if (warnings > 0 && !latestRunSession) {
    return {
      label: "Start validation check",
      description: `The ${operation.name} saved files with ${warnings} warning${warnings === 1 ? "" : "s"}. Start a validation check to review per-file parser results.`,
      cta: { label: "Start validation check", href: runHref },
      reason:
        `Warnings present (warning_count=${warnings}) — they do not block completion ` +
        `(system-state.md §Validation Layer ok definition). No run session yet.`,
      state: "ready",
    };
  }

  // ── 8. Files exist, no run session ───────────────────────────────────────
  // Task completed cleanly, files persisted. No run session exists yet.
  // Run sessions are never created automatically — the user must initiate.
  // (system-state.md §Execution Semantics — Explicit absence of automation:
  //  "No automatic task-to-run chaining: a run session is created only
  //  when the user explicitly calls startRunAction or startRunFromTaskAction.")
  if (!latestRunSession) {
    return {
      label: "Start validation check",
      description: `${projectFilesCount} saved file${projectFilesCount === 1 ? "" : "s"} from the ${operation.name} are ready. Start a validation check to confirm per-file parse results.`,
      cta: { label: "Start validation check", href: runHref },
      reason:
        "Task completed cleanly, no run session. Run sessions are user-initiated " +
        "(system-state.md §Execution Semantics Explicit absence of automation).",
      state: "ready",
    };
  }

  // ── 6. Completed cleanly, terminal run session (stopped) ─────────────────
  // Run session reached a terminal state (stopped). The project has files,
  // a completed task, and a finished run. The natural next step is to
  // keep iterating with the AI.
  return {
    label: "Continue building",
    description:
      "Submit a new scaffold, edit, or refactor prompt to continue the project.",
    cta: { label: "Continue building", href: aiHref },
    reason:
      "Task completed cleanly, files persisted, run session exists in terminal state. " +
      "Ready for the next iteration.",
    state: "ready",
  };
}

function nextActionOperation(kind: string): {
  label: string;
  name: string;
  sentenceName: string;
  runningDescription: string;
} {
  if (kind === "scaffold") {
    return {
      label: "Scaffold run",
      name: "scaffold run",
      sentenceName: "The scaffold run",
      runningDescription:
        "UDD is scaffolding a replacement file set. Files are checked before anything is saved.",
    };
  }

  if (kind === "refactor") {
    return {
      label: "Refactor run",
      name: "refactor run",
      sentenceName: "The refactor run",
      runningDescription:
        "UDD is drafting a refactor against the saved file set and checking it before anything is saved.",
    };
  }

  if (kind === "explain") {
    return {
      label: "Explain run",
      name: "explanation run",
      sentenceName: "The explanation run",
      runningDescription:
        "UDD is processing an explanation request. Any generated files still validate before save.",
    };
  }

  if (kind === "other") {
    return {
      label: "Generation run",
      name: "generation run",
      sentenceName: "The generation run",
      runningDescription:
        "UDD is generating output and checking it before anything is saved.",
    };
  }

  return {
    label: "Edit run",
    name: "edit run",
    sentenceName: "The edit run",
    runningDescription:
      "UDD is drafting changes against the saved file set and checking them before anything is saved.",
  };
}
