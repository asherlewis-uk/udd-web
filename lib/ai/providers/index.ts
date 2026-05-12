/**
 * Provider abstraction. Supports OpenAI, Anthropic (BYOK), and Ollama
 * (self-hosted / local). Callers should use `getActiveProvider()` so the
 * rest of the AI layer stays provider-agnostic.
 */

export type ProviderId = "openai" | "anthropic" | "ollama";

export type ProviderConfig = {
  id: ProviderId;
  label: string;
  /** Model ID passed to the AI SDK provider */
  model: string;
  /** Human-friendly model name for UI surfaces */
  modelDisplayName: string;
};

export type ProviderCredentialStatus = "missing" | "valid" | "invalid";

const ollamaModel = process.env.UDD_DEFAULT_AI_MODEL ?? "qwen2.5-coder";

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    model: "gpt-4o-mini",
    modelDisplayName: "GPT-4o Mini",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    model: "claude-3-5-sonnet-20241022",
    modelDisplayName: "Claude 3.5 Sonnet",
  },
  ollama: {
    id: "ollama",
    label: "Ollama",
    model: ollamaModel,
    modelDisplayName: ollamaModel,
  },
};

const DEFAULT_PROVIDER: ProviderId = "openai";

export function isProviderId(
  value: string | undefined | null,
): value is ProviderId {
  return value === "openai" || value === "anthropic" || value === "ollama";
}

/**
 * The active provider resolves from environment config.
 * Self-hosted with UDD_DEFAULT_AI_BASE_URL → Ollama.
 * Otherwise UDD_AI_PROVIDER env var, falling back to OpenAI.
 */
export function getActiveProvider(): ProviderConfig {
  if (process.env.UDD_DEFAULT_AI_BASE_URL) {
    return PROVIDERS.ollama;
  }

  const envProvider = process.env.UDD_AI_PROVIDER?.toLowerCase();
  if (isProviderId(envProvider)) {
    return PROVIDERS[envProvider];
  }
  return PROVIDERS[DEFAULT_PROVIDER];
}

export function getProvider(id?: ProviderId | null): ProviderConfig {
  if (id && id in PROVIDERS) return PROVIDERS[id];
  return getActiveProvider();
}

export type ProviderOption = { id: ProviderId; label: string };

export function getProviderOptions(): ProviderOption[] {
  return (Object.keys(PROVIDERS) as ProviderId[]).map((id) => {
    const provider = PROVIDERS[id];
    return { id, label: `${provider.label} (${provider.modelDisplayName})` };
  });
}
