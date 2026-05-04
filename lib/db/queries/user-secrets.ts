import { and, asc, eq } from 'drizzle-orm'
import { getDb } from '../index'
import { userSecrets } from '../schema/user-secrets'

type CreateUserSecretInput = Omit<typeof userSecrets.$inferInsert, 'ownerId'>
type UpdateUserSecretInput = Partial<Omit<typeof userSecrets.$inferInsert, 'id' | 'ownerId' | 'createdAt'>>

export async function listUserSecrets(userId: string) {
  return getDb()
    .select()
    .from(userSecrets)
    .where(eq(userSecrets.ownerId, userId))
    .orderBy(asc(userSecrets.kind), asc(userSecrets.name))
}

export async function getUserSecretById(userId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(userSecrets)
    .where(and(eq(userSecrets.id, id), eq(userSecrets.ownerId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function createUserSecret(userId: string, input: CreateUserSecretInput) {
  const rows = await getDb()
    .insert(userSecrets)
    .values({ ...input, ownerId: userId })
    .returning()

  return rows[0] ?? null
}

export async function updateUserSecret(userId: string, id: string, input: UpdateUserSecretInput) {
  const rows = await getDb()
    .update(userSecrets)
    .set(input)
    .where(and(eq(userSecrets.id, id), eq(userSecrets.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}

export async function deleteUserSecret(userId: string, id: string) {
  const rows = await getDb()
    .delete(userSecrets)
    .where(and(eq(userSecrets.id, id), eq(userSecrets.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}
