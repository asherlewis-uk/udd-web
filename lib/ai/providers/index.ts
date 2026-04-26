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
  /** Human-friendly model name for UI surfaces, e.g. "GPT-5 Mini" */
  modelDisplayName: string
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    model: "openai/gpt-5-mini",
    modelDisplayName: "GPT-5 Mini",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    model: "anthropic/claude-opus-4.6",
    modelDisplayName: "Claude Opus 4.6",
  },
}

const DEFAULT_PROVIDER: ProviderId = "openai"

export function isProviderId(value: string | undefined | null): value is ProviderId {
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

export type ProviderOption = { id: ProviderId; label: string }

export function getProviderOptions(): ProviderOption[] {
  return (Object.keys(PROVIDERS) as ProviderId[]).map((id) => {
    const provider = PROVIDERS[id]
    return { id, label: `${provider.label} (${provider.modelDisplayName})` }
  })
}
