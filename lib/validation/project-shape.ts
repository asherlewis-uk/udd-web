import type { FileAnalysis } from "@/lib/validation/parser"
import type { ValidationContext, ValidationIssue } from "@/lib/validation/types"

/**
 * Layer 4 — Project-shape validation.
 *
 * Answers "could this project plausibly run?" without actually running it.
 * Framework detection is intentionally shallow — we only check structure
 * that, if missing, guarantees the project is not viable.
 *
 *  - package.json: must exist if any `.ts/.tsx/.js/.jsx` file imports a
 *    bare npm specifier
 *  - Next.js App Router:
 *      - must have at least one `app/layout.{tsx,jsx,ts,js}`
 *      - must have at least one `app/page.{tsx,jsx,ts,js}` OR `app/**\/page.*`
 *  - Entry points declared in package.json (`main`, `module`) must resolve
 *    to a file in the project
 */
export function projectShapeValidate(
  ctx: ValidationContext,
  _analyses: Map<string, FileAnalysis>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const paths = new Set(ctx.files.map((f) => f.path))

  // 1. package.json presence when bare imports exist
  const hasBareImport = Array.from(_analyses.values()).some(
    (a) =>
      a.kind === "js" &&
      a.ok &&
      a.imports.some((i) => {
        const first = i.source[0]
        return first !== "." && first !== "/" && !i.source.startsWith("@/")
      }),
  )

  if (hasBareImport && !ctx.packageJson) {
    issues.push({
      severity: "blocking",
      kind: "missing_entrypoint",
      path: "package.json",
      message:
        "Project imports npm packages but has no package.json. Downstream `install` / `build` will fail.",
      suggestion:
        "Generate a package.json that declares every imported dependency.",
    })
  }

  // 2. Next.js App Router shape
  const looksNext = isNextProject(ctx)
  if (looksNext) {
    const hasAppLayout = hasAnyMatching(paths, /^app\/layout\.(tsx|ts|jsx|js)$/)
    const hasAnyPage = hasAnyMatching(paths, /(^|\/)app\/(?:.+\/)?page\.(tsx|ts|jsx|js)$/)

    if (!hasAppLayout) {
      issues.push({
        severity: "blocking",
        kind: "malformed_layout",
        message:
          "Next.js App Router project is missing app/layout.tsx — the framework requires a root layout.",
        suggestion:
          "Add app/layout.tsx exporting a React component that renders <html><body>{children}</body></html>.",
      })
    }

    if (!hasAnyPage) {
      issues.push({
        severity: "blocking",
        kind: "missing_entrypoint",
        message:
          "Next.js App Router project has no page.tsx file anywhere in app/ — nothing is reachable at runtime.",
        suggestion: "Add at least one app/**/page.tsx that renders the initial route.",
      })
    }
  }

  // 3. package.json declared entrypoints must resolve
  const pkg = ctx.packageJson
  if (pkg) {
    for (const field of ["main", "module"] as const) {
      const target = pkg[field]
      if (!target || typeof target !== "string") continue
      const cleaned = target.replace(/^\.\//, "")
      if (!paths.has(cleaned) && !pathExistsWithExtensions(cleaned, paths)) {
        issues.push({
          severity: "blocking",
          kind: "missing_entrypoint",
          path: "package.json",
          message: `package.json "${field}" points to "${target}" but that file does not exist in the project.`,
          suggestion: `Create ${target} or update package.json.${field} to match a real file.`,
        })
      }
    }
  }

  return issues
}

function isNextProject(ctx: ValidationContext): boolean {
  const pkg = ctx.packageJson
  if (
    pkg?.dependencies?.["next"] ||
    pkg?.devDependencies?.["next"] ||
    pkg?.peerDependencies?.["next"]
  ) {
    return true
  }
  const paths = new Set(ctx.files.map((f) => f.path))
  if (paths.has("next.config.js") || paths.has("next.config.mjs") || paths.has("next.config.ts")) {
    return true
  }
  // Heuristic: any app/page.* file is a strong signal.
  for (const p of paths) {
    if (/^app\/(.*\/)?page\.(tsx|ts|jsx|js)$/.test(p)) return true
  }
  return false
}

function hasAnyMatching(paths: Set<string>, re: RegExp): boolean {
  for (const p of paths) {
    if (re.test(p)) return true
  }
  return false
}

function pathExistsWithExtensions(base: string, paths: Set<string>): boolean {
  if (paths.has(base)) return true
  for (const ext of [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"]) {
    if (paths.has(base + ext)) return true
  }
  return false
}
