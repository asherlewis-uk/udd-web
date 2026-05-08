"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth-session";
import {
  unsetDefaultAIProviderConfigs,
  upsertProviderConfig,
} from "@/lib/db/queries";
import { isProviderId, type ProviderId } from "@/lib/ai/providers";

type SaveAIProviderConfigInput = {
  providerId: ProviderId;
  metadata?: Record<string, unknown> | null;
  setAsDefault?: boolean;
};

const SECRETISH_KEY_PATTERN = /(key|token|secret|password)/i;
const SECRETISH_VALUE_PATTERN =
  /(sk-[a-z0-9_\-]{8,}|api[_-]?key|bearer\s+[a-z0-9._\-]{8,})/i;

function sanitizeMetadata(
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!value) return {};

  const sanitized: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (SECRETISH_KEY_PATTERN.test(key)) {
      throw new Error(
        "Save provider API keys through the credential manager, not provider metadata.",
      );
    }
    if (raw === null || typeof raw === "boolean" || typeof raw === "number") {
      sanitized[key] = raw;
      continue;
    }
    if (typeof raw === "string") {
      if (SECRETISH_VALUE_PATTERN.test(raw)) {
        throw new Error(
          "Save provider API keys through the credential manager, not provider metadata.",
        );
      }
      sanitized[key] = raw;
      continue;
    }
    throw new Error(
      "Metadata must contain only string, number, boolean, or null values.",
    );
  }

  return sanitized;
}

/**
 * Stores per-user AI provider configuration.
 * Stores provider selection + non-secret metadata only.
 * Credentials are stored only through app/actions/secrets.ts.
 */
export async function saveAIProviderConfig(
  input: SaveAIProviderConfigInput,
): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated");
  const user = session.user;

  const normalizedProvider = input.providerId?.toLowerCase();
  if (!isProviderId(normalizedProvider)) {
    throw new Error("Invalid provider id");
  }

  const config = sanitizeMetadata(input.metadata);
  const setAsDefault = input.setAsDefault ?? true;

  if (setAsDefault) {
    await unsetDefaultAIProviderConfigs(user.id);
  }

  try {
    await upsertProviderConfig({
      ownerId: user.id,
      kind: "ai",
      name: normalizedProvider,
      config,
      secretRef: null,
      isActive: true,
      isDefault: setAsDefault,
    });
  } catch (error) {
    const pgCode = (error as { code?: string }).code;
    if (setAsDefault && pgCode === "23505") {
      console.log(
        "[v0] saveAIProviderConfig: concurrent default save lost race",
        { pgCode },
      );
    } else {
      throw error;
    }
  }
  revalidatePath("/settings");
}
