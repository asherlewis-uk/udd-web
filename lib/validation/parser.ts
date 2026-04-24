import { parse as babelParse } from "@babel/parser"

/**
 * Shared AST helpers for validation. Every JS/TS/JSX/TSX file in the
 * validator is parsed once here and the result is cached on the
 * FileAnalysis so each downstream layer (semantic, cross-file) can reuse
 * imports / exports / directives without re-parsing.
 */

export type FileAnalysis =
  | {
      kind: "js"
      path: string
      ok: true
      imports: ImportRecord[]
      exports: ExportRecord[]
      directives: Set<string>
      hasJsx: boolean
      byteLength: number
      isTrivial: boolean
    }
  | {
      kind: "js"
      path: string
      ok: false
      parseError: { message: string; line?: number; column?: number }
      byteLength: number
    }
  | {
      kind: "json"
      path: string
      ok: true
      value: unknown
      byteLength: number
      isTrivial: boolean
    }
  | {
      kind: "json"
      path: string
      ok: false
      parseError: { message: string }
      byteLength: number
    }
  | {
      kind: "text"
      path: string
      byteLength: number
      isTrivial: boolean
    }

export interface ImportRecord {
  /** Raw module specifier as written in the source. */
  source: string
  /** `true` for `import type` or `import { type X }` style. */
  typeOnly: boolean
  line?: number
}

export interface ExportRecord {
  name: string
  kind: "named" | "default" | "re-export"
  line?: number
}

const BABEL_EXTENSIONS = new Set(["js", "mjs", "cjs", "jsx", "ts", "tsx"])

export function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".")
  if (dot === -1) return ""
  return path.slice(dot + 1).toLowerCase()
}

export function basenameOf(path: string): string {
  const slash = path.lastIndexOf("/")
  return slash === -1 ? path : path.slice(slash + 1)
}

function isTriviallyEmpty(content: string): boolean {
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/^\s*export\s*\{\s*\}\s*;?\s*$/gm, "")
    .trim()
  return stripped.length === 0
}

export function byteLengthOf(content: string): number {
  return new TextEncoder().encode(content).length
}

/**
 * Run a single file through the appropriate parser and return a typed
 * analysis record. Never throws — every failure mode is represented as a
 * FileAnalysis variant.
 */
export function analyzeSource(path: string, content: string): FileAnalysis {
  const byteLength = byteLengthOf(content)
  const ext = extensionOf(path)

  if (ext === "json") {
    const trimmed = content.trim()
    if (trimmed.length === 0) {
      return {
        kind: "json",
        path,
        ok: false,
        parseError: { message: "JSON file is empty" },
        byteLength,
      }
    }
    try {
      const value = JSON.parse(trimmed)
      const isTrivial =
        value === null ||
        (typeof value === "object" && Object.keys(value as object).length === 0)
      return { kind: "json", path, ok: true, value, byteLength, isTrivial }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid JSON"
      return {
        kind: "json",
        path,
        ok: false,
        parseError: { message },
        byteLength,
      }
    }
  }

  if (!BABEL_EXTENSIONS.has(ext)) {
    return {
      kind: "text",
      path,
      byteLength,
      isTrivial: content.trim().length === 0,
    }
  }

  let ast: unknown
  try {
    ast = babelParse(content, {
      sourceType: "module",
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      plugins: ["typescript", "jsx", "decorators-legacy"],
    })
  } catch (err) {
    const e = err as { message?: string; loc?: { line?: number; column?: number } }
    return {
      kind: "js",
      path,
      ok: false,
      parseError: {
        message: e.message ?? "Parse error",
        line: e.loc?.line,
        column: e.loc?.column,
      },
      byteLength,
    }
  }

  // We deliberately don't pull in @babel/types — the AST is traversed with
  // shallow property reads keyed on node.type. Any field we read is guarded
  // by the type discriminator.
  const program = (ast as { program: AstProgram }).program
  const directives = new Set<string>(
    (program.directives ?? [])
      .map((d) => d.value?.value)
      .filter((v): v is string => typeof v === "string"),
  )
  const imports: ImportRecord[] = []
  const exports: ExportRecord[] = []

  for (const rawNode of program.body ?? []) {
    const node = rawNode as AstNode
    if (node.type === "ImportDeclaration") {
      const source = node.source?.value
      if (typeof source === "string") {
        const specs = node.specifiers ?? []
        const typeOnly =
          node.importKind === "type" ||
          (specs.length > 0 && specs.every((s) => s?.importKind === "type"))
        imports.push({ source, typeOnly, line: node.loc?.start.line })
      }
    } else if (node.type === "ExportDefaultDeclaration") {
      exports.push({ name: "default", kind: "default", line: node.loc?.start.line })
    } else if (node.type === "ExportNamedDeclaration") {
      const decl = node.declaration
      if (decl) {
        if (decl.type === "VariableDeclaration" && decl.declarations) {
          for (const v of decl.declarations) {
            if (v.id?.type === "Identifier" && typeof v.id.name === "string") {
              exports.push({
                name: v.id.name,
                kind: "named",
                line: node.loc?.start.line,
              })
            }
          }
        } else if (typeof decl.id?.name === "string") {
          exports.push({
            name: decl.id.name,
            kind: "named",
            line: node.loc?.start.line,
          })
        }
      }
      const specifiers = node.specifiers
      if (Array.isArray(specifiers)) {
        for (const s of specifiers) {
          const name = s?.exported?.name
          if (typeof name === "string") {
            const recKind: ExportRecord["kind"] = node.source ? "re-export" : "named"
            exports.push({ name, kind: recKind, line: node.loc?.start.line })
          }
        }
      }
    }
    // `export * from "./x"` contributes nothing to duplicate-export detection.
  }

  // Very cheap JSX detection via string search; the parser already accepted
  // the file, so this is only used to flag .ts files that actually contain
  // JSX (extension_mismatch).
  const hasJsx = /<[A-Za-z][A-Za-z0-9]*[\s/>]/.test(content)

  const isTrivial = isTriviallyEmpty(content)

  return {
    kind: "js",
    path,
    ok: true,
    imports,
    exports,
    directives,
    hasJsx,
    byteLength,
    isTrivial,
  }
}

interface AstProgram {
  body: Array<unknown>
  directives?: Array<{ value?: { value?: string } }>
}

interface AstLoc {
  start: { line: number; column: number }
}

/**
 * Minimal structural typing over the babel AST. Every property we read is
 * optional because we're intentionally duck-typing the subset we need
 * rather than pulling in @babel/types.
 */
interface AstNode {
  type: string
  loc?: AstLoc
  source?: { value?: string } | null
  importKind?: string
  specifiers?: Array<AstSpecifier> | null
  declaration?: AstDeclaration | null
}

interface AstSpecifier {
  importKind?: string
  exported?: { name?: string }
}

interface AstDeclaration {
  type?: string
  id?: { type?: string; name?: string }
  declarations?: Array<{ id?: { type?: string; name?: string } }>
}
