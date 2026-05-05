"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-session";
import { createClient } from "@/lib/db/supabase-legacy";
import { runAITask } from "@/lib/ai/service";
import { classifyPrompt } from "@/lib/ai/classify";
import {
  buildRepairDisplayPrompt,
  buildRepairPrompt,
  buildRepairTaskTitle,
  repairTaskKindFor,
  type RepairValidationIssue,
  type RepairValidationSummary,
} from "@/lib/ai/repair";
import type {
  AITaskEventPayload,
  AITaskKind,
  AITaskResult,
} from "@/lib/ai/types";

async function getUser() {
  const supabase = await createClient();
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  const user = session.user;
  return { supabase, user };
}

/**
 * Hard cap on simultaneously-live work items per user. Both initial creation
 * and retry-from-failed go through this. The reaper in lib/ai/service
 * terminalizes stalled work after 10 minutes, so this limit is
 * self-healing — a dead task will be cleared by the next visit to the AI
 * tab and the user will regain a slot without operator intervention.
 */
const MAX_LIVE_TASKS_PER_USER = 3;

async function enforceConcurrencyLimit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerId: string,
): Promise<void> {
  const { count, error } = await supabase
    .from("ai_tasks")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .in("status", ["pending", "running"]);

  if (error) throw new Error(error.message);
  if ((count ?? 0) >= MAX_LIVE_TASKS_PER_USER) {
    throw new Error(
      `You already have ${count} generation runs in progress. Wait for them to finish (or cancel one) before starting another.`,
    );
  }
}

/**
 * Create a prompt + an ai_task in 'pending' state, then schedule background
 * processing via `after()`. By default, redirects to the AI tab focused on
 * the new task; the cockpit can request a same-page return with redirect_to.
 */
