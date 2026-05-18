"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, FolderGit2, Play, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatBuildScreen } from "./chat-build-screen";
import { PreviewScreen } from "./preview-screen";
import { ProjectActionsMenu } from "./project-actions-menu";
import { ProjectDrawer } from "./project-drawer";
import { SettingsScreen } from "./settings-screen";
import type { MobileScreen, MobileShellProps } from "./types";

function WelcomeScreen() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex items-center justify-between px-4 pt-safe pb-2">
        <span className="text-sm font-semibold tracking-tight">UDD</span>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/auth/login">Sign in</Link>
          </Button>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-8">
        <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            Early access &middot; beta
          </div>
          <h1 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight">
            The desktop for turning ideas into code.
          </h1>
          <p className="text-pretty mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            UDD is a personal, web-based dev workspace. Draft an idea, scaffold
            a project, let AI help you edit files, then validate and preview the
            result locally.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button asChild size="sm">
              <Link href="/auth/sign-up">
                Create your workspace
                <ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/auth/login">I already have an account</Link>
            </Button>
          </div>
        </div>

        <section className="mx-auto mt-8 grid w-full max-w-md grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
          {[
            {
              icon: FolderGit2,
              label: "Projects",
              desc: "Organize every idea as a real repo.",
            },
            {
              icon: Bot,
              label: "AI tasks",
              desc: "Scaffold, edit, refactor with guardrails.",
            },
            {
              icon: Play,
              label: "Runtime",
              desc: "Validate saved files and preview locally.",
            },
            {
              icon: Terminal,
              label: "Logs",
              desc: "Readable build and runtime output.",
            },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex flex-col gap-1.5 bg-card p-4">
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
              <div className="text-sm font-medium">{label}</div>
              <div className="text-xs leading-relaxed text-muted-foreground">
                {desc}
              </div>
            </div>
          ))}
        </section>
      </main>

      <footer className="flex items-center justify-between px-4 pb-safe pt-2 text-xs text-muted-foreground">
        <span>UDD &middot; Universal Dev Desktop</span>
        <span className="font-mono">single-user beta</span>
      </footer>
    </div>
  );
}

export function MobileShell(props: Partial<MobileShellProps> = {}) {
  // When no project prop is provided, render the welcome/landing screen
  if (!("project" in props)) {
    return <WelcomeScreen />;
  }

  const {
    project,
    projects,
    profile,
    conversation,
    filesCount,
    latestRunSession,
    runEvents,
    activeProvider,
    providerReadiness,
    taskInFlight,
    nextAction,
  } = props as MobileShellProps;

  const [currentScreen, setCurrentScreen] = useState<MobileScreen>("chat");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);

  const navigateToChat = useCallback(() => {
    setCurrentScreen("chat");
    setIsActionsMenuOpen(false);
  }, []);

  const navigateToPreview = useCallback(() => {
    setCurrentScreen("preview");
    setIsActionsMenuOpen(false);
  }, []);

  const navigateToSettings = useCallback(() => {
    setCurrentScreen("settings");
    setIsDrawerOpen(false);
    setIsActionsMenuOpen(false);
  }, []);

  return (
    <div className="h-dvh min-h-0 w-full overflow-hidden bg-background md:h-[calc(100dvh-3.5rem)]">
      {currentScreen === "chat" ? (
        <ChatBuildScreen
          project={project}
          conversation={conversation}
          activeProvider={activeProvider}
          providerReadiness={providerReadiness}
          taskInFlight={taskInFlight}
          nextAction={nextAction}
          onMenuClick={() => setIsDrawerOpen(true)}
          onPreviewClick={navigateToPreview}
          onProjectPillClick={() => setIsDrawerOpen(true)}
        />
      ) : null}

      {currentScreen === "preview" ? (
        <PreviewScreen
          projectId={project.id}
          projectName={project.name}
          filesCount={filesCount}
          session={latestRunSession}
          events={runEvents}
          onBackToChat={navigateToChat}
          onActionsClick={() => setIsActionsMenuOpen(true)}
        />
      ) : null}

      {currentScreen === "settings" ? (
        <SettingsScreen
          project={project}
          profile={profile}
          activeProvider={activeProvider}
          providerReadiness={providerReadiness}
          onBack={navigateToChat}
        />
      ) : null}

      <ProjectDrawer
        isOpen={isDrawerOpen}
        currentProjectId={project.id}
        projects={projects}
        profile={profile}
        onClose={() => setIsDrawerOpen(false)}
        onSettingsClick={navigateToSettings}
      />

      <ProjectActionsMenu
        isOpen={isActionsMenuOpen}
        projectId={project.id}
        runSession={latestRunSession}
        filesCount={filesCount}
        onClose={() => setIsActionsMenuOpen(false)}
      />
    </div>
  );
}
