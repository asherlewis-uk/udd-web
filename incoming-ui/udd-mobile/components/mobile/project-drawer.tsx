"use client"

import { Search, Plus, Star, Clock, Settings, User, X } from "lucide-react"
import type { DemoProject } from "@/types/demo"

interface ProjectDrawerProps {
  isOpen: boolean
  onClose: () => void
  favoriteProjects: DemoProject[]
  recentProjects: DemoProject[]
  onSelectProject: (projectId: string) => void
  onSettingsClick: () => void
}

export function ProjectDrawer({
  isOpen,
  onClose,
  favoriteProjects,
  recentProjects,
  onSelectProject,
  onSettingsClick,
}: ProjectDrawerProps) {
  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 left-0 z-50 w-[85%] max-w-sm bg-background">
        <div className="flex h-full flex-col">
          {/* Header with search and new project */}
          <div className="flex flex-col gap-3 p-4 pt-safe">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Projects</h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground active:scale-95"
                aria-label="Close drawer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  className="h-10 w-full rounded-full bg-secondary pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background active:scale-95 transition-transform"
                aria-label="New project"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Project lists */}
          <div className="flex-1 overflow-y-auto px-4">
            {/* Favorites section */}
            <div className="mb-6">
              <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                <Star className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">
                  Favorites
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {favoriteProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    onClick={() => onSelectProject(project.id)}
                  />
                ))}
              </div>
            </div>

            {/* Recents section */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium uppercase tracking-wider">
                  Recents
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {recentProjects.map((project) => (
                  <ProjectRow
                    key={project.id}
                    project={project}
                    onClick={() => onSelectProject(project.id)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Bottom area */}
          <div className="border-t border-border p-4 pb-safe">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">Demo User</span>
                  <span className="text-xs text-muted-foreground">100 credits</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onSettingsClick()
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground active:scale-95 transition-transform"
                aria-label="Settings"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function ProjectRow({
  project,
  onClick,
}: {
  project: DemoProject
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl p-2 text-left active:bg-secondary transition-colors"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
        <span className="text-xs font-medium text-muted-foreground">
          {project.title.slice(0, 2).toUpperCase()}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">
          {project.title}
        </span>
        <span className="text-xs text-muted-foreground">{project.timestamp}</span>
      </div>
    </button>
  )
}
