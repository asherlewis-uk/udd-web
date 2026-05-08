import "server-only"
import { getUserSecret, upsertUserSecret, deleteUserSecret } from "@/lib/db/queries"
import { encrypt, decrypt } from "./crypto"

export type SecretStatus = "missing" | "valid" | "invalid"

export async function saveSecret(
  ownerId: string,
  kind: string,
  name: string,
  value: string,
): Promise<void> {
  const encryptedValue = encrypt(value)
  await upsertUserSecret(ownerId, kind, name, encryptedValue)
}

export async function getSecret(
  ownerId: string,
  kind: string,
  name: string,
): Promise<string | null> {
  const row = await getUserSecret(ownerId, kind, name)
  if (!row) return null
  try {
    return decrypt(row.encryptedValue)
  } catch {
    console.warn("[v0] getSecret: decrypt failed", { kind, name })
    return null
  }
}

export async function getSecretStatus(
  ownerId: string,
  kind: string,
  name: string,
): Promise<SecretStatus> {
  const row = await getUserSecret(ownerId, kind, name)
  if (!row) return "missing"
  try {
    decrypt(row.encryptedValue)
    return "valid"
  } catch {
    console.warn("[v0] getSecretStatus: decrypt failed", { kind, name })
    return "invalid"
  }
}

export async function hasSecret(
  ownerId: string,
  kind: string,
  name: string,
): Promise<boolean> {
  return (await getSecretStatus(ownerId, kind, name)) === "valid"
}

export async function deleteSecret(
  ownerId: string,
  kind: string,
  name: string,
): Promise<void> {
  await deleteUserSecret(ownerId, kind, name)
}
