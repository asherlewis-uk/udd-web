/**
 * Module resolution used by the semantic and cross-file validators.
 * Mirrors the project's `@/* → ./*` alias from tsconfig and the standard
 * JS/TS extension search order.
 *
 * This is a pure function of the file-set — no filesystem access, no
 * runtime. If an import can plausibly resolve to a file we have in the
 * ValidationContext, it does; otherwise we report it as missing.
 */

const EXTENSION_CANDIDATES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".d.ts",
]

const INDEX_CANDIDATES = [
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
  "/index.mjs",
  "/index.cjs",
]

const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "crypto",
  "dgram",
  "dns",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "net",
  "os",
  "path",
  "path/posix",
  "path/win32",
  "perf_hooks",
  "process",
  "querystring",
  "readline",
  "stream",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "timers",
  "timers/promises",
  "tls",
  "tty",
  "url",
  "util",
  "util/types",
  "v8",
  "vm",
  "worker_threads",
  "zlib",
])

export type ImportClass =
  | { kind: "relative"; absolutePath: string }
  | { kind: "alias"; absolutePath: string }
  | { kind: "bare"; packageName: string; subpath: string }
  | { kind: "builtin"; name: string }
  | { kind: "self"; absolutePath: string }

export function classifyImport(
  source: string,
  importingPath: string,
): ImportClass | null {
  if (!source) return null

  if (source.startsWith("node:")) {
    return { kind: "builtin", name: source.slice("node:".length) }
  }
  if (NODE_BUILTINS.has(source) || NODE_BUILTINS.has(source.split("/")[0] ?? "")) {
    return { kind: "builtin", name: source }
  }

  if (source === "." || source === "..") {
    const abs = joinPath(dirnameOf(importingPath), source)
    return { kind: "relative", absolutePath: abs }
  }
  if (source.startsWith("./") || source.startsWith("../")) {
    const abs = joinPath(dirnameOf(importingPath), source)
    return { kind: "relative", absolutePath: abs }
  }
  if (source.startsWith("/")) {
    return { kind: "self", absolutePath: trimLeadingSlash(source) }
  }
  if (source.startsWith("@/")) {
    return { kind: "alias", absolutePath: source.slice(2) }
  }

  return { kind: "bare", packageName: extractPackageName(source), subpath: source }
}

/** Extract the npm package name from a bare import specifier. */
export function extractPackageName(source: string): string {
  if (source.startsWith("@")) {
    const parts = source.split("/")
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`
    return source
  }
  const slash = source.indexOf("/")
  return slash === -1 ? source : source.slice(0, slash)
}

/**
 * Given a "virtual absolute path" (one of the file paths in our file-set),
 * try every reasonable extension + /index variant. Returns the matched file
 * path or null. A matchable path exists in `fileSet`.
 */
export function resolveToFile(
  virtualPath: string,
  fileSet: Set<string>,
): string | null {
  const normalized = normalizePath(virtualPath)

  for (const ext of EXTENSION_CANDIDATES) {
    const candidate = normalized + ext
    if (fileSet.has(candidate)) return candidate
  }
  for (const idx of INDEX_CANDIDATES) {
    const candidate = normalized + idx
    if (fileSet.has(candidate)) return candidate
  }
  return null
}

/**
 * Case-insensitive variant of resolveToFile. Used to surface
 * case-sensitivity bugs (an import that works on macOS but would break on
 * a case-sensitive filesystem).
 */
export function resolveCaseInsensitive(
  virtualPath: string,
  fileSet: Set<string>,
): string | null {
  const lowered = new Map<string, string>()
  for (const p of fileSet) lowered.set(p.toLowerCase(), p)

  const normalized = normalizePath(virtualPath)

  for (const ext of EXTENSION_CANDIDATES) {
    const candidate = (normalized + ext).toLowerCase()
    const hit = lowered.get(candidate)
    if (hit) return hit
  }
  for (const idx of INDEX_CANDIDATES) {
    const candidate = (normalized + idx).toLowerCase()
    const hit = lowered.get(candidate)
    if (hit) return hit
  }
  return null
}

function dirnameOf(path: string): string {
  const slash = path.lastIndexOf("/")
  return slash === -1 ? "" : path.slice(0, slash)
}

function trimLeadingSlash(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path
}

function joinPath(base: string, rel: string): string {
  const parts = (base === "" ? [] : base.split("/"))
  for (const segment of rel.split("/")) {
    if (segment === "" || segment === ".") continue
    if (segment === "..") {
      parts.pop()
      continue
    }
    parts.push(segment)
  }
  return parts.join("/")
}

function normalizePath(path: string): string {
  return path.split("/").filter((p) => p !== "" && p !== ".").join("/")
}
