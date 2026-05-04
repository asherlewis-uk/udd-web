import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '../index'
import { prompts } from '../schema/prompts'

type CreatePromptInput = Omit<typeof prompts.$inferInsert, 'ownerId'>
type UpdatePromptInput = Partial<Omit<typeof prompts.$inferInsert, 'id' | 'ownerId' | 'createdAt'>>

export async function listPrompts(userId: string) {
  return getDb()
    .select()
    .from(prompts)
    .where(eq(prompts.ownerId, userId))
    .orderBy(desc(prompts.createdAt))
}

export async function getPromptById(userId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(prompts)
    .where(and(eq(prompts.id, id), eq(prompts.ownerId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function createPrompt(userId: string, input: CreatePromptInput) {
  const rows = await getDb()
    .insert(prompts)
    .values({ ...input, ownerId: userId })
    .returning()

  return rows[0] ?? null
}

export async function updatePrompt(userId: string, id: string, input: UpdatePromptInput) {
  const rows = await getDb()
    .update(prompts)
    .set(input)
    .where(and(eq(prompts.id, id), eq(prompts.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}

export async function deletePrompt(userId: string, id: string) {
  const rows = await getDb()
    .delete(prompts)
    .where(and(eq(prompts.id, id), eq(prompts.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}
