import { Globe, Loader2, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RunStatus } from "@/lib/types"

export function PreviewPanel({
  status,
  url,
  projectName,
  className,
}: {
  status: RunStatus
  url: string | null
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
      <div className="flex items-center gap-2 border-b border-border/60 bg-background/40 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-destructive/70" aria-hidden />
          <span className="h-2 w-2 rounded-full bg-muted-foreground/50" aria-hidden />
          <span className="h-2 w-2 rounded-full bg-accent/70" aria-hidden />
        </div>
        <div className="ml-2 flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border/60 bg-background px-2.5 py-1">
          <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {url ?? "about:blank"}
          </span>
        </div>
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          preview
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
          {status === "running" && url ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-accent/40 bg-accent/10 text-accent">
                <Play className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-medium">{projectName}</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  served at {url}
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Live preview iframe lands here when the runtime is real.
                </div>
              </div>
            </>
          ) : status === "starting" ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-background">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
              <div className="text-sm text-muted-foreground">Booting sandbox...</div>
            </>
          ) : status === "stopping" ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-background">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
              <div className="text-sm text-muted-foreground">Stopping server...</div>
            </>
          ) : status === "error" ? (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-destructive/40 bg-destructive/10 text-destructive">
                <Play className="h-5 w-5" />
              </div>
              <div className="text-sm text-destructive">Run failed</div>
              <div className="text-xs text-muted-foreground">
                See logs below for the error output.
              </div>
            </>
          ) : (
            <>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-background">
                <Play className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <div className="text-sm font-medium">No preview yet</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Start a run to boot a sandbox and see {projectName} served here.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
