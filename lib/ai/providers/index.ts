/**
 * Provider abstraction. The Vercel AI Gateway supports OpenAI and Anthropic
 * zero-config, so switching providers only requires swapping the model string.
 * Callers should use `getActiveProvider()` so the rest of the AI layer stays
 * provider-agnostic.
 */

export type ProviderId = "openai" | "anthropic"

export type ProviderConfig = {
  id: ProviderId
  label: string
  /** AI Gateway model string, e.g. "openai/gpt-5-mini" */
  model: string
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    model: "openai/gpt-5-mini",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    model: "anthropic/claude-opus-4.6",
  },
}

const DEFAULT_PROVIDER: ProviderId = "openai"

function isProviderId(value: string | undefined): value is ProviderId {
  return value === "openai" || value === "anthropic"
}

/**
 * The active provider resolves from `UDD_AI_PROVIDER` env var, falling back
 * to OpenAI. Individual callers may override via `getProvider(id)`.
 */
export function getActiveProvider(): ProviderConfig {
  const envProvider = process.env.UDD_AI_PROVIDER?.toLowerCase()
  if (isProviderId(envProvider)) {
    return PROVIDERS[envProvider]
  }
  return PROVIDERS[DEFAULT_PROVIDER]
}

export function getProvider(id?: ProviderId | null): ProviderConfig {
  if (id && id in PROVIDERS) return PROVIDERS[id]
  return getActiveProvider()
}
