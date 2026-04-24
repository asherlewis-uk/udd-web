import {
  classifyImport,
  extractPackageName,
} from "@/lib/validation/resolver"
import type { FileAnalysis } from "@/lib/validation/parser"
import type {
  PackageJson,
  ValidationContext,
  ValidationIssue,
} from "@/lib/validation/types"

/**
 * Layer 3 — Dependency validation.
 *
 *  - every bare import has a matching entry in package.json (dep/devDep/peer)
 *  - package.json declared deps are referenced somewhere in the code
 *  - package.json is structurally valid (parsed by the structural layer)
 *
 * Missing deps are blocking (the project will not install/build); unused
 * deps are warnings (may be installed via runtime/peerDep indirection).
 */

const ALWAYS_ALLOWED = new Set<string>([
  // React auto-provided by framework
  "react",
  "react-dom",
])

/**
 * Packages whose "unused" signal is almost always a false positive —
 * PostCSS plugins, tailwind, type packages, eslint/lint configs, etc.
 * Never flagged as unused.
 */
const KNOWN_INDIRECT_DEPS = [
  /^@types\//,
  /^@typescript-eslint\//,
  /^eslint($|-)/,
  /^prettier($|-)/,
  /^postcss($|-)/,
  /^autoprefixer$/,
  /^tailwind(css)?($|-)/,
  /^@tailwindcss\//,
  /^typescript$/,
  /^tw-animate-css$/,
]

export function dependencyValidate(
  ctx: ValidationContext,
  analyses: Map<string, FileAnalysis>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // Flag invalid package.json explicitly (structural layer also flags
  // invalid_json; this adds the semantic message).
  const pkgFile = ctx.fileByPath.get("package.json")
  if (pkgFile && !ctx.packageJson) {
    issues.push({
      severity: "blocking",
      kind: "invalid_package_json",
      path: "package.json",
      message: "package.json could not be parsed as a valid JSON object.",
      suggestion: "Run the file through a JSON formatter and fix the syntax error.",
    })
    return issues
  }

  const pkg = ctx.packageJson
  if (!pkg) return issues

  const declaredDeps = new Set<string>([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ])

  const referenced = new Set<string>()

  // Walk all bare imports across the project.
  for (const a of analyses.values()) {
    if (a.kind !== "js" || !a.ok) continue
    for (const imp of a.imports) {
      const cls = classifyImport(imp.source, a.path)
      if (!cls || cls.kind !== "bare") continue

      const name = cls.packageName
      referenced.add(name)

      if (ALWAYS_ALLOWED.has(name)) continue
      if (declaredDeps.has(name)) continue

      // Not declared anywhere.
      const attribute = isAttributable(ctx, a.path)
      if (!attribute) continue

      issues.push({
        severity: "blocking",
        kind: "missing_dependency",
        path: a.path,
        line: imp.line,
        message: `Import "${imp.source}" in ${a.path} references package "${name}", which is not declared in package.json.`,
        suggestion: `Add "${name}" to dependencies or devDependencies in package.json.`,
      })
    }
  }

  // Unused declared deps → warnings.
  for (const dep of declaredDeps) {
    if (referenced.has(dep)) continue
    if (ALWAYS_ALLOWED.has(dep)) continue
    if (KNOWN_INDIRECT_DEPS.some((re) => re.test(dep))) continue
    // Scripts often reference a binary; we can't be sure it's unused without
    // tokenizing scripts. Skip if any script string contains the dep name.
    if (mentionsInScripts(pkg, dep)) continue

    issues.push({
      severity: "info",
      kind: "unused_dependency",
      path: "package.json",
      message: `Dependency "${dep}" is declared in package.json but never imported.`,
      suggestion: `Remove "${dep}" if it is unused, or import it where it belongs.`,
    })
  }

  return issues
}

function isAttributable(ctx: ValidationContext, path: string): boolean {
  if (!ctx.newPaths) return true
  return ctx.newPaths.has(path)
}

function mentionsInScripts(pkg: PackageJson, dep: string): boolean {
  const scripts = pkg.scripts ?? {}
  const pattern = new RegExp(`\\b${escapeRegex(dep)}\\b`)
  for (const s of Object.values(scripts)) {
    if (typeof s === "string" && pattern.test(s)) return true
  }
  return false
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
