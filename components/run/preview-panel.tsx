import { CheckCircle2, CircleAlert, Loader2, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RunStatus } from "@/lib/types"

/**
 * Status panel shown on the Run tab. The runtime currently validates
 * generated files via a real parser (see lib/runtime/executor.ts); nothing
 * is booted, served, or previewed. This panel must not imply otherwise —
 * see the Preview Truth / UI Copy Truth invariants in CLAUDE.md.
 */
export function PreviewPanel({
  status,
  projectName,
  className,
}: {
  status: RunStatus
  projectName: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-background/40 px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Validation
        </span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {projectName}
        </span>
      </div>

      <div className="relative flex min-h-[22rem] items-center justify-center bg-[oklch(0.12_0_0)] p-8">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative flex flex-col items-center gap-4 text-center">
          {status === "running" ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-medium">{projectName}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Files validated. See the log for per-file parse output.
                </div>
              </div>
            </>
          ) : status === "starting" ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-background">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
              <div className="text-sm text-muted-foreground">Validating files...</div>
            </>
          ) : status === "stopping" ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-background">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
              <div className="text-sm text-muted-foreground">Stopping...</div>
            </>
          ) : status === "error" ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-destructive/40 bg-destructive/10 text-destructive">
                <CircleAlert className="h-5 w-5" />
              </div>
              <div className="text-sm text-destructive">Validation failed</div>
              <div className="text-xs text-muted-foreground">
                See logs below for the parse errors.
              </div>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-background">
                <Play className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="text-sm font-medium">No run yet</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Start a run to validate the generated files for {projectName}.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
