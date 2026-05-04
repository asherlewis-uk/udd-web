import { and, asc, eq } from 'drizzle-orm'
import { getDb } from '../index'
import { aiTaskEvents } from '../schema/ai-task-events'

type CreateAiTaskEventInput = Omit<typeof aiTaskEvents.$inferInsert, 'ownerId'>

export async function listAiTaskEvents(userId: string) {
  return getDb()
    .select()
    .from(aiTaskEvents)
    .where(eq(aiTaskEvents.ownerId, userId))
    .orderBy(asc(aiTaskEvents.createdAt))
}

export async function getAiTaskEventById(userId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(aiTaskEvents)
    .where(and(eq(aiTaskEvents.id, id), eq(aiTaskEvents.ownerId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function createAiTaskEvent(userId: string, input: CreateAiTaskEventInput) {
  const rows = await getDb()
    .insert(aiTaskEvents)
    .values({ ...input, ownerId: userId })
    .returning()

  return rows[0] ?? null
}

export async function deleteAiTaskEvent(userId: string, id: string) {
  const rows = await getDb()
    .delete(aiTaskEvents)
    .where(and(eq(aiTaskEvents.id, id), eq(aiTaskEvents.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}
