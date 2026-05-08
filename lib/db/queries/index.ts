import "server-only"
import { eq, and, or, inArray, ilike, desc, asc, count, sql, isNull, gt, lt, gte } from "drizzle-orm"
import { getDb } from "@/lib/db"
import * as schema from "@/lib/db/schema"

const db = () => getDb()

// ------------------------------------------------------------------
// Profiles
// ------------------------------------------------------------------

export async function getProfileDisplayName(ownerId: string) {
  const row = await db()
    .select({ displayName: schema.profiles.displayName })
    .from(schema.profiles)
    .where(eq(schema.profiles.id, ownerId))
    .limit(1)
  return row[0]?.displayName ?? null
}

// ------------------------------------------------------------------
// Projects
// ------------------------------------------------------------------

export async function getProjectsForOwner(ownerId: string, opts?: {
  status?: string
  search?: string
  limit?: number
}) {
  const conditions = [eq(schema.projects.ownerId, ownerId)]
  if (opts?.status && opts.status !== "all") {
    conditions.push(eq(schema.projects.status, opts.status))
  }
  if (opts?.search?.trim()) {
    const term = `%${opts.search.trim()}%`
    conditions.push(
      or(
        ilike(schema.projects.name, term),
        ilike(schema.projects.slug, term),
        ilike(schema.projects.description, term),
      )!,
    )
  }
  return db()
    .select()
    .from(schema.projects)
    .where(and(...conditions))
    .orderBy(desc(schema.projects.updatedAt))
    .limit(opts?.limit ?? 1000)
}

export async function getProjectByIdAndOwner(id: string, ownerId: string) {
  const rows = await db()
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, id), eq(schema.projects.ownerId, ownerId)))
    .limit(1)
  return rows[0] ?? null
}

export async function getProjectIdsForOwner(ownerId: string) {
  return db()
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.ownerId, ownerId))
}

export async function countProjectsForOwner(ownerId: string) {
  const rows = await db()
    .select({ count: count() })
    .from(schema.projects)
    .where(eq(schema.projects.ownerId, ownerId))
  return rows[0].count
}

export async function insertProject(values: typeof schema.projects.$inferInsert) {
  const rows = await db()
    .insert(schema.projects)
    .values(values)
    .returning({ id: schema.projects.id })
  return rows[0]
}

export async function updateProject(
  id: string,
  ownerId: string,
  values: Partial<typeof schema.projects.$inferInsert>,
) {
  const rows = await db()
    .update(schema.projects)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(schema.projects.id, id), eq(schema.projects.ownerId, ownerId)))
    .returning()
  return rows[0] ?? null
}

export async function deleteProject(id: string, ownerId: string) {
  const rows = await db()
    .delete(schema.projects)
    .where(and(eq(schema.projects.id, id), eq(schema.projects.ownerId, ownerId)))
    .returning()
  return rows[0] ?? null
}

export async function projectSlugExists(ownerId: string, slug: string) {
  const rows = await db()
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.ownerId, ownerId), eq(schema.projects.slug, slug)))
    .limit(1)
  return rows.length > 0
}

export async function getProjectSlugsLike(ownerId: string, prefix: string) {
  return db()
    .select({ slug: schema.projects.slug })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.ownerId, ownerId),
        ilike(schema.projects.slug, `${prefix}%`),
      ),
    )
}

// ------------------------------------------------------------------
// Project files
// ------------------------------------------------------------------

export async function getProjectFilesForProject(projectId: string, ownerId: string, opts?: {
  limit?: number
  orderByPath?: boolean
  orderByUpdatedAt?: boolean
}) {
  let q = db()
    .select()
    .from(schema.projectFiles)
    .where(
      and(eq(schema.projectFiles.projectId, projectId), eq(schema.projectFiles.ownerId, ownerId)),
    )
    .$dynamic()
  if (opts?.orderByPath) {
    q = q.orderBy(asc(schema.projectFiles.path))
  } else if (opts?.orderByUpdatedAt) {
    q = q.orderBy(desc(schema.projectFiles.updatedAt))
  }
  if (opts?.limit) {
    q = q.limit(opts.limit)
  }
  return q
}

