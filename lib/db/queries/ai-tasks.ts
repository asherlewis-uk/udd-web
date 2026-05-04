import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '../index'
import { aiTasks } from '../schema/ai-tasks'

type CreateAiTaskInput = Omit<typeof aiTasks.$inferInsert, 'ownerId'>
type UpdateAiTaskInput = Partial<Omit<typeof aiTasks.$inferInsert, 'id' | 'ownerId' | 'createdAt'>>

export async function listAiTasks(userId: string) {
  return getDb()
    .select()
    .from(aiTasks)
    .where(eq(aiTasks.ownerId, userId))
    .orderBy(desc(aiTasks.createdAt))
}

export async function getAiTaskById(userId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(aiTasks)
    .where(and(eq(aiTasks.id, id), eq(aiTasks.ownerId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function createAiTask(userId: string, input: CreateAiTaskInput) {
  const rows = await getDb()
    .insert(aiTasks)
    .values({ ...input, ownerId: userId })
    .returning()

  return rows[0] ?? null
}

export async function updateAiTask(userId: string, id: string, input: UpdateAiTaskInput) {
  const rows = await getDb()
    .update(aiTasks)
    .set(input)
    .where(and(eq(aiTasks.id, id), eq(aiTasks.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}

export async function deleteAiTask(userId: string, id: string) {
  const rows = await getDb()
    .delete(aiTasks)
    .where(and(eq(aiTasks.id, id), eq(aiTasks.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}
