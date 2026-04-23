import { streamText, Output } from "ai"
import * as z from "zod"
import type { AITaskResult } from "@/lib/ai/types"
import { getActiveProvider, type ProviderConfig } from "@/lib/ai/providers"
import { buildSystemPrompt, buildUserPrompt, type PromptContext } from "@/lib/ai/prompts"

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
    .describe("Language identifier for syntax highlighting, e.g. 'tsx', 'ts', 'json', 'md', 'css'."),
  content: z.string().describe("Full file contents — no placeholders or ellipses."),
})

const ResultSchema = z.object({
  summary: z
    .string()
    .describe("A concise 1-3 sentence summary of what was produced."),
  files: z
    .array(FileSchema)
    .min(1)
    .max(8)
    .describe("Between 1 and 8 files implementing the request."),
})

export type StreamHooks = {
  /** Called once when the model has chosen a provider. Fires before any tokens. */
  onStart?: (info: { provider: ProviderConfig }) => Promise<void> | void
  /** Called when the partial object grows (new summary or new file). Throttled by caller. */
  onPartial?: (partial: {
    summaryChars: number
    fileCount: number
    latestFilePath: string | null
  }) => Promise<void> | void
}

/**
 * Real AI-backed generator. Preserves the AITaskResult shape exactly so the
 * rest of the system (service, UI, runtime executor) doesn't need to change.
 */
export async function generateResult(
  ctx: PromptContext,
  hooks?: StreamHooks,
  providerOverride?: ProviderConfig,
): Promise<AITaskResult> {
  const provider = providerOverride ?? getActiveProvider()
  if (hooks?.onStart) {
    await hooks.onStart({ provider })
  }

  const result = streamText({
    model: provider.model,
    system: buildSystemPrompt(ctx),
    prompt: buildUserPrompt(ctx),
    maxOutputTokens: 4000,
    output: Output.object({ schema: ResultSchema }),
  })

  let lastSummaryChars = 0
  let lastFileCount = 0
  let lastFilePath: string | null = null
  let latestPartial: unknown = undefined

  for await (const partial of result.partialOutputStream) {
    latestPartial = partial
    const summaryChars = typeof partial?.summary === "string" ? partial.summary.length : 0
    const files = Array.isArray(partial?.files) ? partial.files : []
    const fileCount = files.length
    const latestFile = files[fileCount - 1]
    const latestPath =
      latestFile && typeof latestFile.path === "string" ? latestFile.path : null

    const summaryGrew = summaryChars > 0 && lastSummaryChars === 0
    const fileAdded = fileCount > lastFileCount
    const pathChanged = latestPath !== null && latestPath !== lastFilePath

    if (summaryGrew || fileAdded || pathChanged) {
      lastSummaryChars = summaryChars
      lastFileCount = fileCount
      lastFilePath = latestPath
      if (hooks?.onPartial) {
        await hooks.onPartial({
          summaryChars,
          fileCount,
          latestFilePath: latestPath,
        })
      }
    }
  }

  // Validate the final streamed object. If the stream was truncated or malformed,
  // Zod will throw and the service will surface the error via the 'failed' event.
  const parsed = ResultSchema.parse(latestPartial)

  return {
    type: "code_change",
    summary: parsed.summary,
    files: parsed.files.map((f) => ({
      path: f.path,
      language: f.language,
      content: f.content,
    })),
  }
}
