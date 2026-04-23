"use client"

import { useActionState, useRef } from "react"
import { ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { createAITask } from "@/app/actions/ai"

type State = { error: string | null }

async function action(_prev: State, formData: FormData): Promise<State> {
  try {
    await createAITask(formData)
    return { error: null }
  } catch (err) {
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err
    // Next.js server action redirects throw a digest error — rethrow those.
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest?: unknown }).digest === "string" &&
      ((err as { digest: string }).digest as string).startsWith("NEXT_REDIRECT")
    ) {
      throw err
    }
    return { error: err instanceof Error ? err.message : "Something went wrong" }
  }
}

export function AIPromptForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, { error: null })
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <input type="hidden" name="project_id" value={projectId} />
      <Textarea
        name="prompt"
        placeholder="Describe a change. e.g. Scaffold a landing page with a hero and a CTA."
        rows={3}
        required
        disabled={pending}
        className="resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault()
            formRef.current?.requestSubmit()
          }
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-mono text-[11px]">pending → running → completed</span>
        </p>
        <div className="flex items-center gap-3">
          {state.error ? (
            <span className="text-xs text-destructive" role="alert">
              {state.error}
            </span>
          ) : null}
          <Button type="submit" size="sm" disabled={pending} className="gap-1.5">
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Queuing
              </>
            ) : (
              <>
                Run
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  )
}
