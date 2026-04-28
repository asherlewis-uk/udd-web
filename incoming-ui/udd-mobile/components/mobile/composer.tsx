"use client"

import { Plus, Mic } from "lucide-react"

interface ComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  disabled?: boolean
}

export function Composer({ value, onChange, onSubmit, disabled }: ComposerProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey && value.trim()) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 pb-2">
      <button
        type="button"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground active:scale-95 transition-transform"
        aria-label="Add attachment"
      >
        <Plus className="h-5 w-5" />
      </button>

      <div className="relative flex-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask UDD to build…"
          disabled={disabled}
          className="h-12 w-full rounded-full bg-secondary px-5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      </div>

      <button
        type="button"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground active:scale-95 transition-transform"
        aria-label="Voice input"
      >
        <Mic className="h-5 w-5" />
      </button>
    </div>
  )
}
