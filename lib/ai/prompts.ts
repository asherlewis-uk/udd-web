import type { AITaskKind } from "@/lib/ai/types"

export type PromptContext = {
  prompt: string
  kind: AITaskKind
  projectName: string
  idea?: string | null
  description?: string | null
}

const SYSTEM_BASE = `You are a senior full-stack engineer helping build a Next.js 16 + Tailwind v4 + Supabase app.
You write focused, production-quality TypeScript. You prefer the App Router, React Server Components by default,
shadcn/ui primitives (imported from "@/components/ui/*"), and Tailwind utility classes.

Output MUST conform to the provided JSON schema. Never wrap the response in prose. Each file must contain complete,
syntactically valid contents — no placeholders, no "..." markers, no TODO stubs.

Guidelines:
- Keep files small and focused. 1-6 files per task is typical.
- Use TypeScript for .ts/.tsx files. Use JSON for configuration files.
- Never include secret keys or credentials.
- Prefer idiomatic Next.js and React 19 patterns.`

function kindInstruction(kind: AITaskKind): string {
  switch (kind) {
    case "scaffold":
      return "Scaffold: bootstrap a new feature or page end-to-end. Include the route/page file, any supporting components, and a minimal type definition if needed."
    case "edit":
      return "Edit: produce targeted file changes that realize the user's request. Include full file contents for every file you intend to write."
    case "refactor":
      return "Refactor: restructure existing code for clarity without changing behavior. Return each refactored file in full."
    case "explain":
      return "Explain: return a single markdown file (path ending in .md) that answers the question, followed optionally by a code example file if helpful."
    default:
      return "Task: satisfy the user's request with a small set of focused files."
  }
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const parts = [SYSTEM_BASE, ``, `Project: "${ctx.projectName}"`]
  if (ctx.idea) parts.push(`Idea: ${ctx.idea}`)
  if (ctx.description) parts.push(`Description: ${ctx.description}`)
  parts.push(``, kindInstruction(ctx.kind))
  return parts.join("\n")
}

export function buildUserPrompt(ctx: PromptContext): string {
  return ctx.prompt.trim()
}
