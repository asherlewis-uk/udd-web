"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type LogEvent = {
  id: string;
  level: "info" | "warn" | "error" | "system" | string;
  source: "system" | "stdout" | "stderr" | "build" | string;
  message: string;
  created_at: string;
};

const LEVEL_TONE: Record<string, string> = {
  info: "text-muted-foreground",
  warn: "text-foreground",
  error: "text-destructive",
  system: "text-accent",
};

const SOURCE_TONE: Record<string, string> = {
  system: "text-muted-foreground/70",
  stdout: "text-muted-foreground/70",
  stderr: "text-destructive/80",
  build: "text-muted-foreground/70",
};

export function LogStream({
  events,
  autoScroll = true,
  emptyLabel = "Waiting for output...",
  className,
}: {
  events: LogEvent[];
  autoScroll?: boolean;
  emptyLabel?: string;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [events, autoScroll]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/70 bg-[oklch(0.13_0_0)] shadow-[0_24px_80px_-56px_rgba(0,0,0,0.95)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-background/55 px-3 py-2">
        <span className="font-mono text-[10px] uppercase text-muted-foreground">
          Runtime logs
        </span>
        <span className="font-mono text-[10px] text-muted-foreground/70">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="max-h-112 min-h-64 overflow-auto p-3 font-mono text-[12px] leading-relaxed"
      >
        {events.length === 0 ? (
          <div className="px-1 text-muted-foreground/70">{emptyLabel}</div>
        ) : (
          events.map((e) => (
            <div
              key={e.id}
              className="flex gap-3 border-b border-border/20 py-1 last:border-b-0"
            >
              <span className="shrink-0 text-muted-foreground/60">
                {new Date(e.created_at).toLocaleTimeString()}
              </span>
              <span
                className={cn(
                  "shrink-0 uppercase",
                  LEVEL_TONE[e.level] ?? "text-muted-foreground",
                )}
              >
                {e.level}
              </span>
              <span
                className={cn(
                  "shrink-0",
                  SOURCE_TONE[e.source] ?? "text-muted-foreground/70",
                )}
              >
                [{e.source}]
              </span>
              <span className="whitespace-pre-wrap break-all">{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
