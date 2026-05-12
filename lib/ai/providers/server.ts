import "server-only";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
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
import { getAIProviderConfigByName } from "@/lib/db/queries";

/**
 * Resolve the provider for a specific owner from provider_configs, with
 * fallback to the env-based default.
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
    if (providerId === "ollama") {
      result[providerId] = process.env.UDD_DEFAULT_AI_BASE_URL
        ? "valid"
        : "missing";
      continue;
    }
    result[providerId] = await getSecretStatus(
      ownerId,
      "ai_provider_key",
      providerId,
    );
  }
  return result;
}

export function hasGatewayEnvironmentCredential(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY ||
      process.env.UDD_DEFAULT_AI_BASE_URL ||
      process.env.VERCEL === "1",
  );
}

/**
 * Read custom baseURL from provider_configs if the user has configured one.
 */
async function getCustomBaseURL(
  ownerId: string,
  providerId: ProviderId,
): Promise<string | undefined> {
  const row = await getAIProviderConfigByName(ownerId, providerId)
  const config = row?.config as Record<string, unknown> | undefined
  if (config && typeof config.baseURL === "string" && config.baseURL.trim()) {
    return config.baseURL.trim()
  }
  return undefined
}

/**
 * Create a LanguageModel instance for the given provider config.
 * Uses direct API providers instead of AI Gateway so self-hosted works.
 * Respects per-user custom endpoint configuration from provider_configs.
 */
export async function createLanguageModel(
  provider: ProviderConfig,
  credential: string | null,
  ownerId?: string,
): Promise<LanguageModel> {
  const customBaseURL = ownerId
    ? await getCustomBaseURL(ownerId, provider.id)
    : undefined

  if (provider.id === "ollama") {
    const baseURL = customBaseURL ?? process.env.UDD_DEFAULT_AI_BASE_URL;
    const apiKey = process.env.UDD_DEFAULT_AI_API_KEY ?? "ollama";
    if (!baseURL) {
      throw new Error(
        "UDD_DEFAULT_AI_BASE_URL is not configured for Ollama",
      );
    }
    const ollamaProvider = createOpenAI({
      baseURL,
      apiKey,
      name: "ollama",
    });
    return ollamaProvider(provider.model);
  }

  if (provider.id === "openai") {
    if (!credential) {
      throw new Error(
        "No OpenAI API key configured. Save one in Settings or use Ollama.",
      );
    }
    const openaiProvider = createOpenAI({
      baseURL: customBaseURL,
      apiKey: credential,
    });
    return openaiProvider(provider.model);
  }

  if (provider.id === "anthropic") {
    if (!credential) {
      throw new Error(
        "No Anthropic API key configured. Save one in Settings or use Ollama.",
      );
    }
    const anthropicProvider = createAnthropic({
      baseURL: customBaseURL,
      apiKey: credential,
    });
    return anthropicProvider(provider.model);
  }

  throw new Error(`Unsupported provider: ${provider.id}`);
}
