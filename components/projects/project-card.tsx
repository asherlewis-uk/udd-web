"use client"

import Link from "next/link"
import { useTransition } from "react"
import { MoreHorizontal, Archive, ArchiveRestore, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { StatusPill } from "@/components/status-pill"
import { ActivitySummary, type ProjectActivity } from "@/components/projects/activity-summary"
import { formatRelative } from "@/lib/slug"
import { deleteProject, updateProjectStatus } from "@/app/actions/projects"
import type { Project } from "@/lib/types"

export function ProjectCard({
  project,
  activity,
}: {
  project: Project
  activity?: ProjectActivity
}) {
  const [pending, startTransition] = useTransition()

  const archived = project.status === "archived"

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-lg border border-border bg-card transition hover:border-border/80 hover:bg-card/80">
      <Link
        href={`/projects/${project.id}`}
        className="flex flex-1 flex-col gap-4 p-5 outline-none focus-visible:bg-card/90"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-medium tracking-tight">{project.name}</h3>
              <StatusPill status={project.status} />
            </div>
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
              {project.slug}
            </p>
          </div>
        </div>
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {project.description || project.idea || "No description yet."}
        </p>
        {activity ? (
          <div className="mt-auto border-t border-border pt-3">
            <ActivitySummary activity={activity} />
          </div>
        ) : (
          <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
            <span>Opened {formatRelative(project.last_opened_at ?? project.updated_at)}</span>
            <span>Updated {formatRelative(project.updated_at)}</span>
          </div>
        )}
      </Link>

      <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="grid h-8 w-8 place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground"
            aria-label="Project menu"
          >
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              disabled={pending}
              onSelect={(e) => {
                e.preventDefault()
                startTransition(async () => {
                  try {
                    await updateProjectStatus(project.id, archived ? "draft" : "archived")
                    toast.success(archived ? "Project restored" : "Project archived")
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed")
                  }
                })
              }}
            >
              {archived ? (
                <>
                  <ArchiveRestore className="mr-2 h-4 w-4" />
                  Restore
                </>
              ) : (
                <>
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={(e) => e.preventDefault()}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes the project and all associated files, AI tasks, and
                    run history. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => {
                      startTransition(async () => {
                        try {
                          await deleteProject(project.id)
                          toast.success("Project deleted")
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Failed")
                        }
                      })
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
