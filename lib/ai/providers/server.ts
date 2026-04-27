import "server-only"
import { createClient } from "@/lib/supabase/server"
import { getActiveProvider, getProvider, isProviderId, type ProviderConfig } from "@/lib/ai/providers"
import { getSecret } from "@/lib/secrets"

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * Resolve the provider for a specific owner from provider_configs, with
 * fallback to the existing env-based selection.
 * Credentials are still environment-driven; this only resolves provider id.
 */
export async function getActiveProviderForOwner(
  ownerId: string,
  supabase?: SupabaseClient,
): Promise<ProviderConfig> {
  const db = supabase ?? (await createClient())
  const { data, error } = await db
    .from("provider_configs")
    .select("name")
    .eq("owner_id", ownerId)
    .eq("kind", "ai")
    .eq("is_active", true)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.log("[v0] getActiveProviderForOwner: provider lookup failed", {
      ownerId,
      error: error.message,
    })
    return getActiveProvider()
  }

  const savedName = typeof data?.name === "string" ? data.name.toLowerCase() : undefined
  if (isProviderId(savedName)) {
    return getProvider(savedName)
  }

  return getActiveProvider()
}

/**
 * Resolve a stored user credential for the given provider.
 * Returns the decrypted API key, or null if none is stored.
 * Server-side only — the returned value must never be sent to the client.
 */
export async function getCredentialForProvider(
  ownerId: string,
  providerId: string,
): Promise<string | null> {
  return getSecret(ownerId, "ai_provider_key", providerId)
}
