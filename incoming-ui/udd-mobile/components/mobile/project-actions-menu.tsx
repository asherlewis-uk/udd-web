"use client"

import {
  Terminal,
  Code,
  ExternalLink,
  Pencil,
  Copy,
  Puzzle,
  Variable,
  Share2,
  Star,
  Trash2,
} from "lucide-react"

interface ProjectActionsMenuProps {
  isOpen: boolean
  onClose: () => void
}

export function ProjectActionsMenu({ isOpen, onClose }: ProjectActionsMenuProps) {
  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Menu */}
      <div className="fixed bottom-20 right-4 z-50 w-64 overflow-hidden rounded-2xl bg-secondary shadow-xl">
        {/* Primary actions */}
        <div className="p-1">
          <ActionRow icon={<Terminal className="h-5 w-5" />} label="Console" onClick={onClose} />
          <ActionRow icon={<Code className="h-5 w-5" />} label="View Code" onClick={onClose} />
          <ActionRow icon={<ExternalLink className="h-5 w-5" />} label="Open in Browser" onClick={onClose} />
        </div>

        <div className="mx-3 h-px bg-border" />

        {/* Management actions */}
        <div className="p-1">
          <ActionRow icon={<Pencil className="h-5 w-5" />} label="Rename" onClick={onClose} />
          <ActionRow icon={<Copy className="h-5 w-5" />} label="Duplicate" onClick={onClose} />
          <ActionRow icon={<Puzzle className="h-5 w-5" />} label="Manage Integrations" onClick={onClose} />
          <ActionRow icon={<Variable className="h-5 w-5" />} label="Env Variables" onClick={onClose} />
        </div>

        <div className="mx-3 h-px bg-border" />

        {/* Share and favorite */}
        <div className="p-1">
          <ActionRow icon={<Share2 className="h-5 w-5" />} label="Share" onClick={onClose} />
          <ActionRow icon={<Star className="h-5 w-5" />} label="Favorite" onClick={onClose} />
        </div>

        <div className="mx-3 h-px bg-border" />

        {/* Destructive action */}
        <div className="p-1">
          <ActionRow
            icon={<Trash2 className="h-5 w-5" />}
            label="Delete"
            onClick={onClose}
            destructive
          />
        </div>
      </div>
    </>
  )
}

function ActionRow({
  icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl p-3 active:bg-accent transition-colors ${
        destructive ? "text-destructive-foreground" : "text-foreground"
      }`}
    >
      <span className={destructive ? "text-destructive-foreground" : "text-muted-foreground"}>
        {icon}
      </span>
      <span className="text-base">{label}</span>
    </button>
  )
}