export async function getProjectFileByPath(projectId: string, ownerId: string, path: string) {
  const rows = await db()
    .select()
    .from(schema.projectFiles)
    .where(
      and(
        eq(schema.projectFiles.projectId, projectId),
        eq(schema.projectFiles.ownerId, ownerId),
        eq(schema.projectFiles.path, path),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

export async function countProjectFiles(projectId: string, ownerId: string) {
  const rows = await db()
    .select({ count: count() })
    .from(schema.projectFiles)
    .where(
      and(eq(schema.projectFiles.projectId, projectId), eq(schema.projectFiles.ownerId, ownerId)),
    )
  return rows[0].count
}

export async function upsertProjectFile(
  projectId: string,
  ownerId: string,
  file: { path: string; content: string; language?: string | null; sizeBytes?: number },
) {
  const sizeBytes = file.sizeBytes ?? new TextEncoder().encode(file.content).length
  return db()
    .insert(schema.projectFiles)
    .values({
      projectId,
      ownerId,
      path: file.path,
      content: file.content,
      language: file.language ?? null,
      sizeBytes,
    })
    .onConflictDoUpdate({
      target: [schema.projectFiles.projectId, schema.projectFiles.path],
      set: {
        content: file.content,
        language: file.language ?? null,
        sizeBytes,
        updatedAt: new Date(),
      },
    })
}

export async function upsertProjectFiles(
  projectId: string,
  ownerId: string,
  files: Array<{ path: string; content: string; language?: string | null; sizeBytes?: number }>,
) {
  if (files.length === 0) return
  return db()
    .insert(schema.projectFiles)
    .values(
      files.map((f) => ({
        projectId,
        ownerId,
        path: f.path,
        content: f.content,
        language: f.language ?? null,
        sizeBytes: f.sizeBytes ?? new TextEncoder().encode(f.content).length,
      })),
    )
    .onConflictDoUpdate({
      target: [schema.projectFiles.projectId, schema.projectFiles.path],
      set: {
        content: sql`excluded.content`,
        language: sql`excluded.language`,
        sizeBytes: sql`excluded.size_bytes`,
        updatedAt: new Date(),
      },
    })
}

export async function deleteProjectFilesNotInPaths(
  projectId: string,
  ownerId: string,
  keepPaths: string[],
) {
  return db()
    .delete(schema.projectFiles)
    .where(
      and(
        eq(schema.projectFiles.projectId, projectId),
        eq(schema.projectFiles.ownerId, ownerId),
        sql`${schema.projectFiles.path} not in (${sql.join(keepPaths.map((p) => sql`${p}`))})`,
      ),
    )
}

export async function getProjectFilesPaths(projectId: string, ownerId: string) {
  return db()
    .select({ path: schema.projectFiles.path })
    .from(schema.projectFiles)
    .where(
      and(eq(schema.projectFiles.projectId, projectId), eq(schema.projectFiles.ownerId, ownerId)),
    )
}

// ------------------------------------------------------------------
// AI tasks
// ------------------------------------------------------------------

export async function getAITasksForProject(
  projectId: string,
  ownerId: string,
  opts?: { limit?: number; selectCols?: boolean },
) {
  let q = db()
    .select()
    .from(schema.aiTasks)
    .where(and(eq(schema.aiTasks.projectId, projectId), eq(schema.aiTasks.ownerId, ownerId)))
    .orderBy(desc(schema.aiTasks.createdAt))
    .$dynamic()
  if (opts?.limit) {
    q = q.limit(opts.limit)
  }
  return q
}

export async function getAITaskListItemsForProject(projectId: string, ownerId: string, limit = 50) {
  return db()
    .select({
      id: schema.aiTasks.id,
      title: schema.aiTasks.title,
      kind: schema.aiTasks.kind,
      status: schema.aiTasks.status,
      createdAt: schema.aiTasks.createdAt,
      finishedAt: schema.aiTasks.finishedAt,
    })
    .from(schema.aiTasks)
    .where(and(eq(schema.aiTasks.projectId, projectId), eq(schema.aiTasks.ownerId, ownerId)))
    .orderBy(desc(schema.aiTasks.createdAt))
    .limit(limit)
}

export async function getAITaskById(taskId: string, ownerId: string) {
  const rows = await db()
    .select()
    .from(schema.aiTasks)
    .where(and(eq(schema.aiTasks.id, taskId), eq(schema.aiTasks.ownerId, ownerId)))
    .limit(1)
  return rows[0] ?? null
}

export async function getAITaskByIdOnly(taskId: string) {
  const rows = await db()
    .select()
    .from(schema.aiTasks)
    .where(eq(schema.aiTasks.id, taskId))
    .limit(1)
  return rows[0] ?? null
}

export async function getAITaskStatus(taskId: string, ownerId: string) {
  const rows = await db()
    .select({ status: schema.aiTasks.status })
    .from(schema.aiTasks)
    .where(and(eq(schema.aiTasks.id, taskId), eq(schema.aiTasks.ownerId, ownerId)))
    .limit(1)
  return rows[0]?.status ?? null
}

export async function insertAITask(values: typeof schema.aiTasks.$inferInsert) {
  const rows = await db().insert(schema.aiTasks).values(values).returning({ id: schema.aiTasks.id })
  return rows[0]
}

export async function updateAITask(
  taskId: string,
  ownerId: string,
  values: Partial<typeof schema.aiTasks.$inferInsert>,
  statusGate?: string,
) {
  const conditions = [
    eq(schema.aiTasks.id, taskId),
    eq(schema.aiTasks.ownerId, ownerId),
  ]
  if (statusGate) {
    conditions.push(eq(schema.aiTasks.status, statusGate))
  }
  const rows = await db()
    .update(schema.aiTasks)
    .set(values)
    .where(and(...conditions))
    .returning()
  return rows[0] ?? null
}

export async function linkTaskToRunSession(
  taskId: string,
  ownerId: string,
  runSessionId: string,
) {
  const rows = await db()
    .update(schema.aiTasks)
    .set({ runSessionId })
    .where(
      and(
        eq(schema.aiTasks.id, taskId),
        eq(schema.aiTasks.ownerId, ownerId),
        isNull(schema.aiTasks.runSessionId),
      ),
    )
    .returning()
  return rows[0] ?? null
}

export async function deleteAITaskIfTerminal(taskId: string, ownerId: string) {
  const rows = await db()
    .delete(schema.aiTasks)
    .where(
      and(
        eq(schema.aiTasks.id, taskId),
        eq(schema.aiTasks.ownerId, ownerId),
        inArray(schema.aiTasks.status, ["completed", "failed", "cancelled"]),
      ),
    )
    .returning()
  return rows[0] ?? null
}

export async function cancelAITask(taskId: string, ownerId: string) {
  const rows = await db()
    .update(schema.aiTasks)
    .set({
      status: "cancelled",
      error: "Cancelled by user.",
      finishedAt: new Date(),
    })
    .where(
      and(
        eq(schema.aiTasks.id, taskId),
        eq(schema.aiTasks.ownerId, ownerId),
        inArray(schema.aiTasks.status, ["pending", "running"]),
      ),
    )
    .returning()
  return rows[0] ?? null
}

export async function countLiveAITasks(ownerId: string) {
  const rows = await db()
    .select({ count: count() })
    .from(schema.aiTasks)
    .where(
      and(
        eq(schema.aiTasks.ownerId, ownerId),
        inArray(schema.aiTasks.status, ["pending", "running"]),
      ),
    )
  return rows[0].count
}

export async function getLatestAITaskOutputForProject(projectId: string, ownerId: string) {
  const rows = await db()
    .select({ output: schema.aiTasks.output, finishedAt: schema.aiTasks.finishedAt })
    .from(schema.aiTasks)
    .where(
      and(
        eq(schema.aiTasks.projectId, projectId),
        eq(schema.aiTasks.ownerId, ownerId),
        eq(schema.aiTasks.status, "completed"),
      ),
    )
    .orderBy(desc(schema.aiTasks.finishedAt))
    .limit(1)
  return rows[0] ?? null
}

export async function reapStaleAITasks(projectId: string, ownerId: string, cutoff: Date) {
  const rows = await db()
    .update(schema.aiTasks)
    .set({
      status: "failed",
      error: "Task stalled — marked failed after timeout.",
      finishedAt: new Date(),
    })
    .where(
      and(
        eq(schema.aiTasks.projectId, projectId),
        eq(schema.aiTasks.ownerId, ownerId),
        or(
          and(eq(schema.aiTasks.status, "pending"), lt(schema.aiTasks.createdAt, cutoff)),
          and(eq(schema.aiTasks.status, "running"), lt(schema.aiTasks.startedAt, cutoff)),
        )!,
      ),
    )
    .returning({ id: schema.aiTasks.id })
  return rows
}

export async function getLatestAITaskActivityForProjects(projectIds: string[], ownerId: string) {
  if (projectIds.length === 0) return []
  return db()
    .select({
      projectId: schema.aiTasks.projectId,
      title: schema.aiTasks.title,
      status: schema.aiTasks.status,
      createdAt: schema.aiTasks.createdAt,
    })
    .from(schema.aiTasks)
    .where(and(eq(schema.aiTasks.ownerId, ownerId), inArray(schema.aiTasks.projectId, projectIds)))
    .orderBy(desc(schema.aiTasks.createdAt))
}

// ------------------------------------------------------------------
// AI task events
// ------------------------------------------------------------------

export async function getAITaskEvents(taskId: string, ownerId: string, opts?: { limit?: number; kind?: string }) {
  let conditions = [eq(schema.aiTaskEvents.taskId, taskId), eq(schema.aiTaskEvents.ownerId, ownerId)]
  if (opts?.kind) {
    conditions.push(eq(schema.aiTaskEvents.kind, opts.kind))
  }
  let q = db()
    .select()
    .from(schema.aiTaskEvents)
    .where(and(...conditions))
    .orderBy(asc(schema.aiTaskEvents.createdAt))
    .$dynamic()
  if (opts?.limit) {
    q = q.limit(opts.limit)
  }
  return q
}

export async function insertAITaskEvent(
  values: Omit<typeof schema.aiTaskEvents.$inferInsert, "id" | "createdAt">,
) {
  return db().insert(schema.aiTaskEvents).values(values)
}

// ------------------------------------------------------------------
// Prompts
// ------------------------------------------------------------------

export async function getPromptById(promptId: string, ownerId: string) {
  const rows = await db()
    .select({ body: schema.prompts.body })
    .from(schema.prompts)
    .where(and(eq(schema.prompts.id, promptId), eq(schema.prompts.ownerId, ownerId)))
    .limit(1)
  return rows[0] ?? null
}

export async function insertPrompt(values: typeof schema.prompts.$inferInsert) {
  const rows = await db()
    .insert(schema.prompts)
    .values(values)
    .returning({ id: schema.prompts.id })
  return rows[0]
}

// ------------------------------------------------------------------
// Run sessions
// ------------------------------------------------------------------

export async function getRunSessionsForProject(
  projectId: string,
  ownerId: string,
  opts?: { limit?: number; status?: string[] },
) {
  let conditions = [
    eq(schema.runSessions.projectId, projectId),
    eq(schema.runSessions.ownerId, ownerId),
  ]
  if (opts?.status && opts.status.length > 0) {
    conditions.push(inArray(schema.runSessions.status, opts.status))
  }
  let q = db()
    .select()
    .from(schema.runSessions)
    .where(and(...conditions))
    .orderBy(desc(schema.runSessions.createdAt))
    .$dynamic()
  if (opts?.limit) {
    q = q.limit(opts.limit)
  }
  return q
}

export async function getRunSessionById(sessionId: string, ownerId: string) {
  const rows = await db()
    .select()
    .from(schema.runSessions)
    .where(and(eq(schema.runSessions.id, sessionId), eq(schema.runSessions.ownerId, ownerId)))
    .limit(1)
  return rows[0] ?? null
}

export async function getRunSessionStatus(sessionId: string, ownerId: string) {
  const rows = await db()
    .select({ status: schema.runSessions.status })
    .from(schema.runSessions)
    .where(and(eq(schema.runSessions.id, sessionId), eq(schema.runSessions.ownerId, ownerId)))
    .limit(1)
  return rows[0]?.status ?? null
}

export async function insertRunSession(values: typeof schema.runSessions.$inferInsert) {
  const rows = await db()
    .insert(schema.runSessions)
    .values(values)
    .returning({ id: schema.runSessions.id })
  return rows[0]
}

export async function updateRunSession(
  sessionId: string,
  ownerId: string,
  values: Partial<typeof schema.runSessions.$inferInsert>,
  statusGate?: string,
) {
  const conditions = [
    eq(schema.runSessions.id, sessionId),
    eq(schema.runSessions.ownerId, ownerId),
  ]
  if (statusGate) {
    conditions.push(eq(schema.runSessions.status, statusGate))
  }
  const rows = await db()
    .update(schema.runSessions)
    .set({ ...values, updatedAt: new Date() })
    .where(and(...conditions))
    .returning()
  return rows[0] ?? null
}

export async function deleteRunSession(sessionId: string, ownerId: string) {
  const rows = await db()
    .delete(schema.runSessions)
    .where(and(eq(schema.runSessions.id, sessionId), eq(schema.runSessions.ownerId, ownerId)))
    .returning()
  return rows[0] ?? null
}

export async function countLiveRunSessions(projectId: string, ownerId: string) {
  const rows = await db()
    .select({ count: count() })
    .from(schema.runSessions)
    .where(
      and(
        eq(schema.runSessions.projectId, projectId),
        eq(schema.runSessions.ownerId, ownerId),
        inArray(schema.runSessions.status, ["starting", "running", "stopping"]),
      ),
    )
  return rows[0].count
}

export async function getStaleRunSessions(projectId: string, ownerId: string, cutoff: Date) {
  return db()
    .select({ id: schema.runSessions.id })
    .from(schema.runSessions)
    .where(
      and(
        eq(schema.runSessions.projectId, projectId),
        eq(schema.runSessions.ownerId, ownerId),
        inArray(schema.runSessions.status, ["starting", "running"]),
        lt(schema.runSessions.startedAt, cutoff),
      ),
    )
}

export async function getLatestRunSessionActivityForProjects(projectIds: string[], ownerId: string) {
  if (projectIds.length === 0) return []
  return db()
    .select({
      projectId: schema.runSessions.projectId,
      status: schema.runSessions.status,
      createdAt: schema.runSessions.createdAt,
    })
    .from(schema.runSessions)
    .where(
      and(
        eq(schema.runSessions.ownerId, ownerId),
        inArray(schema.runSessions.projectId, projectIds),
      ),
    )
    .orderBy(desc(schema.runSessions.createdAt))
}

// ------------------------------------------------------------------
// Run events
// ------------------------------------------------------------------

export async function getRunEventsForSession(
  sessionId: string,
  ownerId: string,
  opts?: { limit?: number; projectId?: string },
) {
  let conditions = [eq(schema.runEvents.sessionId, sessionId), eq(schema.runEvents.ownerId, ownerId)]
  if (opts?.projectId) {
    conditions.push(eq(schema.runEvents.projectId, opts.projectId))
  }
  let q = db()
    .select()
    .from(schema.runEvents)
    .where(and(...conditions))
    .orderBy(asc(schema.runEvents.createdAt))
    .$dynamic()
  if (opts?.limit) {
    q = q.limit(opts.limit)
  }
  return q
}

export async function getRunEventsForProject(
  projectId: string,
  ownerId: string,
  opts?: { limit?: number },
) {
  let q = db()
    .select()
    .from(schema.runEvents)
    .where(
      and(
        eq(schema.runEvents.projectId, projectId),
        eq(schema.runEvents.ownerId, ownerId),
      ),
    )
    .orderBy(desc(schema.runEvents.createdAt))
    .$dynamic()
  if (opts?.limit) {
    q = q.limit(opts.limit)
  }
  return q
}

export async function insertRunEvent(values: typeof schema.runEvents.$inferInsert) {
  return db().insert(schema.runEvents).values(values)
}

// ------------------------------------------------------------------
// Provider configs
// ------------------------------------------------------------------

export async function getDefaultAIProviderConfig(ownerId: string) {
  const rows = await db()
    .select()
    .from(schema.providerConfigs)
    .where(
      and(
        eq(schema.providerConfigs.ownerId, ownerId),
        eq(schema.providerConfigs.kind, "ai"),
        eq(schema.providerConfigs.isActive, true),
        eq(schema.providerConfigs.isDefault, true),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

export async function getAIProviderConfigs(ownerId: string) {
  return db()
    .select()
    .from(schema.providerConfigs)
    .where(and(eq(schema.providerConfigs.ownerId, ownerId), eq(schema.providerConfigs.kind, "ai")))
}

export async function unsetDefaultAIProviderConfigs(ownerId: string) {
  return db()
    .update(schema.providerConfigs)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(and(eq(schema.providerConfigs.ownerId, ownerId), eq(schema.providerConfigs.kind, "ai")))
}

export async function upsertProviderConfig(values: typeof schema.providerConfigs.$inferInsert) {
  return db()
    .insert(schema.providerConfigs)
    .values(values)
    .onConflictDoUpdate({
      target: [
        schema.providerConfigs.ownerId,
        schema.providerConfigs.kind,
        schema.providerConfigs.name,
      ],
      set: {
        config: values.config,
        secretRef: values.secretRef,
        isActive: values.isActive,
        isDefault: values.isDefault,
        updatedAt: new Date(),
      },
    })
}

// ------------------------------------------------------------------
// User secrets
// ------------------------------------------------------------------

export async function getUserSecret(ownerId: string, kind: string, name: string) {
  const rows = await db()
    .select({ encryptedValue: schema.userSecrets.encryptedValue })
    .from(schema.userSecrets)
    .where(
      and(
        eq(schema.userSecrets.ownerId, ownerId),
        eq(schema.userSecrets.kind, kind),
        eq(schema.userSecrets.name, name),
      ),
    )
    .limit(1)
  return rows[0] ?? null
}

export async function upsertUserSecret(
  ownerId: string,
  kind: string,
  name: string,
  encryptedValue: string,
) {
  return db()
    .insert(schema.userSecrets)
    .values({ ownerId, kind, name, encryptedValue })
    .onConflictDoUpdate({
      target: [schema.userSecrets.ownerId, schema.userSecrets.kind, schema.userSecrets.name],
      set: {
        encryptedValue,
        updatedAt: new Date(),
      },
    })
}

export async function deleteUserSecret(ownerId: string, kind: string, name: string) {
  return db()
    .delete(schema.userSecrets)
    .where(
      and(
        eq(schema.userSecrets.ownerId, ownerId),
        eq(schema.userSecrets.kind, kind),
        eq(schema.userSecrets.name, name),
      ),
    )
}
