import {
  classifyImport,
  resolveCaseInsensitive,
  resolveToFile,
} from "@/lib/validation/resolver"
import type { FileAnalysis } from "@/lib/validation/parser"
import type { ValidationContext, ValidationIssue } from "@/lib/validation/types"

/**
 * Layer 2 — Semantic validation + Layer 5 — Cross-file consistency.
 *
 *  - unresolved internal imports  (missing_import)
 *  - case-sensitivity bugs        (case_sensitivity, warning)
 *  - duplicate exports            (duplicate_export)
 *  - client code importing server-only modules  (client_imports_server)
 *  - basic circular-dependency detection         (circular_dependency, warning)
 *
 * Bare (npm) imports are handled by the dependency layer, not here.
 */

const SERVER_ONLY_SPECIFIERS = new Set(["server-only"])
const CLIENT_ONLY_SPECIFIERS = new Set(["client-only"])

export function semanticValidate(
  ctx: ValidationContext,
  analyses: Map<string, FileAnalysis>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const fileSet = new Set(ctx.files.map((f) => f.path))

  // 1. Classify every file's JS/TS imports and per-file side data.
  type JsAnalysisOk = Extract<FileAnalysis, { kind: "js"; ok: true }>
  const jsAnalyses: JsAnalysisOk[] = []
  for (const a of analyses.values()) {
    if (a.kind === "js" && a.ok) jsAnalyses.push(a)
  }

  // Pre-compute the "is this file server-only / client-only" flag via its
  // directives + explicit marker imports. Used by the client/server boundary
  // check below.
  const serverOnlyPaths = new Set<string>()
  const clientOnlyPaths = new Set<string>()
  for (const a of jsAnalyses) {
    if (a.directives.has("use server")) serverOnlyPaths.add(a.path)
    if (a.directives.has("use client")) clientOnlyPaths.add(a.path)
    for (const imp of a.imports) {
      if (SERVER_ONLY_SPECIFIERS.has(imp.source)) serverOnlyPaths.add(a.path)
      if (CLIENT_ONLY_SPECIFIERS.has(imp.source)) clientOnlyPaths.add(a.path)
    }
  }

  // 2. Walk every import edge.
  const importGraph = new Map<string, Set<string>>()

  for (const a of jsAnalyses) {
    const fromPath = a.path
    const isClient = clientOnlyPaths.has(fromPath)
    const attribute = isAttributable(ctx, fromPath)

    for (const imp of a.imports) {
      // `import "server-only"` and `import "client-only"` are markers — skip.
      if (SERVER_ONLY_SPECIFIERS.has(imp.source) || CLIENT_ONLY_SPECIFIERS.has(imp.source)) {
        continue
      }

      const classified = classifyImport(imp.source, fromPath)
      if (!classified) continue
      if (classified.kind === "builtin" || classified.kind === "bare") continue

      const virtual = classified.absolutePath
      const resolved = resolveToFile(virtual, fileSet)

      if (!resolved) {
        // Nothing matched. Before flagging as missing, check for a
        // case-sensitivity miss (warning, not blocking — works on the
        // developer's mac but breaks in prod).
        const caseHit = resolveCaseInsensitive(virtual, fileSet)
        if (caseHit) {
          if (attribute) {
            issues.push({
              severity: "warning",
              kind: "case_sensitivity",
              path: fromPath,
              line: imp.line,
              message: `Import "${imp.source}" in ${fromPath} resolves to ${caseHit} only case-insensitively.`,
              suggestion: `Rename the import to match the actual path: ${caseHit}.`,
            })
          }
          // Still record the edge for cycle detection purposes.
          addEdge(importGraph, fromPath, caseHit)
          continue
        }

        // Type-only imports are allowed to resolve to .d.ts ambients that
        // aren't in the file-set; demote to warning so a generated API
        // client using `import type { X } from './types'` doesn't block
        // completion when types.ts is skipped.
        const severity = imp.typeOnly ? "warning" : "blocking"

        if (attribute) {
          issues.push({
            severity,
            kind: "missing_import",
            path: fromPath,
            line: imp.line,
            message: `File ${fromPath} imports "${imp.source}" but that target does not exist in the project.`,
            suggestion: `Create the missing file (${virtual}) or fix the import path.`,
          })
        }
        continue
      }

      addEdge(importGraph, fromPath, resolved)

      // Client-imports-server check. A "use client" file MUST NOT import
      // from a "use server" file — Next.js will fail at build time.
      if (isClient && serverOnlyPaths.has(resolved)) {
        if (attribute) {
          issues.push({
            severity: "blocking",
            kind: "client_imports_server",
            path: fromPath,
            line: imp.line,
            message: `Client component ${fromPath} imports server-only module ${resolved}.`,
            suggestion:
              "Move the shared code to a non-directive module, or invoke the server code via a server action instead of a direct import.",
          })
        }
      }
    }
  }

  // 3. Duplicate-export detection (per file).
  for (const a of jsAnalyses) {
    if (!isAttributable(ctx, a.path)) continue
    const seen = new Map<string, number>()
    for (const exp of a.exports) {
      seen.set(exp.name, (seen.get(exp.name) ?? 0) + 1)
    }
    for (const [name, count] of seen) {
      if (count > 1) {
        issues.push({
          severity: "blocking",
          kind: "duplicate_export",
          path: a.path,
          message: `${a.path} declares export "${name}" ${count} times.`,
          suggestion: `Keep one definition of "${name}" or rename the duplicates.`,
        })
      }
    }
  }

  // 4. Cycle detection (DFS with visiting set). Reports the first cycle
  //    containing an attributable file; cycles are flagged as warnings
  //    because circular deps are sometimes intentional (shared types) and
  //    rarely break runtime under ESM.
  const reportedCycles = new Set<string>()
  for (const start of importGraph.keys()) {
    const cycle = findCycleFrom(start, importGraph)
    if (!cycle) continue
    const key = cycleKey(cycle)
    if (reportedCycles.has(key)) continue
    const attributable = cycle.some((p) => isAttributable(ctx, p))
    if (!attributable) continue
    reportedCycles.add(key)

    issues.push({
      severity: "warning",
      kind: "circular_dependency",
      path: cycle[0],
      message: `Circular import: ${cycle.join(" → ")} → ${cycle[0]}.`,
      suggestion:
        "Break the cycle by extracting shared types or the common util into a third module.",
    })
  }

  return issues
}

