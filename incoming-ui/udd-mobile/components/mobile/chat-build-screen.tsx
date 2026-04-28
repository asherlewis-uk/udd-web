"use client"

import { Menu, Play } from "lucide-react"
import { Composer } from "./composer"
import { ProjectPill } from "./project-pill"

interface ChatBuildScreenProps {
  composerValue: string
  onComposerChange: (value: string) => void
  onComposerSubmit: () => void
  isGenerating: boolean
  projectTitle: string
  onMenuClick: () => void
  onPreviewClick: () => void
  onProjectPillClick: () => void
}

export function ChatBuildScreen({
  composerValue,
  onComposerChange,
  onComposerSubmit,
  isGenerating,
  projectTitle,
  onMenuClick,
  onPreviewClick,
  onProjectPillClick,
}: ChatBuildScreenProps) {
  return (
    <div className="flex h-full flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-4">
        <button
          type="button"
          onClick={onMenuClick}
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground active:scale-95 transition-transform"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>

        <button
          type="button"
          onClick={onPreviewClick}
          className="flex h-11 w-11 items-center justify-center rounded-full text-foreground active:scale-95 transition-transform"
          aria-label="Open preview"
        >
          <Play className="h-6 w-6" />
        </button>
      </div>

      {/* Center area with UDD mark */}
      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-secondary">
            <span className="text-2xl font-bold text-foreground">UDD</span>
          </div>
          {isGenerating && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-2 w-2 animate-pulse rounded-full bg-foreground" />
              <span className="text-sm">Generating...</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom area */}
      <div className="flex flex-col gap-3 pb-safe">
        {/* Project pill */}
        <div className="flex justify-center">
          <ProjectPill projectTitle={projectTitle} onClick={onProjectPillClick} />
        </div>

        {/* Composer */}
        <Composer
          value={composerValue}
          onChange={onComposerChange}
          onSubmit={onComposerSubmit}
          disabled={isGenerating}
        />
      </div>
    </div>
  )
}
