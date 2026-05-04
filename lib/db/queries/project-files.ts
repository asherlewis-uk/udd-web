import { and, asc, eq } from 'drizzle-orm'
import { getDb } from '../index'
import { projectFiles } from '../schema/project-files'

type CreateProjectFileInput = Omit<typeof projectFiles.$inferInsert, 'ownerId'>
type UpdateProjectFileInput = Partial<Omit<typeof projectFiles.$inferInsert, 'id' | 'ownerId' | 'createdAt'>>

export async function listProjectFiles(userId: string) {
  return getDb()
    .select()
    .from(projectFiles)
    .where(eq(projectFiles.ownerId, userId))
    .orderBy(asc(projectFiles.path))
}

export async function getProjectFileById(userId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(projectFiles)
    .where(and(eq(projectFiles.id, id), eq(projectFiles.ownerId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function createProjectFile(userId: string, input: CreateProjectFileInput) {
  const rows = await getDb()
    .insert(projectFiles)
    .values({ ...input, ownerId: userId })
    .returning()

  return rows[0] ?? null
}

export async function updateProjectFile(userId: string, id: string, input: UpdateProjectFileInput) {
  const rows = await getDb()
    .update(projectFiles)
    .set(input)
    .where(and(eq(projectFiles.id, id), eq(projectFiles.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}

export async function deleteProjectFile(userId: string, id: string) {
  const rows = await getDb()
    .delete(projectFiles)
    .where(and(eq(projectFiles.id, id), eq(projectFiles.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}
