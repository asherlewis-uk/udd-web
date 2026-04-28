"use client"

import { MessageSquare, MoreHorizontal, Share, RotateCcw } from "lucide-react"

interface BottomControlsProps {
  onChatClick: () => void
  onActionsClick: () => void
}

export function BottomControls({ onChatClick, onActionsClick }: BottomControlsProps) {
  return (
    <div className="flex items-center justify-between px-4 pb-2">
      <button
        type="button"
        onClick={onChatClick}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-secondary-foreground active:scale-95 transition-transform"
        aria-label="Back to chat"
      >
        <MessageSquare className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-1 rounded-full bg-secondary p-1">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full text-secondary-foreground hover:bg-accent active:scale-95 transition-transform"
          aria-label="Refresh"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full text-secondary-foreground hover:bg-accent active:scale-95 transition-transform"
          aria-label="Share"
        >
          <Share className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onActionsClick}
          className="flex h-9 w-9 items-center justify-center rounded-full text-secondary-foreground hover:bg-accent active:scale-95 transition-transform"
          aria-label="More actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
