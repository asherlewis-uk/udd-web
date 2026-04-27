import "server-only";

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import type { ExecFile } from "@/lib/runtime/executor";

const RUNTIME_ROOT = path.join(os.tmpdir(), "udd-runtime");
const PREVIEW_START_TIMEOUT_MS = 30_000;
const PREVIEW_TTL_MS = 10 * 60 * 1000;
const MAX_RUNTIME_FILE_COUNT = 120;
const MAX_RUNTIME_BYTES = 2 * 1024 * 1024;

const NEXT_FILE_EXTENSIONS = ["tsx", "ts", "jsx", "js"];
const REQUIRED_NEXT_DEPENDENCIES = ["next", "react", "react-dom"];
const activePreviews = new Map<string, ChildProcessWithoutNullStreams>();

type PackageShape = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

type RuntimeMetadata = {
  kind: "udd-next-preview";
  sessionId: string;
  pid: number;
  port: number;
  previewUrl: string;
  workspacePath: string;
  startedAt: string;
  ttlMs: number;
};

export type PreviewLogEvent = {
  level: "info" | "warn" | "error" | "system";
  source: "system" | "stdout" | "stderr" | "build";
  message: string;
};

export type PreviewExitEvent = {
  code: number | null;
  signal: NodeJS.Signals | null;
  previewUrl: string;
  workspacePath: string;
};

export type StartPreviewResult = {
  previewUrl: string;
  port: number;
  workspacePath: string;
  pid: number;
};

