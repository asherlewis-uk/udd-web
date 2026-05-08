import { getSession } from "@/lib/auth-session";
import {
  getProjectByIdAndOwner,
  countLiveRunSessions,
  getRunSessionById,
  insertRunSession,
  updateRunSession,
  getStaleRunSessions,
  insertRunEvent,
  updateProject,
} from "@/lib/db/queries";
import { getDb } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  analyzeFile,
  formatBytes,
  loadProjectFiles,
} from "@/lib/runtime/executor";
import {
  startNextDevPreview,
  stopNextDevPreview,
  type PreviewExitEvent,
} from "@/lib/runtime/local-preview";

/**
 * Public API (startRun / driveSession / stopRun) is unchanged. Internals are
 * now backed by the real executor in lib/runtime/executor.ts plus the local
 * preview helper in lib/runtime/local-preview.ts: every event reflects actual
 * source contents, parser results, process output, or cleanup work.
 */

export async function startRun(projectId: string): Promise<string> {
  const authSession = await getSession();
  if (!authSession) throw new Error("Not authenticated");
  const user = authSession.user;

  // Confirm the project exists and belongs to the caller (RLS also enforces this).
  const project = await getProjectByIdAndOwner(projectId, user.id);
  if (!project) throw new Error("Project not found");

  const activeCount = await countLiveRunSessions(projectId, user.id);
  if (activeCount > 0) {
    throw new Error(
      "A run is already active for this project. Stop it before starting another.",
    );
  }

  const runSession = await insertRunSession({
    projectId,
    ownerId: user.id,
    status: "starting",
    previewUrl: null,
    error: null,
    startedAt: new Date(),
  });
  if (!runSession) throw new Error("Failed to start run");

  await writeEvent({
    session_id: runSession.id,
    project_id: projectId,
    owner_id: user.id,
    level: "system",
    source: "system",
    message: "Run requested.",
  });

  await updateProject(projectId, user.id, {
    status: "active",
    lastOpenedAt: new Date(),
  });

  return runSession.id;
}

/**
 * Stop a currently-running session. Transitions running → stopping → stopped.
 */
export async function stopRun(sessionId: string): Promise<void> {
  const authSession = await getSession();
  if (!authSession) throw new Error("Not authenticated");
  const user = authSession.user;

  const runSession = await getRunSessionById(sessionId, user.id);
  if (!runSession) return;
  if (!(runSession.status === "running" || runSession.status === "starting"))
    return;

  // running/starting → stopping. Conditional so a concurrent stop or an
  // error-path terminal write can't be silently reversed.
  const toStopping = await updateRunSession(
    sessionId,
    user.id,
    { status: "stopping" },
    runSession.status,
  );
  if (!toStopping) return;

  await writeEvent({
    session_id: sessionId,
    project_id: runSession.projectId,
    owner_id: user.id,
    level: "system",
    source: "system",
    message: "Stopping local preview...",
  });

  await stopNextDevPreview(sessionId);

  // stopping → stopped. Conditional for the same reason as above.
  const toStopped = await updateRunSession(
    sessionId,
    user.id,
    {
      status: "stopped",
      stoppedAt: new Date(),
      previewUrl: null,
      error: null,
    },
    "stopping",
  );
  if (!toStopped) return;

  await writeEvent({
    session_id: sessionId,
    project_id: runSession.projectId,
    owner_id: user.id,
    level: "system",
    source: "system",
    message: "Local preview stopped and workspace cleaned up.",
  });
}

/**
 * Real execution driver: loads files, parses them, and records genuine
 * per-file results. Scheduled from the server action via `after()`.
 */
