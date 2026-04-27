import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveProvider,
  getProvider,
  isProviderId,
  PROVIDERS,
  type ProviderConfig,
  type ProviderId,
} from "@/lib/ai/providers";
import { getSecret, hasSecret } from "@/lib/secrets";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Resolve the provider for a specific owner from provider_configs, with
 * fallback to the existing env-based selection.
 */
export async function getActiveProviderForOwner(
  ownerId: string,
  supabase?: SupabaseClient,
): Promise<ProviderConfig> {
  const db = supabase ?? (await createClient());
  const { data, error } = await db
    .from("provider_configs")
    .select("name")
    .eq("owner_id", ownerId)
    .eq("kind", "ai")
    .eq("is_active", true)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.log("[v0] getActiveProviderForOwner: provider lookup failed", {
      ownerId,
      error: error.message,
    });
    return getActiveProvider();
  }

  const savedName =
    typeof data?.name === "string" ? data.name.toLowerCase() : undefined;
  if (isProviderId(savedName)) {
    return getProvider(savedName);
  }

  return getActiveProvider();
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
  return getSecret(ownerId, "ai_provider_key", providerId);
}

export async function getProviderCredentialStatusesForOwner(
  ownerId: string,
): Promise<Record<ProviderId, boolean>> {
  const result = {} as Record<ProviderId, boolean>;
  for (const providerId of Object.keys(PROVIDERS) as ProviderId[]) {
    result[providerId] = await hasSecret(
      ownerId,
      "ai_provider_key",
      providerId,
    );
  }
  return result;
}

export function hasGatewayEnvironmentCredential(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL === "1");
}
