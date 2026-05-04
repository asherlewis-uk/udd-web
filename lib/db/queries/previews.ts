import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '../index'
import { previews } from '../schema/previews'

type CreatePreviewInput = Omit<typeof previews.$inferInsert, 'ownerId'>
type UpdatePreviewInput = Partial<Omit<typeof previews.$inferInsert, 'id' | 'ownerId' | 'createdAt'>>

export async function listPreviews(userId: string) {
  return getDb()
    .select()
    .from(previews)
    .where(eq(previews.ownerId, userId))
    .orderBy(desc(previews.createdAt))
}

export async function getPreviewById(userId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(previews)
    .where(and(eq(previews.id, id), eq(previews.ownerId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function createPreview(userId: string, input: CreatePreviewInput) {
  const rows = await getDb()
    .insert(previews)
    .values({ ...input, ownerId: userId })
    .returning()

  return rows[0] ?? null
}

export async function updatePreview(userId: string, id: string, input: UpdatePreviewInput) {
  const rows = await getDb()
    .update(previews)
    .set(input)
    .where(and(eq(previews.id, id), eq(previews.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}

export async function deletePreview(userId: string, id: string) {
  const rows = await getDb()
    .delete(previews)
    .where(and(eq(previews.id, id), eq(previews.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}
