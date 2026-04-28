"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Menu, MessageSquare, MoreHorizontal } from "lucide-react";
import { ProjectActionsMenu } from "./project-actions-menu";
import { ProjectDrawer } from "./project-drawer";
import type { MobileProfile, MobileProject, MobileRunSession } from "./types";

export function MobileRouteShell({
  project,
  projects,
  profile,
  runSession,
  filesCount,
  title,
  subtitle,
  children,
  chatHref,
  showActions = true,
}: {
  project: MobileProject;
  projects: MobileProject[];
  profile: MobileProfile;
  runSession: MobileRunSession | null;
  filesCount: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  chatHref: string;
  showActions?: boolean;
}) {
  const router = useRouter();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isActionsOpen, setIsActionsOpen] = useState(false);

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="grid flex-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 pb-3 pt-safe">
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          className="mt-4 flex h-11 w-11 items-center justify-center rounded-full text-foreground transition active:scale-95"
          aria-label="Open projects"
        >
          <Menu className="h-6 w-6" />
        </button>

        <div className="mt-4 min-w-0 text-center">
          <h1 className="truncate text-base font-semibold text-foreground">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>

        {showActions ? (
          <button
            type="button"
            onClick={() => setIsActionsOpen(true)}
            className="mt-4 flex h-11 w-11 items-center justify-center rounded-full text-foreground transition active:scale-95"
            aria-label="Project actions"
          >
            <MoreHorizontal className="h-6 w-6" />
          </button>
        ) : (
          <Link
            href={chatHref}
            className="mt-4 flex h-11 w-11 items-center justify-center rounded-full text-foreground transition active:scale-95"
            aria-label="Back to chat"
          >
            <MessageSquare className="h-5 w-5" />
          </Link>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-safe">
        {children}
      </div>

      <ProjectDrawer
        isOpen={isDrawerOpen}
        currentProjectId={project.id}
        projects={projects}
        profile={profile}
        onClose={() => setIsDrawerOpen(false)}
        onSettingsClick={() => {
          setIsDrawerOpen(false);
          router.push("/settings");
        }}
      />

      <ProjectActionsMenu
        isOpen={isActionsOpen}
        projectId={project.id}
        runSession={runSession}
        filesCount={filesCount}
        onClose={() => setIsActionsOpen(false)}
      />
    </main>
  );
}
