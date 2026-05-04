import { eq } from 'drizzle-orm'
import { getDb } from '../index'
import { profiles } from '../schema/profiles'

type CreateProfileInput = Omit<typeof profiles.$inferInsert, 'id'>
type UpdateProfileInput = Partial<Omit<typeof profiles.$inferInsert, 'id' | 'createdAt'>>

export async function listProfiles(userId: string) {
  return getDb().select().from(profiles).where(eq(profiles.id, userId))
}

export async function getProfileById(userId: string) {
  const rows = await getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)

  return rows[0] ?? null
}

export async function createProfile(userId: string, input: CreateProfileInput = {}) {
  const rows = await getDb()
    .insert(profiles)
    .values({ ...input, id: userId })
    .returning()

  return rows[0] ?? null
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const rows = await getDb()
    .update(profiles)
    .set(input)
    .where(eq(profiles.id, userId))
    .returning()

  return rows[0] ?? null
}

export async function deleteProfile(userId: string) {
  const rows = await getDb()
    .delete(profiles)
    .where(eq(profiles.id, userId))
    .returning()

  return rows[0] ?? null
}
