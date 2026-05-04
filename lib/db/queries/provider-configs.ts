import { and, asc, eq } from 'drizzle-orm'
import { getDb } from '../index'
import { providerConfigs } from '../schema/provider-configs'

type CreateProviderConfigInput = Omit<typeof providerConfigs.$inferInsert, 'ownerId'>
type UpdateProviderConfigInput = Partial<Omit<typeof providerConfigs.$inferInsert, 'id' | 'ownerId' | 'createdAt'>>

export async function listProviderConfigs(userId: string) {
  return getDb()
    .select()
    .from(providerConfigs)
    .where(eq(providerConfigs.ownerId, userId))
    .orderBy(asc(providerConfigs.kind), asc(providerConfigs.name))
}

export async function getProviderConfigById(userId: string, id: string) {
  const rows = await getDb()
    .select()
    .from(providerConfigs)
    .where(and(eq(providerConfigs.id, id), eq(providerConfigs.ownerId, userId)))
    .limit(1)

  return rows[0] ?? null
}

export async function createProviderConfig(userId: string, input: CreateProviderConfigInput) {
  const rows = await getDb()
    .insert(providerConfigs)
    .values({ ...input, ownerId: userId })
    .returning()

  return rows[0] ?? null
}

export async function updateProviderConfig(userId: string, id: string, input: UpdateProviderConfigInput) {
  const rows = await getDb()
    .update(providerConfigs)
    .set(input)
    .where(and(eq(providerConfigs.id, id), eq(providerConfigs.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}

export async function deleteProviderConfig(userId: string, id: string) {
  const rows = await getDb()
    .delete(providerConfigs)
    .where(and(eq(providerConfigs.id, id), eq(providerConfigs.ownerId, userId)))
    .returning()

  return rows[0] ?? null
}
