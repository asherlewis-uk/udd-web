import { analyzeSource, extensionOf, type FileAnalysis } from "@/lib/validation/parser"
import type { ValidationContext, ValidationIssue } from "@/lib/validation/types"

/**
 * Layer 1 — Structural validation.
 *
 *  - every file parses (JSON / babel)
 *  - no empty or trivial files
 *  - extension / content alignment (e.g. a `.ts` that contains JSX should
 *    have been `.tsx`; a `.json` that isn't parseable JSON is a hard fail)
 *
 * Parse errors are blocking; empty/trivial and extension mismatches are
 * warnings so the AI can still ship the broader change without being held
 * up by a stub file the user may have intended.
 */
export function structuralValidate(
  ctx: ValidationContext,
  analyses: Map<string, FileAnalysis>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  for (const file of ctx.files) {
    let analysis = analyses.get(file.path)
    if (!analysis) {
      analysis = analyzeSource(file.path, file.content)
      analyses.set(file.path, analysis)
    }

    if (analysis.kind === "json") {
      if (!analysis.ok) {
        issues.push({
          severity: "blocking",
          kind: "invalid_json",
          path: file.path,
          message: `Invalid JSON in ${file.path}: ${analysis.parseError.message}`,
          suggestion: "Run the file through a JSON formatter to locate the syntax error.",
        })
        continue
      }
      if (analysis.isTrivial && !looksLikeTemplate(file.path)) {
        issues.push({
          severity: "warning",
          kind: "trivial_file",
          path: file.path,
          message: `JSON file ${file.path} is empty or {} — likely unintended.`,
        })
      }
      continue
    }

    if (analysis.kind === "js") {
      if (!analysis.ok) {
        issues.push({
          severity: "blocking",
          kind: "parse_error",
          path: file.path,
          line: analysis.parseError.line,
          column: analysis.parseError.column,
          message: `Parse error in ${file.path}${
            analysis.parseError.line ? `:${analysis.parseError.line}` : ""
          }: ${analysis.parseError.message}`,
          suggestion: "Fix the syntax error before this file can be used.",
        })
        continue
      }

      if (analysis.byteLength === 0) {
        issues.push({
          severity: "blocking",
          kind: "empty_file",
          path: file.path,
          message: `${file.path} is empty. Remove it or add real contents.`,
        })
        continue
      }

      if (analysis.isTrivial) {
        issues.push({
          severity: "warning",
          kind: "trivial_file",
          path: file.path,
          message: `${file.path} has no meaningful content (only whitespace or \`export {}\`).`,
          suggestion: "Add actual implementation or drop the file.",
        })
      }

      const ext = extensionOf(file.path)
      if (ext === "ts" && analysis.hasJsx) {
        issues.push({
          severity: "warning",
          kind: "extension_mismatch",
          path: file.path,
          message: `${file.path} contains JSX but uses a .ts extension.`,
          suggestion: "Rename to .tsx so the JSX parses under standard TypeScript tooling.",
        })
      }

      continue
    }

    // Plain-text / unknown file
    if (analysis.kind === "text" && analysis.byteLength === 0) {
      issues.push({
        severity: "warning",
        kind: "empty_file",
        path: file.path,
        message: `${file.path} is empty.`,
      })
    }
  }

  return issues
}

function looksLikeTemplate(path: string): boolean {
  // Some intentionally-empty JSON files are normal (tsconfig references,
  // tsbuildinfo). Don't nag about those.
  return path.endsWith("tsconfig.tsbuildinfo") || path.endsWith(".lock.json")
}
