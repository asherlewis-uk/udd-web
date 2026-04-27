"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runAITask } from "@/lib/ai/service";
import { classifyPrompt } from "@/lib/ai/classify";

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
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
  redirect(`/projects/${projectId}/ai?task=${fresh.id}`);
}
