import "server-only"
import { createClient } from "@/lib/supabase/server"
import { encrypt, decrypt } from "./crypto"

const TABLE = "user_secrets"

export async function saveSecret(
  ownerId: string,
  kind: string,
  name: string,
  value: string,
): Promise<void> {
  const supabase = await createClient()
  const encrypted_value = encrypt(value)
  const { error } = await supabase
    .from(TABLE)
    .upsert(
      { owner_id: ownerId, kind, name, encrypted_value },
      { onConflict: "owner_id,kind,name" },
    )
  if (error) throw new Error(`Failed to save secret: ${error.message}`)
}

export async function getSecret(
  ownerId: string,
  kind: string,
  name: string,
): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select("encrypted_value")
    .eq("owner_id", ownerId)
    .eq("kind", kind)
    .eq("name", name)
    .maybeSingle()
  if (error || !data) return null
  try {
    return decrypt(data.encrypted_value as string)
  } catch {
    console.log("[v0] getSecret: decrypt failed", { kind, name })
    return null
  }
}

export async function hasSecret(
  ownerId: string,
  kind: string,
  name: string,
): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select("id")
    .eq("owner_id", ownerId)
    .eq("kind", kind)
    .eq("name", name)
    .maybeSingle()
  if (error) {
    console.log("[v0] hasSecret: lookup failed", { kind, name, error: error.message })
    return false
  }
  return data !== null
}

export async function deleteSecret(
  ownerId: string,
  kind: string,
  name: string,
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("owner_id", ownerId)
    .eq("kind", kind)
    .eq("name", name)
  if (error) throw new Error(`Failed to delete secret: ${error.message}`)
}
