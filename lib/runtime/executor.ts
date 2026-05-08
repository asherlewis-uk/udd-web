import { parse as babelParse } from "@babel/parser"
import {
  getProjectFilesForProject,
  getLatestAITaskOutputForProject,
} from "@/lib/db/queries"

/**
 * Minimal execution service: rather than a fake "booting / installing / ready"
 * script, this actually loads the project's files and validates each one.
 *
 * - JSON: JSON.parse
 * - JS/JSX/TS/TSX/MJS/CJS: @babel/parser with typescript + jsx plugins
 * - everything else: byte count only
 *
 * Output is real, so downstream events (errors, warnings, file counts,
 * preview URL) reflect actual source contents. The public API surface
 * (`startRun` / `driveSession` / `stopRun`) is unchanged.
 */

export type ExecFile = {
  path: string
  language: string | null
  content: string
}

export type AnalyzeResult = {
  ok: boolean
  message?: string
  bytes: number
}

/**
 * Load all files for a project. Prefers the canonical `project_files` table;
 * falls back to the most recent completed AI task's output if the table is
 * empty for this project (useful right after the first AI run).
 */
export async function loadProjectFiles(
  projectId: string,
  ownerId: string,
): Promise<ExecFile[]> {
  const rows = await getProjectFilesForProject(projectId, ownerId, { orderByPath: true })

  if (rows.length > 0) {
    return rows.map((r) => ({
      path: r.path,
      content: r.content ?? "",
      language: r.language ?? null,
    }))
  }

  // Fallback — latest completed AI task output.
  const latestTask = await getLatestAITaskOutputForProject(projectId, ownerId)

  const output = latestTask?.output as
    | { files?: Array<{ path?: string; content?: string; language?: string }> }
    | null
    | undefined

  const files = output?.files ?? []
  return files
    .filter(
      (f): f is { path: string; content: string; language?: string } =>
        typeof f?.path === "string" && typeof f?.content === "string",
    )
    .map((f) => ({
      path: f.path,
      content: f.content,
      language: f.language ?? null,
    }))
}

const BABEL_EXTENSIONS = new Set(["js", "mjs", "cjs", "jsx", "ts", "tsx"])

function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".")
  if (dot === -1) return ""
  return path.slice(dot + 1).toLowerCase()
}

/**
 * Run a real syntactic check over a single file. Errors returned here are
 * genuine parse errors, not simulated ones.
 */
export function analyzeFile(file: ExecFile): AnalyzeResult {
  const bytes = new TextEncoder().encode(file.content).length
  const ext = extensionOf(file.path)

  if (ext === "json") {
    try {
      JSON.parse(file.content || "null")
      return { ok: true, bytes }
    } catch (err) {
      return {
        ok: false,
        bytes,
        message: err instanceof Error ? err.message : "Invalid JSON",
      }
    }
  }

  if (BABEL_EXTENSIONS.has(ext)) {
    try {
      babelParse(file.content, {
        sourceType: "module",
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        allowAwaitOutsideFunction: true,
        plugins: ["typescript", "jsx", "decorators-legacy"],
      })
      return { ok: true, bytes }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Parse error"
      return { ok: false, bytes, message }
    }
  }

  // Unknown / plain-text: byte count only, always ok.
  return { ok: true, bytes }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
