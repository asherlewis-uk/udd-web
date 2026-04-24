import { analyzeSource, type FileAnalysis } from "@/lib/validation/parser"
import { dependencyValidate } from "@/lib/validation/dependency"
import { projectShapeValidate } from "@/lib/validation/project-shape"
import { semanticValidate } from "@/lib/validation/semantic"
import { structuralValidate } from "@/lib/validation/structural"
import type {
  PackageJson,
  ValidationContext,
  ValidationFile,
  ValidationIssue,
  ValidationReport,
} from "@/lib/validation/types"

export type {
  PackageJson,
  Severity,
  ValidationContext,
  ValidationFile,
  ValidationIssue,
  ValidationIssueKind,
  ValidationReport,
} from "@/lib/validation/types"

/**
 * Entry point for the validation layer.
 *
 * Execution order:
 *   1. parse every file once (cached on `analyses`)
 *   2. structural: parse / empty / trivial / extension
 *   3. project-shape: package.json / Next.js layout / entrypoints
 *   4. dependency: bare imports vs package.json
 *   5. semantic + cross-file: internal imports, duplicate exports,
 *      client↔server boundaries, circular deps, case-sensitivity
 *
 * The order matters: structural failures surface first so the user sees the
 * most actionable error. Later layers still run (they skip broken files),
 * so one bad file doesn't hide systemic issues.
 *
 * Pure function — does no I/O. Safe to call from any context.
 */
export function validateProject(
  files: ValidationFile[],
  options?: { newPaths?: Set<string> },
): ValidationReport {
  const fileByPath = new Map<string, ValidationFile>()
  for (const f of files) fileByPath.set(f.path, f)

  // Parse package.json up front so every layer has access.
  const pkgFile = fileByPath.get("package.json")
  const packageJson = parsePackageJson(pkgFile?.content ?? null)

  const ctx: ValidationContext = {
    files,
    fileByPath,
    packageJson,
    newPaths: options?.newPaths,
  }

  const analyses = new Map<string, FileAnalysis>()
  for (const f of files) {
    analyses.set(f.path, analyzeSource(f.path, f.content))
  }

  const issues: ValidationIssue[] = []
  issues.push(...structuralValidate(ctx, analyses))
  issues.push(...projectShapeValidate(ctx, analyses))
  issues.push(...dependencyValidate(ctx, analyses))
  issues.push(...semanticValidate(ctx, analyses))

  return summarize(files.length, issues)
}

function summarize(fileCount: number, issues: ValidationIssue[]): ValidationReport {
  let blockingCount = 0
  let warningCount = 0
  let infoCount = 0
  for (const i of issues) {
    if (i.severity === "blocking") blockingCount += 1
    else if (i.severity === "warning") warningCount += 1
    else infoCount += 1
  }
  // Sort so blockers come first, then warnings, then info; stable within
  // each severity via original insertion order.
  issues.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))

  return {
    ok: blockingCount === 0,
    issues,
    fileCount,
    blockingCount,
    warningCount,
    infoCount,
  }
}

function severityRank(s: ValidationIssue["severity"]): number {
  if (s === "blocking") return 0
  if (s === "warning") return 1
  return 2
}

function parsePackageJson(content: string | null): PackageJson | null {
  if (!content) return null
  try {
    const parsed = JSON.parse(content) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as PackageJson
    }
    return null
  } catch {
    return null
  }
}

/**
 * Short human-readable summary suitable for ai_tasks.error when the task
 * is rejected by validation. Keeps detail out of the error column and in
 * per-issue events, so the UI stays readable at a glance.
 */
export function summarizeReport(report: ValidationReport): string {
  if (report.ok && report.issues.length === 0) return "Validation passed."
  const parts: string[] = []
  if (report.blockingCount > 0) parts.push(`${report.blockingCount} blocking`)
  if (report.warningCount > 0) parts.push(`${report.warningCount} warning`)
  if (report.infoCount > 0) parts.push(`${report.infoCount} info`)
  return `Validation ${report.ok ? "passed with notes" : "failed"} — ${parts.join(", ")}.`
}
