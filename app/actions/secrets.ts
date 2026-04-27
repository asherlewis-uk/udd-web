"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { isProviderId, type ProviderId } from "@/lib/ai/providers"
import { saveSecret, deleteSecret, hasSecret } from "@/lib/secrets"

const PROVIDER_KEY_KIND = "ai_provider_key"

export async function saveProviderCredential(
  providerId: string,
  apiKey: string,
): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const normalized = providerId?.toLowerCase()
  if (!isProviderId(normalized)) throw new Error("Invalid provider id")

  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 20) {
    throw new Error("API key is too short or empty")
  }

  await saveSecret(user.id, PROVIDER_KEY_KIND, normalized, apiKey.trim())
  revalidatePath("/settings")
}

export async function deleteProviderCredential(providerId: string): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const normalized = providerId?.toLowerCase()
  if (!isProviderId(normalized)) throw new Error("Invalid provider id")

  await deleteSecret(user.id, PROVIDER_KEY_KIND, normalized)
  revalidatePath("/settings")
}

/**
 * Returns credential presence flags only — no secret values are returned.
 * Safe to call from server components or actions that display provider readiness.
 */
export async function getProviderCredentialStatuses(): Promise<Record<ProviderId, boolean>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const result: Record<ProviderId, boolean> = { openai: false, anthropic: false }
  for (const pid of Object.keys(result) as ProviderId[]) {
    result[pid] = await hasSecret(user.id, PROVIDER_KEY_KIND, pid)
  }
  return result
}