export async function startNextDevPreview(
  sessionId: string,
  files: ExecFile[],
  hooks: {
    onEvent: (event: PreviewLogEvent) => Promise<void>;
    onExit: (event: PreviewExitEvent) => Promise<void>;
  },
): Promise<StartPreviewResult> {
  const workspace = await prepareNextWorkspace(sessionId, files, hooks.onEvent);
  const port = await findAvailablePort();
  const previewUrl = `http://127.0.0.1:${port}`;
  const nextBin = nextCliPath();
  const child = spawn(
    process.execPath,
    [
      workspace.launcherPath,
      nextBin,
      String(port),
      String(PREVIEW_TTL_MS),
      String(process.pid),
    ],
    {
      cwd: workspace.workspacePath,
      env: previewEnvironment(workspace.workspacePath, port),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin.end();

  activePreviews.set(sessionId, child);
  attachOutput(child, hooks.onEvent);

  let ready = false;
  let exited: { code: number | null; signal: NodeJS.Signals | null } | null =
    null;
  child.once("exit", (code, signal) => {
    exited = { code, signal };
    activePreviews.delete(sessionId);
    if (!ready) return;
    void hooks
      .onExit({
        code,
        signal,
        previewUrl,
        workspacePath: workspace.workspacePath,
      })
      .catch((err) => {
        console.log("[v0] local preview exit handler failed", err);
      });
  });

  const metadata: RuntimeMetadata = {
    kind: "udd-next-preview",
    sessionId,
    pid: child.pid ?? 0,
    port,
    previewUrl,
    workspacePath: workspace.workspacePath,
    startedAt: new Date().toISOString(),
    ttlMs: PREVIEW_TTL_MS,
  };
  await writeFile(
    metadataPathFor(sessionId),
    JSON.stringify(metadata, null, 2),
  );

  try {
    await hooks.onEvent({
      level: "info",
      source: "system",
      message: `Starting local Next dev preview on 127.0.0.1:${port}.`,
    });
    await waitForPreviewReady(
      previewUrl,
      () => exited,
      PREVIEW_START_TIMEOUT_MS,
    );
    ready = true;
    return {
      previewUrl,
      port,
      workspacePath: workspace.workspacePath,
      pid: child.pid ?? 0,
    };
  } catch (err) {
    await stopNextDevPreview(sessionId);
    throw err;
  }
}

export async function stopNextDevPreview(sessionId: string): Promise<void> {
  const child = activePreviews.get(sessionId);
  if (child) {
    await terminateChild(child);
    activePreviews.delete(sessionId);
  } else {
    const metadata = await readRuntimeMetadata(sessionId);
    if (metadata && metadataIsFresh(metadata)) {
      await terminatePid(metadata.pid);
    }
  }

  await rm(workspacePathFor(sessionId), { recursive: true, force: true });
}

async function prepareNextWorkspace(
  sessionId: string,
  files: ExecFile[],
  onEvent: (event: PreviewLogEvent) => Promise<void>,
): Promise<{ workspacePath: string; launcherPath: string }> {
  if (files.length > MAX_RUNTIME_FILE_COUNT) {
    throw new Error(
      `Local preview supports up to ${MAX_RUNTIME_FILE_COUNT} files; this project has ${files.length}.`,
    );
  }

  const workspacePath = workspacePathFor(sessionId);
  await rm(workspacePath, { recursive: true, force: true });
  await mkdir(workspacePath, { recursive: true });

  const normalizedFiles = normalizeFiles(files);
  const totalBytes = normalizedFiles.reduce(
    (sum, file) => sum + new TextEncoder().encode(file.content).length,
    0,
  );
  if (totalBytes > MAX_RUNTIME_BYTES) {
    throw new Error(
      `Local preview supports up to ${formatBytes(MAX_RUNTIME_BYTES)} of saved files; this project has ${formatBytes(totalBytes)}.`,
    );
  }

  await validateNextPreviewShape(normalizedFiles);

  for (const file of normalizedFiles) {
    const targetPath = path.join(workspacePath, file.path);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, file.content);
  }

  const supportFiles = await writeRuntimeSupportFiles(
    workspacePath,
    normalizedFiles,
  );
  await linkHostNodeModules(workspacePath);

  const runtimeDir = path.join(workspacePath, ".udd-runtime");
  await mkdir(runtimeDir, { recursive: true });
  const launcherPath = path.join(runtimeDir, "next-launcher.mjs");
  await writeFile(launcherPath, launcherSource());

  await onEvent({
    level: "info",
    source: "system",
    message: `Prepared local preview workspace with ${normalizedFiles.length} saved file${normalizedFiles.length === 1 ? "" : "s"}.`,
  });
  if (supportFiles.length > 0) {
    await onEvent({
      level: "info",
      source: "system",
      message: `Added runtime-only support file${supportFiles.length === 1 ? "" : "s"}: ${supportFiles.join(", ")}.`,
    });
  }

  return { workspacePath, launcherPath };
}

function normalizeFiles(files: ExecFile[]): Array<ExecFile & { path: string }> {
  const seen = new Set<string>();
  return files.map((file) => {
    const normalizedPath = safeRuntimePath(file.path);
    if (seen.has(normalizedPath)) {
      throw new Error(
        `Duplicate runtime path after normalization: ${normalizedPath}`,
      );
    }
    seen.add(normalizedPath);
    return { ...file, path: normalizedPath };
  });
}

async function validateNextPreviewShape(
  files: Array<ExecFile & { path: string }>,
): Promise<void> {
  const paths = new Set(files.map((file) => file.path));
  const packageFile = files.find((file) => file.path === "package.json");
  if (!packageFile) {
    throw new Error(
      "Local preview requires a package.json that declares next, react, and react-dom.",
    );
  }

  const pkg = parsePackageJson(packageFile.content);
  const declaredDependencies = dependencyNames(pkg);
  const missingRequired = REQUIRED_NEXT_DEPENDENCIES.filter(
    (dependency) => !declaredDependencies.has(dependency),
  );
  if (missingRequired.length > 0) {
    throw new Error(
      `Local preview requires package.json to declare ${missingRequired.join(", ")}.`,
    );
  }

  const hostDependencies = await hostDependencyNames();
  const unsupported = Array.from(declaredDependencies).filter(
    (dependency) => !hostDependencies.has(dependency),
  );
  if (unsupported.length > 0) {
    throw new Error(
      `Local preview cannot install dependencies. Unsupported declared package${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}.`,
    );
  }

  if (!hasAnyPath(paths, "app/layout")) {
    throw new Error("Local preview requires a root app/layout file.");
  }
  if (!hasAnyPath(paths, "app/page")) {
    throw new Error(
      "Local preview requires a root app/page file for the preview entrypoint.",
    );
  }
}

function parsePackageJson(content: string): PackageShape {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    throw new Error(
      `package.json could not be parsed for local preview: ${message}`,
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "package.json must contain a JSON object for local preview.",
    );
  }
  return parsed as PackageShape;
}

