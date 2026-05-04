import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '../index'
import { runSessions } from '../schema/run-sessions'

type CreateRunSessionInput = Omit<typeof runSessions.$inferInsert, 'ownerId'>
type UpdateRunSessionInput = Partial<Omit<typeof runSessions.$inferInsert, 'id' | 'ownerId' | 'createdAt'>>

export async function listRunSessions(userId: string) {
  return getDb()
    .select()
    .from(runSessions)
    .where(eq(runSessions.ownerId, userId))
    .orderBy(desc(runSessions.createdAt))
}

export async function getRunSessionById(userId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(runSessions)
    .where(and(eq(runSessions.id, id), eq(runSessions.ownerId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function createRunSession(userId: string, input: CreateRunSessionInput) {
  const rows = await getDb()
    .insert(runSessions)
    .values({ ...input, ownerId: userId })
    .returning()

  return rows[0] ?? null
}

export async function updateRunSession(userId: string, id: string, input: UpdateRunSessionInput) {
  const rows = await getDb()
    .update(runSessions)
    .set(input)
    .where(and(eq(runSessions.id, id), eq(runSessions.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}

export async function deleteRunSession(userId: string, id: string) {
  const rows = await getDb()
    .delete(runSessions)
    .where(and(eq(runSessions.id, id), eq(runSessions.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}
