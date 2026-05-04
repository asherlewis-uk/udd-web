import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '../index'
import { exports as exportsTable } from '../schema/exports'

type CreateExportInput = Omit<typeof exportsTable.$inferInsert, 'ownerId'>
type UpdateExportInput = Partial<Omit<typeof exportsTable.$inferInsert, 'id' | 'ownerId' | 'createdAt'>>

export async function listExports(userId: string) {
  return getDb()
    .select()
    .from(exportsTable)
    .where(eq(exportsTable.ownerId, userId))
    .orderBy(desc(exportsTable.createdAt))
}

export async function getExportById(userId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(exportsTable)
    .where(and(eq(exportsTable.id, id), eq(exportsTable.ownerId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function createExport(userId: string, input: CreateExportInput) {
  const rows = await getDb()
    .insert(exportsTable)
    .values({ ...input, ownerId: userId })
    .returning()

  return rows[0] ?? null
}

export async function updateExport(userId: string, id: string, input: UpdateExportInput) {
  const rows = await getDb()
    .update(exportsTable)
    .set(input)
    .where(and(eq(exportsTable.id, id), eq(exportsTable.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}

export async function deleteExport(userId: string, id: string) {
  const rows = await getDb()
    .delete(exportsTable)
    .where(and(eq(exportsTable.id, id), eq(exportsTable.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}