export async function createAITask(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "").trim();
  const prompt = String(formData.get("prompt") ?? "").trim();
  const redirectTo = String(formData.get("redirect_to") ?? "").trim();
  if (!projectId) throw new Error("Missing project id");
  if (!prompt) throw new Error("Prompt is required");
  if (prompt.length > 4000)
    throw new Error("Prompt is too long (max 4000 chars)");

  const { supabase, user } = await getUser();

  // 0. Rate-limit: reject if the user has too many live tasks. Runs first
  //    so we don't create a prompt row we'll never process.
  await enforceConcurrencyLimit(supabase, user.id);

  // 1. Persist the prompt.
  const { data: promptRow, error: promptError } = await supabase
    .from("prompts")
    .insert({
      project_id: projectId,
      owner_id: user.id,
      body: prompt,
    })
    .select("id")
    .single();
  if (promptError) throw new Error(promptError.message);

  // 2. Create the task in pending state.
  const { kind, title } = classifyPrompt(prompt);
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
    .single();
  if (taskError) throw new Error(taskError.message);

  // 3. Touch the parent project so activity surfaces on the list immediately.
  await supabase
    .from("projects")
    .update({ status: "active", last_opened_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("owner_id", user.id);

  // 4. Schedule processing after the response is flushed so the UI
  //    returns immediately and the real model call runs in the background.
  after(async () => {
    await runAITask(taskRow.id);
  });

  revalidatePath(`/projects/${projectId}/ai`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  redirect(
    redirectTo === `/projects/${projectId}`
      ? redirectTo
      : `/projects/${projectId}/ai?task=${taskRow.id}`,
  );
}

/**
 * Manually retry / run a task still in 'pending'. Useful if a previous
 * `after()` invocation didn't complete (e.g. server restart).
 */
export async function retryPendingTask(taskId: string, projectId: string) {
  const { supabase, user } = await getUser();
  const { data } = await supabase
    .from("ai_tasks")
    .select("id, status")
    .eq("id", taskId)
    .eq("owner_id", user.id)
    .single();
  if (!data || data.status !== "pending") return;

  after(async () => {
    await runAITask(taskId);
  });

  revalidatePath(`/projects/${projectId}/ai`);
}

/**
 * Cancel a task that is still pending or running. Flips status to
 * 'cancelled'; any in-flight driver will detect this on its next gated
 * update (stage / finalize) and short-circuit without emitting a
 * spurious `completed` event.
 */
export async function cancelAITask(formData: FormData) {
  const taskId = String(formData.get("task_id") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "").trim();
  if (!taskId || !projectId) throw new Error("Missing task id or project id");

  const { supabase, user } = await getUser();

  await supabase
    .from("ai_tasks")
    .update({
      status: "cancelled",
      error: "Cancelled by user.",
      finished_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("owner_id", user.id)
    .in("status", ["pending", "running"]);

  revalidatePath(`/projects/${projectId}/ai`);
}

/**
 * Delete a task that is no longer live. Allowed only for terminal states
 * (completed / failed / cancelled) so we never delete a task while a
 * driver may still be writing to it. `ai_task_events` cascades via FK;
 * the parent `prompts` row is preserved.
 */
export async function deleteAITask(formData: FormData) {
  const taskId = String(formData.get("task_id") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "").trim();
  if (!taskId || !projectId) throw new Error("Missing task id or project id");

  const { supabase, user } = await getUser();

  await supabase
    .from("ai_tasks")
    .delete()
    .eq("id", taskId)
    .eq("owner_id", user.id)
    .in("status", ["completed", "failed", "cancelled"]);

  revalidatePath(`/projects/${projectId}/ai`);
  redirect(`/projects/${projectId}/ai`);
}

/**
 * Create a fresh pending task from a failed / cancelled one. Copies the
 * original prompt_id / kind / title / input so the new task carries the
 * same history. The old task is kept intact for audit; the user can
 * delete it separately if they want.
 */
export async function retryFailedTask(formData: FormData) {
  const taskId = String(formData.get("task_id") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "").trim();
  const redirectTo = String(formData.get("redirect_to") ?? "").trim();
  if (!taskId || !projectId) throw new Error("Missing task id or project id");

  const { supabase, user } = await getUser();

  // Rate-limit retries for the same reason as creation — a user with many
  // failed tasks could otherwise queue them all at once.
  await enforceConcurrencyLimit(supabase, user.id);

  const { data: original } = await supabase
    .from("ai_tasks")
    .select("id, project_id, prompt_id, kind, title, input, status")
    .eq("id", taskId)
    .eq("owner_id", user.id)
    .single();
  if (!original) throw new Error("Task not found");
  if (original.status !== "failed" && original.status !== "cancelled") {
    throw new Error("Only failed or cancelled tasks can be retried.");
  }

  const { data: fresh, error: insertError } = await supabase
    .from("ai_tasks")
    .insert({
      project_id: original.project_id,
      owner_id: user.id,
      prompt_id: original.prompt_id,
      kind: original.kind,
      title: original.title,
      status: "pending",
      input: original.input,
    })
    .select("id")
    .single();
  if (insertError || !fresh) {
    throw new Error(insertError?.message ?? "Failed to create retry task");
  }

  after(async () => {
    await runAITask(fresh.id);
  });

  revalidatePath(`/projects/${projectId}/ai`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  redirect(
    redirectTo === `/projects/${projectId}`
      ? redirectTo
      : `/projects/${projectId}/ai?task=${fresh.id}`,
  );
}

/**
 * Create a fresh repair task from a failed validation run. Unlike a plain
 * retry, this uses the failed task's stored validation events and staged
 * model output as the repair prompt evidence. The resulting task still flows
 * through runAITask, so validateProject remains the persistence gate.
 */
export async function repairFailedTask(formData: FormData) {
  const taskId = String(formData.get("task_id") ?? "").trim();
  const projectId = String(formData.get("project_id") ?? "").trim();
  const redirectTo = String(formData.get("redirect_to") ?? "").trim();
  if (!taskId || !projectId) throw new Error("Missing task id or project id");

  const { supabase, user } = await getUser();

  await enforceConcurrencyLimit(supabase, user.id);

  const { data: original, error: originalError } = await supabase
    .from("ai_tasks")
    .select("id, project_id, kind, title, status, input, output, error")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .single();
  if (originalError || !original) {
    throw new Error(originalError?.message ?? "Task not found");
  }
  if (original.status !== "failed") {
    throw new Error("Only failed tasks can be repaired.");
  }

  const { data: validationEvents, error: eventsError } = await supabase
    .from("ai_task_events")
    .select("payload")
    .eq("task_id", taskId)
    .eq("owner_id", user.id)
    .eq("kind", "validation")
    .order("created_at", { ascending: true });
  if (eventsError) throw new Error(eventsError.message);

  const evidence = extractRepairEvidence(
    (validationEvents ?? []) as ValidationEventRow[],
  );
  if (evidence.blockingIssues.length === 0) {
    throw new Error(
      "Only failed validation runs with blocking evidence can be repaired.",
    );
  }

  const originalOutput = normalizeTaskOutput(original.output);
  if (!originalOutput) {
    throw new Error(
      "This failed validation run has no staged generated output to repair.",
    );
  }

  const sourceKind = original.kind as AITaskKind;
  const sourceTitle = String(original.title ?? "failed generation run");
  const originalInput = isRecord(original.input) ? original.input : {};
  const originalPrompt =
    typeof originalInput.display_prompt === "string"
      ? originalInput.display_prompt
      : typeof originalInput.prompt === "string"
        ? originalInput.prompt
        : null;
  const repairPrompt = buildRepairPrompt({
    sourceTaskTitle: sourceTitle,
    sourceTaskKind: sourceKind,
    originalPrompt,
    taskError: typeof original.error === "string" ? original.error : null,
    validationSummary: evidence.summary,
    blockingIssues: evidence.blockingIssues,
    generatedFiles: originalOutput.files,
  });
  const displayPrompt = buildRepairDisplayPrompt(sourceTitle);
  const repairKind = repairTaskKindFor(sourceKind);

  const { data: fresh, error: insertError } = await supabase
    .from("ai_tasks")
    .insert({
      project_id: projectId,
      owner_id: user.id,
      kind: repairKind,
      title: buildRepairTaskTitle(sourceTitle),
      status: "pending",
      input: {
        prompt: repairPrompt,
        display_prompt: displayPrompt,
        repair: {
          source_task_id: taskId,
          source_task_kind: sourceKind,
          source_task_title: sourceTitle,
          source_task_error:
            typeof original.error === "string" ? original.error : null,
          validation_summary: evidence.summary,
          blocking_issues: evidence.blockingIssues,
          generated_file_paths: originalOutput.files.map((file) => file.path),
        },
      },
    })
    .select("id")
    .single();
  if (insertError || !fresh) {
    throw new Error(insertError?.message ?? "Failed to create repair task");
  }

  await supabase
    .from("projects")
    .update({
      status: "active",
      last_opened_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("owner_id", user.id);

  after(async () => {
    await runAITask(fresh.id);
  });

  revalidatePath(`/projects/${projectId}/ai`);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  redirect(
    redirectTo === `/projects/${projectId}`
      ? redirectTo
      : `/projects/${projectId}/ai?task=${fresh.id}`,
  );
}

type ValidationEventRow = {
  payload: AITaskEventPayload;
};

function extractRepairEvidence(events: ValidationEventRow[]): {
  summary: RepairValidationSummary;
  blockingIssues: RepairValidationIssue[];
} {
  const summaryPayload = events.find(
    (event) => event.payload.step === "summary",
  )?.payload;
  const blockingIssues = events
    .map((event): RepairValidationIssue | null => {
      const payload = event.payload;
      if (payload.severity !== "blocking" || !payload.message) return null;
      return {
        severity: "blocking",
        issue_kind: payload.issue_kind,
        file_path: payload.file_path,
        line: payload.line,
        message: payload.message,
        suggestion: payload.suggestion,
      };
    })
    .filter((issue): issue is RepairValidationIssue => issue !== null);

  return {
    summary: {
      message: summaryPayload?.message ?? "Validation failed.",
      blocking_count: summaryPayload?.blocking_count ?? blockingIssues.length,
      warning_count: summaryPayload?.warning_count ?? 0,
      info_count: summaryPayload?.info_count ?? 0,
    },
    blockingIssues,
  };
}

function normalizeTaskOutput(output: unknown): AITaskResult | null {
  if (!isRecord(output)) return null;
  if (!Array.isArray(output.files)) return null;
  if (typeof output.summary !== "string") return null;

  const files = output.files
    .map((file): AITaskResult["files"][number] | null => {
      if (!isRecord(file)) return null;
      if (typeof file.path !== "string" || typeof file.content !== "string") {
        return null;
      }
      return {
        path: file.path,
        content: file.content,
        language: typeof file.language === "string" ? file.language : undefined,
      };
    })
    .filter((file): file is AITaskResult["files"][number] => file !== null);

  if (files.length === 0) return null;
  return {
    type: "code_change",
    summary: output.summary,
    files,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
