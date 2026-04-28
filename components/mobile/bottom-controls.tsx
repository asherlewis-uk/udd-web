"use client";

import { MessageSquare, MoreHorizontal, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomControls({
  activeMode,
  onChatClick,
  onPreviewClick,
  onActionsClick,
}: {
  activeMode: "chat" | "preview";
  onChatClick: () => void;
  onPreviewClick: () => void;
  onActionsClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 pb-2">
      <button
        type="button"
        onClick={onChatClick}
        className={controlClass(activeMode === "chat")}
        aria-label="Chat"
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-1 rounded-full border border-border/60 bg-secondary/80 p-1">
        <button
          type="button"
          onClick={onPreviewClick}
          className={innerClass(activeMode === "preview")}
          aria-label="Preview"
        >
          <Play className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onActionsClick}
          className={innerClass(false)}
          aria-label="Project actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function controlClass(active: boolean): string {
  return cn(
    "flex h-11 w-11 items-center justify-center rounded-full border transition active:scale-95",
    active
      ? "border-foreground bg-foreground text-background"
      : "border-border/60 bg-secondary/80 text-secondary-foreground",
  );
}

function innerClass(active: boolean): string {
  return cn(
    "flex h-9 w-9 items-center justify-center rounded-full transition active:scale-95",
    active
      ? "bg-foreground text-background"
      : "text-secondary-foreground hover:bg-accent",
  );
}
