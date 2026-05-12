import { streamText, Output } from "ai";
import * as z from "zod";
import type { AITaskKind, AITaskResult } from "@/lib/ai/types";
import { getActiveProvider, type ProviderConfig } from "@/lib/ai/providers";
import { createLanguageModel } from "@/lib/ai/providers/server";
import {
  buildSystemPrompt,
  buildUserPrompt,
  type PromptContext,
} from "@/lib/ai/prompts";

/**
 * Derive the per-call output token cap from the task kind. Scaffold tasks
 * routinely emit 3-6 files of real content and hit the ceiling at 4000,
 * producing truncated objects that then fail Zod validation. Other kinds
 * (edit/refactor/explain/other) are typically 1-3 focused files and stay
 * well under the default ceiling.
 */
function maxOutputTokensFor(kind: AITaskKind): number {
  return kind === "scaffold" ? 8000 : 4000;
}

/**
 * Schema the model must conform to. All fields are required (no optional()) so
 * this works with OpenAI strict mode enforced by AI SDK 6's Output.object().
 */
const FileSchema = z.object({
  path: z
    .string()
    .describe("Relative repo path, e.g. 'app/page.tsx'. No leading slash."),
  language: z
    .string()
    .describe(
      "Language identifier for syntax highlighting, e.g. 'tsx', 'ts', 'json', 'md', 'css'.",
    ),
  content: z
    .string()
    .describe("Full file contents — no placeholders or ellipses."),
});

const ResultSchema = z.object({
  summary: z
    .string()
    .describe("A concise 1-3 sentence summary of what was produced."),
  files: z
    .array(FileSchema)
    .min(1)
    .max(8)
    .describe("Between 1 and 8 files implementing the request."),
});

export type StreamHooks = {
  /** Called once when the model has chosen a provider. Fires before any tokens. */
  onStart?: (info: { provider: ProviderConfig }) => Promise<void> | void;
  /** Called when the partial object grows (new summary or new file). Throttled by caller. */
  onPartial?: (partial: {
    summaryChars: number;
    fileCount: number;
    latestFilePath: string | null;
  }) => Promise<void> | void;
};

export type GenerateOptions = {
  hooks?: StreamHooks;
  /** AbortSignal to cancel the stream (e.g. timeout or user cancel). */
  abortSignal?: AbortSignal;
  /** Override the provider (e.g. from per-user saved default). */
  provider?: ProviderConfig;
  /**
   * User-owned API key resolved server-side by getCredentialForProvider.
   * Present when the user has stored a BYOK credential for the selected provider.
   * Must never be returned to the client.
   */
  credential?: string | null;
  /** Owner ID for resolving per-user custom endpoint configuration. */
  ownerId?: string;
};

/**
 * Real AI-backed generator. Preserves the AITaskResult shape exactly so the
 * rest of the system (service, UI, runtime executor) doesn't need to change.
 */
export async function generateResult(
  ctx: PromptContext,
  options?: GenerateOptions,
): Promise<AITaskResult> {
  // Use provided override (e.g. per-user saved default) or fall back to env.
  const provider = options?.provider ?? getActiveProvider();
  if (options?.hooks?.onStart) {
    await options.hooks.onStart({ provider });
  }

  const model = await createLanguageModel(
    provider,
    options?.credential ?? null,
    options?.ownerId,
  );

  const result = streamText({
    model,
    system: buildSystemPrompt(ctx),
    prompt: buildUserPrompt(ctx),
    maxOutputTokens: maxOutputTokensFor(ctx.kind),
    output: Output.object({ schema: ResultSchema }),
    abortSignal: options?.abortSignal,
  });

  let lastSummaryChars = 0;
  let lastFileCount = 0;
  let lastFilePath: string | null = null;
  let latestPartial: unknown = undefined;

  for await (const partial of result.partialOutputStream) {
    latestPartial = partial;
    const summaryChars =
      typeof partial?.summary === "string" ? partial.summary.length : 0;
    const files = Array.isArray(partial?.files) ? partial.files : [];
    const fileCount = files.length;
    const latestFile = files[fileCount - 1];
    const latestPath =
      latestFile && typeof latestFile.path === "string"
        ? latestFile.path
        : null;

    const summaryGrew = summaryChars > 0 && lastSummaryChars === 0;
    const fileAdded = fileCount > lastFileCount;
    const pathChanged = latestPath !== null && latestPath !== lastFilePath;

    if (summaryGrew || fileAdded || pathChanged) {
      lastSummaryChars = summaryChars;
      lastFileCount = fileCount;
      lastFilePath = latestPath;
      if (options?.hooks?.onPartial) {
        await options.hooks.onPartial({
          summaryChars,
          fileCount,
          latestFilePath: latestPath,
        });
      }
    }
  }

  // Validate the final streamed object. If the stream was truncated or malformed,
  // Zod will throw and the service will surface the error via the 'failed' event.
  const parsed = ResultSchema.parse(latestPartial);

  return {
    type: "code_change",
    summary: parsed.summary,
    files: parsed.files.map((f) => ({
      path: f.path,
      language: f.language,
      content: f.content,
    })),
  };
}
