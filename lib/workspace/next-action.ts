/**
 * Deterministic next-action decision engine for the Agent Workspace.
 *
 * Pure function: no I/O, no async, no side effects.
 * Every branch is grounded in persisted project, task, file, provider,
 * validation, repair, and runtime state that the cockpit already loaded.
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
  preview_url?: string | null;
  started_at: string | null;
  created_at: string | null;
  stopped_at?: string | null;
  error?: string | null;
};

export type RuntimeSummary = {
  hasCleanValidationEvent: boolean;
  hasLivePreviewEvent: boolean;
  latestErrorMessage: string | null;
};

export type ProviderReadiness = {
  id: string;
  label: string;
  model: string;
  hasSavedCredential: boolean;
  hasEnvironmentCredential: boolean;
  ready: boolean;
};

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type NextActionCode =
  | "start_first_generation"
  | "validate_orphaned_files"
  | "task_queued"
  | "task_running"
  | "provider_blocked_for_generation"
  | "provider_blocked_for_repair"
  | "provider_blocked_for_retry"
  | "repair_failed_generation"
  | "retry_failed_generation"
  | "resume_after_cancel"
  | "completed_with_blocking_inconsistency"
  | "completed_without_files"
  | "runtime_in_progress"
  | "validation_stale"
  | "runtime_error_with_files"
  | "runtime_error_without_files"
  | "validation_stopped_incomplete"
  | "validate_warnings"
  | "validate_saved_files"
  | "continue_building";

export type NextActionCtaAction =
  | "local_prompt"
  | "start_validation"
  | "repair"
  | "retry"
  | "provider_credential"
  | "inspect_generation"
  | "inspect_runtime";

export type NextAction = {
  /** Stable state code for inspection and docs. */
  code: NextActionCode;
  /** Short headline: what should happen. */
  label: string;
  /** Compact cockpit copy. */
  description: string;
  /** The one CTA the user should take. */
  cta: {
    label: string;
    href: string;
    action: NextActionCtaAction;
    taskId?: string;
  };
  /** Plain-English reason grounded in loaded persisted state. */
  reason: string;
  /** Semantic bucket: drives visual tone in the panel. */
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
  latestProjectFileUpdatedAt?: string | null;
  latestRunSession: RunSession | null;
  latestRunSummary?: RuntimeSummary | null;
  providerReadiness?: ProviderReadiness | null;
}): NextAction {
  const {
    project,
    latestTask,
    validationSummary,
    projectFilesCount,
    latestProjectFileUpdatedAt = null,
    latestRunSession,
    latestRunSummary = null,
    providerReadiness = null,
  } = input;
  const cockpitHref = `/projects/${project.id}`;
  const aiHref = `${cockpitHref}/ai`;
  const runHref = `${cockpitHref}/run`;
  const taskHref = latestTask ? `${aiHref}?task=${latestTask.id}` : aiHref;

  // No task row, but persisted files exist. Since runtime validation reads
  // project_files directly, validate those files before recommending more AI.
  if (!latestTask && projectFilesCount > 0) {
    return startValidationAction({
      code: "validate_orphaned_files",
      href: runHref,
      reason:
        "project_files contains saved files, but there is no ai_tasks row to explain their last generation. The runtime can validate those files and start a local preview if their shape supports it.",
      description: `${projectFilesCount} saved file${plural(projectFilesCount)} exist without generation history. Start a local preview check before continuing.`,
    });
  }

  // No task and no files. The next useful generation action is the first
  // prompt, but only if the active provider can actually authenticate.
  if (!latestTask) {
    const providerBlock = providerBlockedAction({
      code: "provider_blocked_for_generation",
      providerReadiness,
      href: cockpitHref,
      purpose: "start the first generation run",
    });
    if (providerBlock) return providerBlock;

    return {
      code: "start_first_generation",
      label: "Start a generation run",
      description:
        project.status === "draft"
          ? "This draft has no saved files yet. Describe the first scaffold or change and UDD will draft saved files."
          : "No generation runs yet. Describe the first scaffold or change and UDD will draft saved files.",
      cta: {
        label: "Use prompt box",
        href: cockpitHref,
        action: "local_prompt",
      },
      reason: `Project status is ${project.status}, ai_tasks has no latest row, and project_files is empty. Work must be started by a user prompt.`,
      state: "idle",
    };
  }

  const operation = nextActionOperation(latestTask.kind);

  if (latestTask.status === "pending") {
    return {
      code: "task_queued",
      label: `${operation.label} queued`,
      description: `${operation.sentenceName} is queued and will start drafting files shortly.`,
      cta: {
        label: "Inspect generation run",
        href: taskHref,
        action: "inspect_generation",
        taskId: latestTask.id,
      },
      reason:
        "The latest ai_tasks row is pending. The after() callback has been scheduled, but runAITask has not claimed the task yet.",
      state: "in_progress",
    };
  }

  if (latestTask.status === "running") {
    return {
      code: "task_running",
      label: `${operation.label} in progress`,
      description: operation.runningDescription,
      cta: {
        label: "Inspect generation run",
        href: taskHref,
        action: "inspect_generation",
        taskId: latestTask.id,
      },
      reason:
        "The latest ai_tasks row is running. Generated output is not saved until validation and persistence both pass.",
      state: "in_progress",
    };
  }

  if (latestTask.status === "failed") {
    const blockingCount = validationSummary?.blocking_count ?? 0;
    const repairAttempt = isRepairTaskInput(latestTask.input);

    if (blockingCount > 0) {
      const providerBlock = providerBlockedAction({
        code: "provider_blocked_for_repair",
        providerReadiness,
        href: cockpitHref,
        purpose: "queue an evidence-backed repair run",
      });
      if (providerBlock) return providerBlock;

      return {
        code: "repair_failed_generation",
        label: repairAttempt
          ? "Repair attempt failed"
          : "Repair failed generation run",
        description: `The ${operation.name} failed validation with ${blockingCount} blocking issue${plural(blockingCount)}. Use the recorded validation evidence to queue a repair run.`,
        cta: {
          label: "Repair with evidence",
          href: cockpitHref,
          action: "repair",
          taskId: latestTask.id,
        },
        reason:
          "The failed ai_tasks row has a validation summary with blocking issues. repairFailedTask can use stored validation events and staged output from that same task.",
        state: "blocked",
      };
    }

    const providerBlock = providerBlockedAction({
      code: "provider_blocked_for_retry",
      providerReadiness,
      href: cockpitHref,
      purpose: "retry the failed generation run",
    });
    if (providerBlock) return providerBlock;

    return {
      code: "retry_failed_generation",
      label: "Retry failed generation run",
      description: `The last ${operation.name} failed without blocking validation evidence. Retry the same recorded work item, or inspect the details first.`,
      cta: {
        label: "Retry run",
        href: cockpitHref,
        action: "retry",
        taskId: latestTask.id,
      },
      reason:
        "The latest ai_tasks row is failed, but no blocking validation summary is recorded. retryFailedTask is the implemented recovery path for failed tasks.",
      state: "blocked",
    };
  }

  if (latestTask.status === "cancelled") {
    const providerBlock = providerBlockedAction({
      code: "provider_blocked_for_generation",
      providerReadiness,
      href: cockpitHref,
      purpose: "submit another generation prompt",
    });
    if (providerBlock) return providerBlock;

    return {
      code: "resume_after_cancel",
      label: "Resume generation",
      description:
        "The last generation run was cancelled. Submit a new prompt to continue.",
      cta: {
        label: "Use prompt box",
        href: cockpitHref,
        action: "local_prompt",
      },
      reason:
        "The latest ai_tasks row is cancelled. There is no automatic retry, so recovery starts from an explicit user prompt.",
      state: "idle",
    };
  }

  // From here, latestTask.status === "completed". In normal operation this
  // means validateProject passed and persistFiles returned successfully.
  const blockingOnCompleted = validationSummary?.blocking_count ?? 0;
  if (blockingOnCompleted > 0) {
    return {
      code: "completed_with_blocking_inconsistency",
      label: "Unexpected state",
      description:
        "A saved generation run has blocking validation issues recorded. This should not occur.",
      cta: {
        label: "Inspect generation run",
        href: taskHref,
        action: "inspect_generation",
        taskId: latestTask.id,
      },
      reason:
        "The latest ai_tasks row is completed, but its validation summary reports blocking issues. Completed tasks should only exist after blocking validation passed.",
      state: "blocked",
    };
  }

  if (projectFilesCount === 0) {
    return {
      code: "completed_without_files",
      label: "Saved files missing",
      description:
        "The last generation run finished but no saved files were found. Inspect the work item before continuing.",
      cta: {
        label: "Inspect generation run",
        href: taskHref,
        action: "inspect_generation",
        taskId: latestTask.id,
      },
      reason:
        "The latest ai_tasks row is completed, but project_files has count 0. Completed should imply persisted saved files.",
      state: "blocked",
    };
  }

  if (
    latestRunSession?.status === "starting" ||
    latestRunSession?.status === "stopping"
  ) {
    return {
      code: "runtime_in_progress",
      label:
        latestRunSession.status === "stopping"
          ? "Stopping local preview"
          : "Starting local preview",
      description:
        latestRunSession.status === "stopping"
          ? "UDD is stopping the local preview process and cleaning up its temporary workspace."
          : "UDD is validating saved files and starting a bounded local preview when the project shape supports it.",
      cta: {
        label: "Inspect run",
        href: runHref,
        action: "inspect_runtime",
      },
      reason: `The latest run_sessions row is ${latestRunSession.status}. Runtime work includes parser validation, temp workspace assembly, and a local preview process only after validation passes.`,
      state: "in_progress",
    };
  }

  const runIsStale = isRunStale({
    latestRunSession,
    latestTask,
    latestProjectFileUpdatedAt,
  });

  if (latestRunSession && runIsStale) {
    return startValidationAction({
      code: "validation_stale",
      href: runHref,
      reason:
        "The latest run session was recorded before the newest saved file or completed task. It does not represent the current project_files state.",
      description: `${projectFilesCount} saved file${plural(projectFilesCount)} changed after the last run. Start a fresh local preview check.`,
    });
  }

  if (latestRunSession?.status === "error") {
    if (projectFilesCount === 0) {
      const providerBlock = providerBlockedAction({
        code: "provider_blocked_for_generation",
        providerReadiness,
        href: cockpitHref,
        purpose: "generate files after the failed validation check",
      });
      if (providerBlock) return providerBlock;

      return {
        code: "runtime_error_without_files",
        label: "Start a generation run",
        description:
          "The last run found no saved files to validate or preview. Describe a scaffold or edit to create saved files first.",
        cta: {
          label: "Use prompt box",
          href: cockpitHref,
          action: "local_prompt",
        },
        reason:
          "The latest run_sessions row is error and project_files is empty, so another runtime start cannot produce useful output until files exist.",
        state: "blocked",
      };
    }

    return {
      code: "runtime_error_with_files",
      label: "Review run output",
      description:
        "The last run failed during validation, workspace setup, startup, or runtime. Inspect the recorded output, then submit an edit prompt here if files need changes.",
      cta: {
        label: "Inspect run",
        href: runHref,
        action: "inspect_runtime",
      },
      reason: latestRunSummary?.latestErrorMessage
        ? `The latest run_sessions row is error and recorded: ${latestRunSummary.latestErrorMessage}`
        : "The latest run_sessions row is error. Runtime recovery starts by inspecting persisted run_events.",
      state: "blocked",
    };
  }

  if (
    latestRunSession?.status === "stopped" &&
    !latestRunSummary?.hasCleanValidationEvent
  ) {
    return startValidationAction({
      code: "validation_stopped_incomplete",
      href: runHref,
      reason:
        "The latest run session was stopped and has no persisted clean-validation or preview-ready event. Current files still need a runtime check.",
      description:
        "The last run stopped before a clean preview result was recorded. Start another local preview check for the saved files.",
    });
  }

  const warnings = validationSummary?.warning_count ?? 0;
  if (warnings > 0 && !latestRunSession) {
    return startValidationAction({
      code: "validate_warnings",
      href: runHref,
      reason: `The completed task recorded ${warnings} validation warning${plural(warnings)}. Warnings do not block save, but runtime validation and local preview startup can inspect the saved files.`,
      description: `The ${operation.name} saved files with ${warnings} warning${plural(warnings)}. Start a local preview check to review real runtime output.`,
    });
  }

  if (!latestRunSession) {
    return startValidationAction({
      code: "validate_saved_files",
      href: runHref,
      reason:
        "The latest task completed and project_files has saved files, but no run_sessions row exists for this project.",
      description: `${projectFilesCount} saved file${plural(projectFilesCount)} from the ${operation.name} are ready. Start a local preview check to validate and run them when supported.`,
    });
  }

  const providerBlock = providerBlockedAction({
    code: "provider_blocked_for_generation",
    providerReadiness,
    href: cockpitHref,
    purpose: "continue building with another generation prompt",
  });
  if (providerBlock) return providerBlock;

  return {
    code: "continue_building",
    label: "Continue building",
    description:
      latestRunSession.status === "running" && latestRunSession.preview_url
        ? `${projectFilesCount} saved file${plural(projectFilesCount)} are running in a local preview. Describe the next change to keep going.`
        : latestRunSummary?.hasLivePreviewEvent ||
            latestRunSummary?.hasCleanValidationEvent
          ? `${projectFilesCount} saved file${plural(projectFilesCount)} passed the runtime check. Describe the next change to keep going.`
          : "Submit a new scaffold, edit, or refactor prompt to continue the project.",
    cta: { label: "Use prompt box", href: cockpitHref, action: "local_prompt" },
    reason:
      "The latest task completed, saved files exist, and no newer unvalidated file state is detected. The next generation step must be user-initiated.",
    state: "ready",
  };
}