function isAttributable(ctx: ValidationContext, path: string): boolean {
  if (!ctx.newPaths) return true
  return ctx.newPaths.has(path)
}

function addEdge(
  graph: Map<string, Set<string>>,
  from: string,
  to: string,
): void {
  const set = graph.get(from) ?? new Set<string>()
  set.add(to)
  graph.set(from, set)
}

function findCycleFrom(
  start: string,
  graph: Map<string, Set<string>>,
): string[] | null {
  const stack: string[] = []
  const onStack = new Set<string>()
  const visited = new Set<string>()

  function dfs(node: string): string[] | null {
    if (onStack.has(node)) {
      const idx = stack.indexOf(node)
      return stack.slice(idx)
    }
    if (visited.has(node)) return null
    visited.add(node)
    onStack.add(node)
    stack.push(node)
    const out = graph.get(node)
    if (out) {
      for (const next of out) {
        const res = dfs(next)
        if (res) return res
      }
    }
    stack.pop()
    onStack.delete(node)
    return null
  }

  return dfs(start)
}

function cycleKey(cycle: string[]): string {
  // Canonicalize so the same cycle in different rotations collapses to one key.
  const min = cycle.reduce((m, c) => (c < m ? c : m), cycle[0])
  const idx = cycle.indexOf(min)
  return [...cycle.slice(idx), ...cycle.slice(0, idx)].join(">")
}