export async function driveSession(sessionId: string): Promise<void> {
  const rows = await getDb()
    .select()
    .from(schema.runSessions)
    .where(eq(schema.runSessions.id, sessionId))
    .limit(1);
  const session = rows[0];
  if (!session) return;
  if (session.status !== "starting") return;

  const ownerId = session.ownerId;
  const projectId = session.projectId;

  try {
    const files = await loadProjectFiles(projectId, ownerId);

    if (files.length === 0) {
      throw new Error(
        "No files to execute. Run an AI task first to populate project files.",
      );
    }

    const totalBytes = files.reduce(
      (sum, f) => sum + new TextEncoder().encode(f.content).length,
      0,
    );

    await writeEvent({
      session_id: sessionId,
      project_id: projectId,
      owner_id: ownerId,
      level: "info",
      source: "system",
      message: `Loaded ${files.length} file${files.length === 1 ? "" : "s"} (${formatBytes(totalBytes)}).`,
    });

    // Real per-file analysis. No artificial delay — timing reflects parser work.
    let errorCount = 0;
    let okCount = 0;
    for (const file of files) {
      const result = analyzeFile(file);
      if (result.ok) {
        okCount += 1;
        await writeEvent({
          session_id: sessionId,
          project_id: projectId,
          owner_id: ownerId,
          level: "info",
          source: "build",
          message: `ok  ${file.path}  ${formatBytes(result.bytes)}`,
        });
      } else {
        errorCount += 1;
        await writeEvent({
          session_id: sessionId,
          project_id: projectId,
          owner_id: ownerId,
          level: "error",
          source: "build",
          message: `FAIL  ${file.path}: ${result.message ?? "Parse error"}`,
        });
      }
    }

    if (errorCount > 0) {
      const message = `Validation failed - ${errorCount} of ${files.length} file${files.length === 1 ? "" : "s"} did not parse.`;
      // Only terminalize if we're still the active driver — avoid stomping
      // on a concurrent stop that already moved the session to stopped.
      const terminalValues = {
        status: "error" as const,
        error: message,
        stoppedAt: new Date(),
        previewUrl: null,
      };
      await updateRunSession(sessionId, ownerId, terminalValues, "starting");
      await updateRunSession(sessionId, ownerId, terminalValues, "running");

      await writeEvent({
        session_id: sessionId,
        project_id: projectId,
        owner_id: ownerId,
        level: "error",
        source: "system",
        message,
      });
      return;
    }

    // All files parsed. The parser gate is still first: no runtime process
    // starts unless saved files parse cleanly.
    await writeEvent({
      session_id: sessionId,
      project_id: projectId,
      owner_id: ownerId,
      level: "info",
      source: "stdout",
      message: `Validation passed - ${okCount} file${okCount === 1 ? "" : "s"} parsed cleanly.`,
    });

    const currentSession = await getRunSessionById(sessionId, ownerId);
    if (currentSession?.status !== "starting") {
      return;
    }

    const preview = await startNextDevPreview(sessionId, files, {
      onEvent: async (event) => {
        await writeEvent({
          session_id: sessionId,
          project_id: projectId,
          owner_id: ownerId,
          level: event.level,
          source: event.source,
          message: event.message,
        });
      },
      onExit: async (event) => {
        await handlePreviewExit(sessionId, projectId, ownerId, event);
      },
    });

    const promoted = await updateRunSession(
      sessionId,
      ownerId,
      {
        status: "running",
        previewUrl: preview.previewUrl,
        error: null,
      },
      "starting",
    );
    if (!promoted) {
      // Lost the race — another driver already terminalized this session
      // (or the user stopped it). Stop the process we just started instead
      // of leaving an orphaned preview behind.
      await stopNextDevPreview(sessionId);
      return;
    }

    await writeEvent({
      session_id: sessionId,
      project_id: projectId,
      owner_id: ownerId,
      level: "info",
      source: "stdout",
      message: `Local preview ready at ${preview.previewUrl}.`,
    });

    await updateProject(projectId, ownerId, {
      status: "active",
      lastOpenedAt: new Date(),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown runtime error";
    await stopNextDevPreview(sessionId);
    // Only terminalize if we're still the active driver — don't overwrite
    // a concurrent stop or a prior error already written by another driver.
    const terminalValues = {
      status: "error" as const,
      error: message,
      stoppedAt: new Date(),
      previewUrl: null,
    };
    await updateRunSession(sessionId, ownerId, terminalValues, "starting");
    await updateRunSession(sessionId, ownerId, terminalValues, "running");
    await writeEvent({
      session_id: sessionId,
      project_id: projectId,
      owner_id: ownerId,
      level: "error",
      source: "system",
      message,
    });
  }
}

/** Stale threshold in milliseconds (10 minutes). */
const STALE_SESSION_MS = 10 * 60 * 1000;

/**
 * Opportunistic reaper: marks sessions stuck in starting/running as error if
 * they've been in that state longer than STALE_SESSION_MS. Called on Run tab
 * load so stale work gets cleaned up when the user visits — no cron needed.
 */
export async function reapStaleSessions(
  projectId: string,
  ownerId: string,
): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_SESSION_MS);

  const staleSessions = await getStaleRunSessions(projectId, ownerId, cutoff);

  const staleIds = staleSessions.map((session) => session.id);
  if (staleIds.length === 0) return 0;

  for (const sessionId of staleIds) {
    await stopNextDevPreview(sessionId);
  }

  let reapedCount = 0;
  for (const sessionId of staleIds) {
    const terminalValues = {
      status: "error" as const,
      error: "Session stalled — marked failed after timeout.",
      stoppedAt: new Date(),
      previewUrl: null,
    };
    const updated =
      (await updateRunSession(
        sessionId,
        ownerId,
        terminalValues,
        "starting",
      )) ??
      (await updateRunSession(
        sessionId,
        ownerId,
        terminalValues,
        "running",
      ));

    if (updated) {
      await writeEvent({
        session_id: sessionId,
        project_id: projectId,
        owner_id: ownerId,
        level: "error",
        source: "system",
        message:
          "Session timed out; local preview process and workspace were cleaned up.",
      });
      reapedCount++;
    }
  }

  return reapedCount;
}

async function handlePreviewExit(
  sessionId: string,
  projectId: string,
  ownerId: string,
  event: PreviewExitEvent,
): Promise<void> {
  const message = `Local preview process exited (code ${event.code ?? "null"}, signal ${event.signal ?? "none"}).`;
  const updated = await updateRunSession(
    sessionId,
    ownerId,
    {
      status: "error",
      error: message,
      stoppedAt: new Date(),
      previewUrl: null,
    },
    "running",
  );
  await stopNextDevPreview(sessionId);

  if (!updated) return;
  await writeEvent({
    session_id: sessionId,
    project_id: projectId,
    owner_id: ownerId,
    level: "error",
    source: "system",
    message,
  });
}

type EventInput = {
  session_id: string;
  project_id: string;
  owner_id: string;
  level: "info" | "warn" | "error" | "system";
  source: "system" | "stdout" | "stderr" | "build";
  message: string;
};

async function writeEvent(input: EventInput): Promise<void> {
  await insertRunEvent({
    sessionId: input.session_id,
    projectId: input.project_id,
    ownerId: input.owner_id,
    level: input.level,
    source: input.source,
    message: input.message,
  });
}
