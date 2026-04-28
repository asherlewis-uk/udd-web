"use client"

import { Play } from "lucide-react"
import { BottomControls } from "./bottom-controls"

interface PreviewScreenProps {
  onBackToChat: () => void
  onActionsClick: () => void
}

export function PreviewScreen({ onBackToChat, onActionsClick }: PreviewScreenProps) {
  return (
    <div className="flex h-full flex-col bg-background">
      {/* Center empty state */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <Play className="h-8 w-8 text-muted-foreground" />
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold text-foreground">
              Preview will appear here
            </h2>
            <p className="text-muted-foreground">
              Go back to chat to generate your app
            </p>
          </div>

          <button
            type="button"
            onClick={onBackToChat}
            className="mt-4 rounded-full bg-foreground px-8 py-3 text-base font-medium text-background active:scale-95 transition-transform"
          >
            Back to chat
          </button>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="pb-safe">
        <BottomControls onChatClick={onBackToChat} onActionsClick={onActionsClick} />
      </div>
    </div>
  )
}