function startValidationAction(args: {
  code:
    | "validate_orphaned_files"
    | "validation_stale"
    | "validation_stopped_incomplete"
    | "validate_warnings"
    | "validate_saved_files";
  href: string;
  reason: string;
  description: string;
}): NextAction {
  return {
    code: args.code,
    label: "Start local preview",
    description: args.description,
    cta: {
      label: "Start local preview",
      href: args.href,
      action: "start_validation",
    },
    reason: args.reason,
    state: "ready",
  };
}

function providerBlockedAction(args: {
  code:
    | "provider_blocked_for_generation"
    | "provider_blocked_for_repair"
    | "provider_blocked_for_retry";
  providerReadiness: ProviderReadiness | null | undefined;
  href: string;
  purpose: string;
}): NextAction | null {
  const provider = args.providerReadiness;
  if (!provider || provider.ready) return null;

  return {
    code: args.code,
    label: "Add provider credential",
    description: `${provider.label} is selected for new generation work, but no saved credential or environment fallback is available. Add a credential below before trying to ${args.purpose}.`,
    cta: {
      label: "Use provider credential field below",
      href: args.href,
      action: "provider_credential",
    },
    reason: `Provider readiness is blocked: selected provider=${provider.id}, saved credential=${provider.hasSavedCredential}, environment fallback=${provider.hasEnvironmentCredential}.`,
    state: "blocked",
  };
}

function isRunStale(input: {
  latestRunSession: RunSession | null;
  latestTask: AITask;
  latestProjectFileUpdatedAt: string | null;
}): boolean {
  const { latestRunSession, latestTask, latestProjectFileUpdatedAt } = input;
  if (!latestRunSession) return false;

  const latestPersistedAt = latestTimestamp([
    latestProjectFileUpdatedAt,
    latestTask.finished_at,
  ]);
  const latestRunRecordedAt = latestTimestamp([
    latestRunSession.started_at,
    latestRunSession.created_at,
  ]);
  if (!latestPersistedAt || !latestRunRecordedAt) return false;

  return Date.parse(latestRunRecordedAt) < Date.parse(latestPersistedAt);
}

function latestTimestamp(
  values: Array<string | null | undefined>,
): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!latest || Date.parse(value) > Date.parse(latest)) latest = value;
  }
  return latest;
}

function plural(count: number): string {
  return count === 1 ? "" : "s";
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
