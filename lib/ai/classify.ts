import type { AITaskKind } from "@/lib/ai/types"

/**
 * Classify a prompt into a task kind + a concise title.
 * Pure function — used by the create action to seed ai_tasks.kind/title.
 */
export function classifyPrompt(prompt: string): { kind: AITaskKind; title: string } {
  const trimmed = prompt.trim()
  const firstLine = trimmed.split("\n")[0] ?? ""
  const title =
    firstLine.length > 72 ? `${firstLine.slice(0, 69)}...` : firstLine || "Untitled task"
  const lower = trimmed.toLowerCase()

  if (/^(scaffold|create|initialize|bootstrap|set up|new)\b/.test(lower)) {
    return { kind: "scaffold", title }
  }
  if (/^(refactor|rename|restructure|move|extract)\b/.test(lower)) {
    return { kind: "refactor", title }
  }
  if (/^(explain|describe|what|how|why)\b/.test(lower)) {
    return { kind: "explain", title }
  }
  return { kind: "edit", title }
}
