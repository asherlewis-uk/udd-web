import type { AITaskStatus } from "@/lib/types"

export type AITaskKind = "scaffold" | "edit" | "refactor" | "explain" | "other"

export type AITaskResultFile = {
  path: string
  content: string
  language?: string
}

/**
 * Structured output of an AI task. The shape is stable across providers
 * and consumed by the UI; providers (real or simulated) must produce this.
 */
export type AITaskResult = {
  type: "code_change"
  files: AITaskResultFile[]
  summary: string
}

export type AITaskEventKind = "started" | "progress" | "completed" | "failed"

export type AITaskEventPayload = {
  step?: string
  message?: string
  file_count?: number
  summary?: string
  error?: string
}

export type AITaskRow = {
  id: string
  project_id: string
  prompt_id: string | null
  kind: AITaskKind
  title: string
  status: AITaskStatus
  input: Record<string, unknown>
  output: AITaskResult | null
  error: string | null
  run_session_id: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export type AITaskEventRow = {
  id: string
  task_id: string
  kind: AITaskEventKind
  payload: AITaskEventPayload
  created_at: string
}

export type AITaskListItem = Pick<
  AITaskRow,
  "id" | "title" | "kind" | "status" | "created_at" | "finished_at"
>
