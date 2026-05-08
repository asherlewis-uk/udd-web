import "server-only";
import { getDefaultAIProviderConfig } from "@/lib/db/queries";
import {
  getActiveProvider,
  getProvider,
  isProviderId,
  PROVIDERS,
  type ProviderConfig,
  type ProviderCredentialStatus,
  type ProviderId,
} from "@/lib/ai/providers";
import { getSecret, getSecretStatus } from "@/lib/secrets";

/**
 * Resolve the provider for a specific owner from provider_configs, with
 * fallback to the existing env-based selection.
 */
export async function getActiveProviderForOwner(
  ownerId: string,
): Promise<ProviderConfig> {
  const row = await getDefaultAIProviderConfig(ownerId);

  const savedName =
    typeof row?.name === "string" ? row.name.toLowerCase() : undefined;
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
): Promise<Record<ProviderId, ProviderCredentialStatus>> {
  const result = {} as Record<ProviderId, ProviderCredentialStatus>;
  for (const providerId of Object.keys(PROVIDERS) as ProviderId[]) {
    result[providerId] = await getSecretStatus(
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
