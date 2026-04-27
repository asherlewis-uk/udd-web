import type { AITaskStatus } from "@/lib/types";

export type AITaskKind = "scaffold" | "edit" | "refactor" | "explain" | "other";

export type AITaskResultFile = {
  path: string;
  content: string;
  language?: string;
};

/**
 * Structured output of an AI task. The shape is stable across providers
 * and consumed by the UI; every generation provider must produce this.
 */
export type AITaskResult = {
  type: "code_change";
  files: AITaskResultFile[];
  summary: string;
};

export type AITaskEventKind =
  | "started"
  | "progress"
  | "completed"
  | "failed"
  | "validation";

export type AITaskValidationSeverity = "blocking" | "warning" | "info";

export type AITaskEventPayload = {
  step?: string;
  message?: string;
  file_count?: number;
  summary?: string;
  error?: string;
  /** Validation event fields (set when kind === "validation"). */
  severity?: AITaskValidationSeverity;
  issue_kind?: string;
  file_path?: string;
  line?: number;
  suggestion?: string;
  blocking_count?: number;
  warning_count?: number;
  info_count?: number;
};

export type AITaskRow = {
  id: string;
  project_id: string;
  prompt_id: string | null;
  kind: AITaskKind;
  title: string;
  status: AITaskStatus;
  input: Record<string, unknown>;
  output: AITaskResult | null;
  error: string | null;
  run_session_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type AITaskEventRow = {
  id: string;
  task_id: string;
  kind: AITaskEventKind;
  payload: AITaskEventPayload;
  created_at: string;
};

export type AITaskListItem = Pick<
  AITaskRow,
  "id" | "title" | "kind" | "status" | "created_at" | "finished_at"
>;
