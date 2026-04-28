"use client";

import { ChevronDown } from "lucide-react";

export function ProjectPill({
  projectTitle,
  status,
  onClick,
}: {
  projectTitle: string;
  status: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex max-w-[min(22rem,calc(100vw-2rem))] items-center gap-2 rounded-full border border-border/70 bg-secondary/80 px-4 py-2 text-sm text-secondary-foreground shadow-[0_18px_60px_-48px_rgba(0,0,0,0.95)] transition active:scale-95"
      aria-label="Open project drawer"
    >
      <span className="min-w-0 truncate">{projectTitle}</span>
      <span className="rounded-full bg-background/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {status}
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
