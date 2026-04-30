"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getProvider,
  isProviderId,
  PROVIDERS,
  type ProviderCredentialStatus,
  type ProviderId,
} from "@/lib/ai/providers";
import { saveSecret, deleteSecret, getSecretStatus } from "@/lib/secrets";

const PROVIDER_KEY_KIND = "ai_provider_key";
const VALIDATION_TIMEOUT_MS = 10_000;

async function validateProviderCredential(
  providerId: ProviderId,
  apiKey: string,
): Promise<void> {
  const provider = getProvider(providerId);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(getValidationUrl(providerId), {
      method: "GET",
      headers: getValidationHeaders(providerId, apiKey),
      cache: "no-store",
      signal: controller.signal,
    });

    if (response.ok) return;

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `${provider.label} rejected this API key. Check the key and try again.`,
      );
    }

    throw new Error(
      `${provider.label} credential validation failed with HTTP ${response.status}. Try again later.`,
    );
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        throw new Error(
          `${provider.label} credential validation timed out. Try again.`,
        );
      }
      if (err.message.includes(provider.label)) throw err;
    }
    throw new Error(
      `${provider.label} credential validation could not reach the provider. Try again.`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function getValidationUrl(providerId: ProviderId): string {
  return providerId === "openai"
    ? "https://api.openai.com/v1/models"
    : "https://api.anthropic.com/v1/models";
}

function getValidationHeaders(
  providerId: ProviderId,
  apiKey: string,
): Record<string, string> {
  if (providerId === "openai") {
    return { Authorization: `Bearer ${apiKey}` };
  }

  return {
    "anthropic-version": "2023-06-01",
    "x-api-key": apiKey,
  };
}

export async function saveProviderCredential(
  providerId: string,
  apiKey: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const normalized = providerId?.toLowerCase();
  if (!isProviderId(normalized)) throw new Error("Invalid provider id");

  if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 20) {
    throw new Error("API key is too short or empty");
  }

  const trimmed = apiKey.trim();
  await validateProviderCredential(normalized, trimmed);
  await saveSecret(user.id, PROVIDER_KEY_KIND, normalized, trimmed);
  revalidatePath("/settings");
}

export async function deleteProviderCredential(
  providerId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const normalized = providerId?.toLowerCase();
  if (!isProviderId(normalized)) throw new Error("Invalid provider id");

  await deleteSecret(user.id, PROVIDER_KEY_KIND, normalized);
  revalidatePath("/settings");
}

/**
 * Returns decryptable credential flags only — no secret values are returned.
 * Safe to call from server components or actions that display provider readiness.
 */
export async function getProviderCredentialStatuses(): Promise<
  Record<ProviderId, ProviderCredentialStatus>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const result = {} as Record<ProviderId, ProviderCredentialStatus>;
  for (const pid of Object.keys(PROVIDERS) as ProviderId[]) {
    result[pid] = await getSecretStatus(user.id, PROVIDER_KEY_KIND, pid);
  }
  return result;
}
