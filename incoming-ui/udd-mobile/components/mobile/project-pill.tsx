"use client"

import { ChevronDown } from "lucide-react"

interface ProjectPillProps {
  projectTitle: string
  onClick: () => void
}

export function ProjectPill({ projectTitle, onClick }: ProjectPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-full bg-secondary/80 px-4 py-2 text-sm text-secondary-foreground active:scale-95 transition-transform"
    >
      <span className="max-w-[200px] truncate">{projectTitle}</span>
      <ChevronDown className="h-4 w-4 text-muted-foreground" />
    </button>
  )
}
