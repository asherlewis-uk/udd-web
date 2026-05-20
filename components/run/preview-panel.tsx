import { CircleAlert, ExternalLink, Loader2, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RunStatus } from "@/lib/types";

/**
 * Status panel shown on the Run tab. It embeds a preview only when the
 * runtime has persisted a real local URL for a reachable process.
 */
export function PreviewPanel({
  status,
  projectName,
  previewUrl,
  error,
  className,
}: {
  status: RunStatus;
  projectName: string;
  previewUrl?: string | null;
  error?: string | null;
  className?: string;
}) {
  const hasPreview = status === "running" && Boolean(previewUrl);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg liquid-glass prismatic-border bg-card/60 shadow-[0_24px_80px_-56px_rgba(0,0,0,0.95)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-glass-border/20 bg-background/55 px-3 py-2">
        <span className="font-mono text-[10px] uppercase text-muted-foreground">
          Local preview
        </span>
        {hasPreview ? (
          <a
            href={previewUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            <span className="truncate">{previewUrl}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {projectName}
          </span>
        )}
      </div>

      {hasPreview ? (
        <iframe
          title={`${projectName} local preview`}
          src={previewUrl ?? undefined}
          sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"
          referrerPolicy="no-referrer"
          className="h-128 w-full bg-white"
        />
      ) : (
        <div className="relative flex min-h-88 items-center justify-center bg-black/40 p-8">
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />

          <div className="relative flex flex-col items-center gap-4 text-center">
            {status === "running" ? (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-glass-border/30 bg-background/70 text-destructive">
                  <CircleAlert className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm text-destructive">
                    Preview endpoint missing
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    This run is marked active, but no real preview URL is
                    recorded.
                  </div>
                </div>
              </>
            ) : status === "starting" ? (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-glass-border/30 bg-background/70">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    Validating files and starting local preview...
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Startup, dependency, and runtime failures appear in the
                    logs.
                  </div>
                </div>
              </>
            ) : status === "stopping" ? (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-glass-border/30 bg-background/70">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
                <div className="text-sm text-muted-foreground">
                  Stopping local preview and cleaning up workspace...
                </div>
              </>
            ) : status === "stopped" ? (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-glass-border/30 bg-background/70">
                  <Square className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-sm font-medium">Preview stopped</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Start again to validate saved files and launch a new local
                    process.
                  </div>
                </div>
              </>
            ) : status === "error" ? (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-destructive/40 bg-destructive/10 text-destructive">
                  <CircleAlert className="h-5 w-5" />
                </div>
                <div className="text-sm text-destructive">Run failed</div>
                <div className="max-w-md text-xs text-muted-foreground">
                  {error ||
                    "See logs for validation, startup, dependency, or runtime errors."}
                </div>
              </>
            ) : (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-glass-border/30 bg-background/70">
                  <Play className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-sm font-medium">No preview yet</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Start a run to validate saved files and launch a local
                    preview for {projectName}.
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
