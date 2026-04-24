/**
 * Validation layer — proves generated code is structurally, semantically,
 * dependency-consistent, and compositionally viable. See lib/validation/
 * README-style note in index.ts for the execution order.
 *
 * No runtime is introduced by this layer. All correctness comes from
 * static analysis of file contents.
 */

export type Severity = "blocking" | "warning" | "info"

export type ValidationIssueKind =
  | "parse_error"
  | "empty_file"
  | "trivial_file"
  | "extension_mismatch"
  | "missing_import"
  | "missing_dependency"
  | "unused_dependency"
  | "duplicate_export"
  | "client_imports_server"
  | "missing_entrypoint"
  | "malformed_layout"
  | "circular_dependency"
  | "case_sensitivity"
  | "invalid_package_json"
  | "invalid_json"

export interface ValidationIssue {
  severity: Severity
  kind: ValidationIssueKind
  path?: string
  line?: number
  column?: number
  message: string
  suggestion?: string
}

export interface ValidationReport {
  /** `true` iff no blocking issues. Warnings and info do not flip this bit. */
  ok: boolean
  issues: ValidationIssue[]
  fileCount: number
  blockingCount: number
  warningCount: number
  infoCount: number
}

export interface ValidationFile {
  path: string
  content: string
  language?: string | null
}

export interface PackageJson {
  name?: string
  version?: string
  main?: string
  module?: string
  type?: string
  exports?: Record<string, unknown> | string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  scripts?: Record<string, string>
}

export interface ValidationContext {
  files: ValidationFile[]
  fileByPath: Map<string, ValidationFile>
  /** Parsed package.json if present and valid. */
  packageJson: PackageJson | null
  /**
   * Paths freshly produced by the current AI task. Used for issue attribution
   * and for warning-vs-blocking decisions about pre-existing state. If
   * omitted, every file is treated as "new" (full-project validation).
   */
  newPaths?: Set<string>
}
