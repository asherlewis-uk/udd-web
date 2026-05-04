import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '../index'
import { projects } from '../schema/projects'

type CreateProjectInput = Omit<typeof projects.$inferInsert, 'ownerId'>
type UpdateProjectInput = Partial<Omit<typeof projects.$inferInsert, 'id' | 'ownerId' | 'createdAt'>>

export async function listProjects(userId: string) {
  return getDb()
    .select()
    .from(projects)
    .where(eq(projects.ownerId, userId))
    .orderBy(desc(projects.lastOpenedAt), desc(projects.createdAt))
}

export async function getProjectById(userId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function createProject(userId: string, input: CreateProjectInput) {
  const rows = await getDb()
    .insert(projects)
    .values({ ...input, ownerId: userId })
    .returning()

  return rows[0] ?? null
}

export async function updateProject(userId: string, id: string, input: UpdateProjectInput) {
  const rows = await getDb()
    .update(projects)
    .set(input)
    .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}

export async function deleteProject(userId: string, id: string) {
  const rows = await getDb()
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}
