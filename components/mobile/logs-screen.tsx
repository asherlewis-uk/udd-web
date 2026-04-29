import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileConsoleEvent = {
  id: string;
  level: string;
  source: string;
  message: string;
  createdLabel: string;
};

const LEVEL_TONE: Record<string, string> = {
  info: "text-muted-foreground",
  warn: "text-foreground",
  error: "text-destructive",
  system: "text-accent",
};

export function MobileLogsScreen({ events }: { events: MobileConsoleEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center py-16 text-center">
        <div className="flex max-w-xs flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/80 text-muted-foreground">
            <Terminal className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">
              No console output yet
            </h2>
            <p className="text-sm text-muted-foreground">
              Start preview to see output.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-3 pb-6">
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span className="uppercase tracking-wide">Console</span>
        <span>
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="overflow-hidden rounded-3xl border border-border/60 bg-[oklch(0.12_0_0)]">
        <div className="max-h-[72dvh] overflow-auto px-3 py-3 font-mono text-[12px] leading-relaxed">
          {events.map((event) => (
            <div
              key={event.id}
              className="grid grid-cols-[3.25rem_3.5rem_minmax(0,1fr)] gap-2 border-b border-border/20 py-1.5 last:border-b-0"
            >
              <span className="text-muted-foreground/60">
                {event.createdLabel}
              </span>
              <span
                className={cn(
                  "uppercase tracking-wide",
                  LEVEL_TONE[event.level] ?? "text-muted-foreground",
                )}
              >
                {event.level}
              </span>
              <span className="min-w-0 whitespace-pre-wrap wrap-break-word text-foreground/90">
                <span className="text-muted-foreground/60">
                  [{event.source}]
                </span>{" "}
                {event.message}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
