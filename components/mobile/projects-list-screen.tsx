"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MobileProfile, MobileProject } from "./types";

export function MobileProjectsListScreen({
  projects,
  profile,
}: {
  projects: MobileProject[];
  profile: MobileProfile;
}) {
  const [query, setQuery] = useState("");
  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter((project) =>
      [project.name, project.slug, project.description ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [projects, query]);

  return (
    <main className="flex min-h-dvh flex-col bg-background text-foreground">
      <div className="flex flex-col gap-4 px-4 pb-3 pt-safe">
        <div className="flex items-center gap-2 pt-4">
          <label className="relative flex-1">
            <span className="sr-only">Search projects</span>
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              className="h-12 w-full rounded-full border border-border/60 bg-secondary/80 pl-11 pr-4 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <Link
            href="/projects/new"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition active:scale-95"
            aria-label="New project"
          >
            <Plus className="h-5 w-5" />
          </Link>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
        <ProjectSection
          projects={filteredProjects}
          emptyLabel={
            query.trim() ? "No matching projects." : "No recent projects."
          }
        />
      </div>

      <div className="border-t border-border/70 p-4 pb-safe">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {profile.displayName || profile.email || "Account"}
              </div>
              {profile.displayName ? (
                <div className="truncate text-xs text-muted-foreground">
                  {profile.email}
                </div>
              ) : null}
            </div>
          </div>
          <Link
            href="/settings"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition active:scale-95"
            aria-label="Settings"
          >
            <Settings className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </main>
  );
}

function ProjectSection({
  projects,
  emptyLabel,
}: {
  projects: MobileProject[];
  emptyLabel: string;
}) {
  return (
    <section className="py-3">
      <div className="flex flex-col gap-1">
        {projects.length > 0 ? (
          projects.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))
        ) : (
          <div className="px-2 py-3 text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        )}
      </div>
    </section>
  );
}

function ProjectRow({ project }: { project: MobileProject }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className={cn(
        "flex items-center gap-3 rounded-2xl p-2 text-left transition active:scale-[0.99]",
        project.current
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/60",
      )}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary/80">
        <span className="text-xs font-medium text-muted-foreground">
          {project.name.slice(0, 2).toUpperCase()}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {project.name}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {project.lastOpenedLabel ?? project.updatedLabel}
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-secondary/90 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {project.status}
      </span>
    </Link>
  );
}
