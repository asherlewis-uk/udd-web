import { and, asc, eq } from 'drizzle-orm'
import { getDb } from '../index'
import { runEvents } from '../schema/run-events'

type CreateRunEventInput = Omit<typeof runEvents.$inferInsert, 'ownerId'>

export async function listRunEvents(userId: string) {
  return getDb()
    .select()
    .from(runEvents)
    .where(eq(runEvents.ownerId, userId))
    .orderBy(asc(runEvents.createdAt))
}

export async function getRunEventById(userId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(runEvents)
    .where(and(eq(runEvents.id, id), eq(runEvents.ownerId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function createRunEvent(userId: string, input: CreateRunEventInput) {
  const rows = await getDb()
    .insert(runEvents)
    .values({ ...input, ownerId: userId })
    .returning()

  return rows[0] ?? null
}

export async function deleteRunEvent(userId: string, id: string) {
  const rows = await getDb()
    .delete(runEvents)
    .where(and(eq(runEvents.id, id), eq(runEvents.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}
