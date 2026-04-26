"use client"

import { useActionState, useRef } from "react"
import { ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { createAITask } from "@/app/actions/ai"
import { cn } from "@/lib/utils"

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

export function AIPromptForm({
  projectId,
  redirectTo,
  variant = "default",
}: {
  projectId: string
  redirectTo?: string
  variant?: "default" | "cockpit"
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, { error: null })
  const formRef = useRef<HTMLFormElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cockpit = variant === "cockpit"

  const handleAutoResize = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className={cn(
        "flex flex-col gap-3",
        cockpit ? "w-full" : "rounded-lg border border-border bg-card p-4",
      )}
    >
      <input type="hidden" name="project_id" value={projectId} />
      {redirectTo ? <input type="hidden" name="redirect_to" value={redirectTo} /> : null}
      <Textarea
        ref={textareaRef}
        name="prompt"
        placeholder={
          cockpit
            ? "Describe the next work item..."
            : "Describe a change. e.g. Scaffold a landing page with a hero and a CTA."
        }
        rows={cockpit ? 4 : 3}
        required
        disabled={pending}
        className={cn(
          "resize-none shadow-none",
          cockpit
            ? "min-h-[120px] max-h-64 rounded-lg border-border bg-background px-5 py-4 text-base leading-7 transition-[box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-foreground/20 md:text-base"
            : "border-0 bg-transparent p-0 text-sm focus-visible:ring-0",
        )}
        onInput={cockpit ? handleAutoResize : undefined}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault()
            formRef.current?.requestSubmit()
          }
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {cockpit ? (
            "UDD saves files only after validation passes."
          ) : (
            <>
              Work item lifecycle —{" "}
              <span className="font-mono text-[11px]">queued → working → saved</span>
            </>
          )}
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
                Submit
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  )
}
