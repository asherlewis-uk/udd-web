"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { Trash2, Archive, ArchiveRestore } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { deleteProject, updateProjectStatus } from "@/app/actions/projects"
import type { Project } from "@/lib/types"

export function ProjectDangerZone({ project }: { project: Project }) {
  const [pending, startTransition] = useTransition()
  const archived = project.status === "archived"

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-5">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">Danger zone</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Archive to hide from the active list, or delete to permanently remove everything.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              try {
                await updateProjectStatus(project.id, archived ? "draft" : "archived")
                toast.success(archived ? "Project restored" : "Project archived")
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed")
              }
            })
          }
        >
          {archived ? (
            <>
              <ArchiveRestore className="mr-2 h-4 w-4" />
              Restore project
            </>
          ) : (
            <>
              <Archive className="mr-2 h-4 w-4" />
              Archive project
            </>
          )}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={pending}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete project
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the project, its files, AI tasks, runs and logs.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await deleteProject(project.id)
                      toast.success("Project deleted")
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed")
                    }
                  })
                }
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
