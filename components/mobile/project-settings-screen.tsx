"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Archive, ArchiveRestore, ChevronRight, Trash2 } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import {
  deleteProject,
  updateProjectDetails,
  updateProjectStatus,
} from "@/app/actions/projects";
import type { Project } from "@/lib/types";

export function MobileProjectSettingsScreen({ project }: { project: Project }) {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [idea, setIdea] = useState(project.idea ?? "");
  const archived = project.status === "archived";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await updateProjectDetails(project.id, {
          name,
          description: description.trim() ? description : null,
          idea: idea.trim() ? idea : null,
        });
        toast.success("Project saved");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save");
      }
    });
  }

  function handleArchiveToggle() {
    startTransition(async () => {
      try {
        await updateProjectStatus(project.id, archived ? "draft" : "archived");
        toast.success(archived ? "Project restored" : "Project archived");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed");
      }
    });
  }

  return (
    <div className="flex min-h-full flex-col gap-6 pb-8">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <MobileSettingsGroup title="Project metadata">
          <label className="flex flex-col gap-2 px-4 py-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="h-11 rounded-2xl border border-border/60 bg-background/70 px-3 text-base text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <div className="mx-4 h-px bg-border/60" />
          <label className="flex flex-col gap-2 px-4 py-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Summary
            </span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="One line summary"
              className="h-11 rounded-2xl border border-border/60 bg-background/70 px-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </label>
          <div className="mx-4 h-px bg-border/60" />
          <label className="flex flex-col gap-2 px-4 py-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Idea
            </span>
            <textarea
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              placeholder="Describe what you want UDD to build."
              rows={5}
              className="resize-none rounded-2xl border border-border/60 bg-background/70 px-3 py-3 text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </label>
        </MobileSettingsGroup>

        <button
          type="submit"
          disabled={pending}
          className="mx-1 rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save project"}
        </button>
      </form>

      <MobileSettingsGroup title="Project state">
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <div className="text-base font-medium text-foreground">Status</div>
            <div className="mt-0.5 text-sm capitalize text-muted-foreground">
              {project.status}
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                disabled={pending}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border/70 px-3 py-2 text-sm text-foreground transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {archived ? (
                  <ArchiveRestore className="h-4 w-4" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                {archived ? "Restore" : "Archive"}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {archived ? "Restore project?" : "Archive project?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {archived
                    ? "This returns the project to your active workspace list."
                    : "This hides the project from your active workspace list without deleting it."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleArchiveToggle}>
                  {archived ? "Restore" : "Archive"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        <div className="mx-4 h-px bg-border/60" />
        <Link
          href="/settings"
          className="flex items-center justify-between gap-3 px-4 py-4"
        >
          <span className="min-w-0">
            <span className="block text-base font-medium text-foreground">
              Provider settings
            </span>
            <span className="block truncate text-sm text-muted-foreground">
              Default model and credentials
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </Link>
      </MobileSettingsGroup>

      <MobileSettingsGroup title="Danger" destructive>
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <div className="text-base font-medium text-foreground">
              Delete project
            </div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              Permanently remove this project and its history.
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                disabled={pending}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-destructive/50 text-destructive transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Delete project"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the project, files, generation runs,
                  previews, and console output.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() =>
                    startTransition(async () => {
                      await deleteProject(project.id);
                    })
                  }
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </MobileSettingsGroup>
    </div>
  );
}

function MobileSettingsGroup({
  title,
  destructive = false,
  children,
}: {
  title: string;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2
        className={
          destructive
            ? "px-1 text-xs font-medium uppercase tracking-wide text-destructive"
            : "px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        }
      >
        {title}
      </h2>
      <div className="overflow-hidden rounded-3xl border border-border/50 bg-secondary/55">
        {children}
      </div>
    </section>
  );
}
