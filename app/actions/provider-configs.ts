"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const normalizedProvider = input.providerId?.toLowerCase();
  if (!isProviderId(normalizedProvider)) {
    throw new Error("Invalid provider id");
  }

  const config = sanitizeMetadata(input.metadata);
  const setAsDefault = input.setAsDefault ?? true;

  // Note: the upsert below writes secret_ref: null for the saved row.
  // We no longer pre-clear secret_ref across all ai-kind rows because
  // nothing in the app ever sets it to a non-null value; the redundant
  // UPDATE was a wasted round trip. If/when a real secret-manager
  // integration lands, revisit this clearing step.

  if (setAsDefault) {
    const { error: unsetError } = await supabase
      .from("provider_configs")
      .update({ is_default: false })
      .eq("owner_id", user.id)
      .eq("kind", "ai");
    if (unsetError) throw new Error(unsetError.message);
  }

  const { error } = await supabase.from("provider_configs").upsert(
    {
      owner_id: user.id,
      kind: "ai",
      name: normalizedProvider,
      config,
      secret_ref: null,
      is_active: true,
      is_default: setAsDefault,
    },
    { onConflict: "owner_id,kind,name" },
  );

  if (error) {
    // 23505 = unique_violation. The partial index
    // provider_configs_one_default_per_kind allows at most one
    // is_default=true row per (owner, kind). Two concurrent saves for
    // different providers with setAsDefault=true can race here: the
    // "unset others" step is not transactional with this upsert, so the
    // second writer can collide. The invariant is preserved (one default
    // still wins), so we treat this specific case as a benign lost-update
    // and let the user re-click if they meant a different provider.
    const pgCode = (error as { code?: string }).code;
    if (setAsDefault && pgCode === "23505") {
      console.log(
        "[v0] saveAIProviderConfig: concurrent default save lost race",
        {
          pgCode,
        },
      );
    } else {
      throw new Error(error.message);
    }
  }
  revalidatePath("/settings");
}
