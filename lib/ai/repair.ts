import type {
  AITaskKind,
  AITaskResultFile,
  AITaskValidationSeverity,
} from "@/lib/ai/types";

const MAX_REPAIR_ISSUES_IN_PROMPT = 20;
const MAX_REPAIR_FILES_IN_PROMPT = 8;

export type RepairValidationSummary = {
  message: string;
  blocking_count: number;
  warning_count: number;
  info_count: number;
};

export type RepairValidationIssue = {
  severity: AITaskValidationSeverity;
  issue_kind?: string;
  file_path?: string;
  line?: number;
  message: string;
  suggestion?: string;
};

export type RepairTaskMetadata = {
  source_task_id: string;
  source_task_kind: AITaskKind;
  source_task_title: string;
  source_task_error: string | null;
  validation_summary: RepairValidationSummary;
  blocking_issues: RepairValidationIssue[];
  generated_file_paths: string[];
};

export type RepairTaskInput = {
  prompt: string;
  display_prompt: string;
  repair: RepairTaskMetadata;
};

export function repairTaskKindFor(sourceKind: AITaskKind): AITaskKind {
  return sourceKind === "scaffold" ? "scaffold" : "edit";
}

export function buildRepairTaskTitle(sourceTitle: string): string {
  const title = `Repair: ${sourceTitle || "failed generation run"}`;
  return title.length > 72 ? `${title.slice(0, 69)}...` : title;
}

export function buildRepairDisplayPrompt(sourceTitle: string): string {
  return `Repair validation failure from "${sourceTitle || "failed generation run"}"`;
}

export function getRepairMetadata(input: unknown): RepairTaskMetadata | null {
  if (!isRecord(input)) return null;
  const repair = input.repair;
  if (!isRecord(repair)) return null;
  if (typeof repair.source_task_id !== "string") return null;
  if (typeof repair.source_task_kind !== "string") return null;
  if (typeof repair.source_task_title !== "string") return null;
  if (!isRecord(repair.validation_summary)) return null;
  if (!Array.isArray(repair.blocking_issues)) return null;
  if (!Array.isArray(repair.generated_file_paths)) return null;

  return repair as RepairTaskMetadata;
}

export function isRepairTaskInput(input: unknown): input is RepairTaskInput {
  if (!isRecord(input)) return false;
  return (
    typeof input.prompt === "string" &&
    typeof input.display_prompt === "string" &&
    getRepairMetadata(input) !== null
  );
}

export function getRepairDisplayPrompt(input: unknown): string | null {
  if (!isRepairTaskInput(input)) return null;
  return input.display_prompt.trim() || null;
}

export function buildRepairPrompt(args: {
  sourceTaskTitle: string;
  sourceTaskKind: AITaskKind;
  originalPrompt: string | null;
  taskError: string | null;
  validationSummary: RepairValidationSummary;
  blockingIssues: RepairValidationIssue[];
  generatedFiles: AITaskResultFile[];
}): string {
  const kindInstruction =
    args.sourceTaskKind === "scaffold"
      ? "This repair keeps scaffold semantics: return a complete valid replacement file set, not just one patched file."
      : "This repair is checked against the existing saved file set: return full corrected contents for each file that should be written.";

  return [
    "Repair the failed generation output using the stored validation evidence below.",
    "",
    "Important constraints:",
    "- The failed output was not saved to project files.",
    "- Treat the validation issues as the source of truth for the repair.",
    "- Return full corrected file contents only for files that should be written.",
    "- Do not claim success; validation and persistence happen after this response.",
    `- ${kindInstruction}`,
    "",
    `Failed work item: ${args.sourceTaskTitle}`,
    `Original kind: ${args.sourceTaskKind}`,
    args.originalPrompt
      ? `Original user request: ${args.originalPrompt}`
      : null,
    args.taskError ? `Recorded failure: ${args.taskError}` : null,
    "",
    "Validation summary:",
    `- ${args.validationSummary.message || "Validation failed."}`,
    `- Blocking: ${args.validationSummary.blocking_count}`,
    `- Warnings: ${args.validationSummary.warning_count}`,
    `- Info: ${args.validationSummary.info_count}`,
    "",
    "Blocking validation evidence:",
    formatIssues(args.blockingIssues),
    "",
    "Failed generated files to repair:",
    formatGeneratedFiles(args.generatedFiles),
  ]
    .filter((part): part is string => typeof part === "string")
    .join("\n");
}

function formatIssues(issues: RepairValidationIssue[]): string {
  const visibleIssues = issues.slice(0, MAX_REPAIR_ISSUES_IN_PROMPT);
  if (visibleIssues.length === 0) return "- No blocking issues recorded.";

  const lines = visibleIssues.map((issue, index) => {
    const location = issue.file_path
      ? `${issue.file_path}${issue.line ? `:${issue.line}` : ""}`
      : "project";
    return [
      `${index + 1}. ${issue.issue_kind ?? "validation_issue"} at ${location}`,
      `   Message: ${issue.message}`,
      issue.suggestion ? `   Suggestion: ${issue.suggestion}` : null,
    ]
      .filter((line): line is string => typeof line === "string")
      .join("\n");
  });

  if (issues.length > visibleIssues.length) {
    lines.push(
      `... and ${issues.length - visibleIssues.length} more blocking issue(s).`,
    );
  }

  return lines.join("\n");
}

function formatGeneratedFiles(files: AITaskResultFile[]): string {
  const visibleFiles = files.slice(0, MAX_REPAIR_FILES_IN_PROMPT);
  if (visibleFiles.length === 0) return "No generated files were recorded.";

  const sections = visibleFiles.map((file) =>
    [
      `Path: ${file.path}`,
      `Language: ${file.language ?? "text"}`,
      "Content:",
      `\`\`\`${file.language ?? ""}`,
      file.content,
      "```",
    ].join("\n"),
  );

  if (files.length > visibleFiles.length) {
    sections.push(
      `... and ${files.length - visibleFiles.length} more generated file(s).`,
    );
  }

  return sections.join("\n\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
