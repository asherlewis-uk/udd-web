"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock, Plus, Search, Settings, Star, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MobileProfile, MobileProject } from "./types";

export function ProjectDrawer({
  isOpen,
  currentProjectId,
  projects,
  profile,
  onClose,
  onSettingsClick,
}: {
  isOpen: boolean;
  currentProjectId: string;
  projects: MobileProject[];
  profile: MobileProfile;
  onClose: () => void;
  onSettingsClick: () => void;
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
  const favoriteProjects: MobileProject[] = [];

  if (!isOpen) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
        aria-label="Close project drawer"
      />

      <aside className="fixed inset-y-0 left-0 z-50 w-[86%] max-w-sm border-r border-border/70 bg-background shadow-[24px_0_80px_-64px_rgba(0,0,0,0.95)]">
        <div className="flex h-full flex-col">
          <div className="flex flex-col gap-3 p-4 pt-safe">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                Projects
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition active:scale-95"
                aria-label="Close drawer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <label className="relative flex-1">
                <span className="sr-only">Search projects</span>
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search projects"
                  className="h-10 w-full rounded-full bg-secondary pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <Link
                href="/projects/new"
                onClick={onClose}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition active:scale-95"
                aria-label="New project"
              >
                <Plus className="h-5 w-5" />
              </Link>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <ProjectSection
              icon={<Star className="h-4 w-4" />}
              title="Favorites"
              projects={favoriteProjects}
              currentProjectId={currentProjectId}
              emptyLabel="No favorites yet."
              onClose={onClose}
            />
            <ProjectSection
              icon={<Clock className="h-4 w-4" />}
              title="Recents"
              projects={filteredProjects}
              currentProjectId={currentProjectId}
              emptyLabel={
                query.trim() ? "No matching projects." : "No recent projects."
              }
              onClose={onClose}
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
                    {profile.displayName || profile.email}
                  </div>
                  {profile.displayName ? (
                    <div className="truncate text-xs text-muted-foreground">
                      {profile.email}
                    </div>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSettingsClick();
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition active:scale-95"
                aria-label="Settings"
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

function ProjectSection({
  icon,
  title,
  projects,
  currentProjectId,
  emptyLabel,
  onClose,
}: {
  icon: React.ReactNode;
  title: string;
  projects: MobileProject[];
  currentProjectId: string;
  emptyLabel: string;
  onClose: () => void;
}) {
  return (
    <section className="py-3">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icon}
        <h3 className="text-xs font-medium uppercase tracking-wide">{title}</h3>
      </div>
      <div className="flex flex-col gap-1">
        {projects.length > 0 ? (
          projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              active={project.id === currentProjectId}
              onClose={onClose}
            />
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

function ProjectRow({
  project,
  active,
  onClose,
}: {
  project: MobileProject;
  active: boolean;
  onClose: () => void;
}) {
  return (
    <Link
      href={`/projects/${project.id}`}
      onClick={onClose}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-2xl p-2 text-left transition",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/60",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/70">
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
      <span className="rounded-full bg-background/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {project.status}
      </span>
    </Link>
  );
}