function dependencyNames(pkg: PackageShape): Set<string> {
  return new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);
}

let hostDependenciesCache: Set<string> | null = null;

async function hostDependencyNames(): Promise<Set<string>> {
  if (hostDependenciesCache) return hostDependenciesCache;
  const packagePath = path.join(process.cwd(), "package.json");
  const content = await readFile(packagePath, "utf8");
  const pkg = parsePackageJson(content);
  hostDependenciesCache = dependencyNames(pkg);
  return hostDependenciesCache;
}

function hasAnyPath(paths: Set<string>, base: string): boolean {
  return NEXT_FILE_EXTENSIONS.some((extension) =>
    paths.has(`${base}.${extension}`),
  );
}

function safeRuntimePath(rawPath: string): string {
  const trimmed = rawPath.trim().replace(/\\/g, "/");
  if (!trimmed) throw new Error("Generated file path is empty.");
  if (trimmed.includes("\0"))
    throw new Error(`Invalid runtime path: ${rawPath}`);
  if (
    trimmed.startsWith("/") ||
    /^[A-Za-z]:/.test(trimmed) ||
    trimmed.startsWith("//")
  ) {
    throw new Error(`Runtime file path must be relative: ${rawPath}`);
  }

  const normalized = path.posix.normalize(trimmed);
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(`Runtime file path escapes the project: ${rawPath}`);
  }

  const parts = normalized.split("/");
  if (
    parts.includes("node_modules") ||
    parts.includes(".git") ||
    parts.includes(".next")
  ) {
    throw new Error(
      `Runtime file path targets a reserved directory: ${rawPath}`,
    );
  }
  return normalized;
}

async function writeRuntimeSupportFiles(
  workspacePath: string,
  files: Array<ExecFile & { path: string }>,
): Promise<string[]> {
  const paths = new Set(files.map((file) => file.path));
  const written: string[] = [];

  if (!paths.has("tsconfig.json")) {
    await writeFile(
      path.join(workspacePath, "tsconfig.json"),
      `${JSON.stringify(defaultTsConfig(), null, 2)}\n`,
    );
    written.push("tsconfig.json");
  }

  if (!paths.has("next-env.d.ts")) {
    await writeFile(
      path.join(workspacePath, "next-env.d.ts"),
      '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n',
    );
    written.push("next-env.d.ts");
  }

  const usesTailwindImport = files.some(
    (file) =>
      /\.css$/i.test(file.path) &&
      /@import\s+["']tailwindcss["']/.test(file.content),
  );
  if (usesTailwindImport && !paths.has("postcss.config.mjs")) {
    await writeFile(
      path.join(workspacePath, "postcss.config.mjs"),
      'const config = { plugins: { "@tailwindcss/postcss": {} } }\n\nexport default config\n',
    );
    written.push("postcss.config.mjs");
  }

  return written;
}

function defaultTsConfig() {
  return {
    compilerOptions: {
      target: "ES2017",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: false,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      baseUrl: ".",
      paths: {
        "@/*": ["./*"],
      },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    exclude: ["node_modules"],
  };
}

async function linkHostNodeModules(workspacePath: string): Promise<void> {
  const hostNodeModules = path.join(process.cwd(), "node_modules");
  if (!existsSync(hostNodeModules)) {
    throw new Error(
      "Local preview cannot start because UDD dependencies are not installed.",
    );
  }
  await symlink(
    hostNodeModules,
    path.join(workspacePath, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
}

function nextCliPath(): string {
  const cliPath = path.join(
    process.cwd(),
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );
  if (!existsSync(cliPath)) {
    throw new Error(
      "Local preview cannot start because the Next.js CLI is not installed.",
    );
  }
  return cliPath;
}

function previewEnvironment(
  workspacePath: string,
  port: number,
): NodeJS.ProcessEnv {
  const tmpPath = path.join(workspacePath, ".tmp");
  return {
    PATH: process.env.PATH ?? "",
    HOME: workspacePath,
    TMPDIR: tmpPath,
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    CI: "1",
  };
}

function attachOutput(
  child: ChildProcessWithoutNullStreams,
  onEvent: (event: PreviewLogEvent) => Promise<void>,
): void {
  const stdout = createInterface({ input: child.stdout });
  stdout.on("line", (line) => {
    if (!line.trim()) return;
    void onEvent({ level: "info", source: "stdout", message: line }).catch(
      (err) => {
        console.log("[v0] local preview stdout event write failed", err);
      },
    );
  });

  const stderr = createInterface({ input: child.stderr });
  stderr.on("line", (line) => {
    if (!line.trim()) return;
    void onEvent({ level: "error", source: "stderr", message: line }).catch(
      (err) => {
        console.log("[v0] local preview stderr event write failed", err);
      },
    );
  });
}

async function waitForPreviewReady(
  previewUrl: string,
  getExit: () => { code: number | null; signal: NodeJS.Signals | null } | null,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastFailure = "no response yet";

  while (Date.now() < deadline) {
    const exit = getExit();
    if (exit) {
      throw new Error(
        `Local preview process exited before it became reachable (code ${exit.code ?? "null"}, signal ${exit.signal ?? "none"}).`,
      );
    }

    try {
      const response = await fetchWithTimeout(previewUrl, 1500);
      if (response.status < 500) return;
      lastFailure = `HTTP ${response.status}`;
    } catch (err) {
      lastFailure = err instanceof Error ? err.message : "connection failed";
    }

    await delay(500);
  }

  throw new Error(
    `Local preview did not become reachable within ${Math.round(timeoutMs / 1000)} seconds (${lastFailure}).`,
  );
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Could not allocate a local preview port.")),
        );
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function terminateChild(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = await waitForChildExit(child, 1500);
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
    await waitForChildExit(child, 500);
  }
}

async function terminatePid(pid: number): Promise<void> {
  if (!pid || pid < 1) return;
  if (!pidIsAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }
  await delay(1500);
  if (pidIsAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The process may already be gone.
    }
  }
}

function waitForChildExit(
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
): Promise<boolean> {
  if (child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);
    const onExit = () => {
      cleanup();
      resolve(true);
    };
    const cleanup = () => {
      clearTimeout(timeoutId);
      child.off("exit", onExit);
    };
    child.once("exit", onExit);
  });
}

function pidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readRuntimeMetadata(
  sessionId: string,
): Promise<RuntimeMetadata | null> {
  try {
    const raw = await readFile(metadataPathFor(sessionId), "utf8");
    const parsed = JSON.parse(raw) as Partial<RuntimeMetadata>;
    if (parsed.kind !== "udd-next-preview" || parsed.sessionId !== sessionId)
      return null;
    if (typeof parsed.pid !== "number" || typeof parsed.startedAt !== "string")
      return null;
    return parsed as RuntimeMetadata;
  } catch {
    return null;
  }
}

function metadataIsFresh(metadata: RuntimeMetadata): boolean {
  const startedAt = Date.parse(metadata.startedAt);
  if (!Number.isFinite(startedAt)) return false;
  return Date.now() - startedAt < metadata.ttlMs + 60_000;
}

function workspacePathFor(sessionId: string): string {
  const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(RUNTIME_ROOT, safeSessionId);
}

function metadataPathFor(sessionId: string): string {
  return path.join(
    workspacePathFor(sessionId),
    ".udd-runtime",
    "metadata.json",
  );
}

function launcherSource(): string {
  return `import { spawn } from "node:child_process"

const [nextBin, port, ttlMsRaw, parentPidRaw] = process.argv.slice(2)
const ttlMs = Number(ttlMsRaw)
const parentPid = Number(parentPidRaw)
let shuttingDown = false

const child = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", port], {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
})

child.stdout.pipe(process.stdout)
child.stderr.pipe(process.stderr)

function shutdown(signal = "SIGTERM") {
  if (shuttingDown) return
  shuttingDown = true
  if (child.exitCode === null) child.kill(signal)
  setTimeout(() => {
    if (child.exitCode === null) child.kill("SIGKILL")
    process.exit(0)
  }, 1500).unref()
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))

if (Number.isFinite(ttlMs) && ttlMs > 0) {
  setTimeout(() => shutdown("SIGTERM"), ttlMs).unref()
}

if (Number.isFinite(parentPid) && parentPid > 1) {
  setInterval(() => {
    try {
      process.kill(parentPid, 0)
    } catch {
      shutdown("SIGTERM")
    }
  }, 1000).unref()
}

child.on("exit", (code, signal) => {
  if (shuttingDown) process.exit(0)
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
