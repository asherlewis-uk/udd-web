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
      <header className="flex items-center justify-between border-b border-glass-border/20 px-4 pt-safe pb-2">
        <span className="bg-gradient-to-r from-glass-purple via-glass-coral to-glass-coral-glow bg-clip-text text-transparent text-sm font-semibold tracking-tight">u did dat</span>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="border border-glass-border/30 hover:border-glass-purple/50 hover:text-glass-purple transition-colors">
            <Link href="/auth/login">Sign in</Link>
          </Button>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-8">
        <div className="mx-auto flex w-full max-w-md flex-col items-center text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full liquid-glass prismatic-border prismatic-inner px-3 py-1 text-xs text-glass-purple-muted/80">
            <span className="h-1.5 w-1.5 rounded-full bg-glass-coral animate-pulse" aria-hidden />
            Early access &middot; beta
          </div>
          <h1 className="bg-gradient-to-b from-white to-white/80 bg-clip-text text-transparent text-balance text-3xl font-semibold leading-[1.1] tracking-tight">
            The desktop for turning ideas into code.
          </h1>
          <p className="text-pretty mt-3 max-w-sm text-sm leading-relaxed text-glass-purple-muted/80">
            u did dat is a personal, web-based dev workspace. Draft an idea, scaffold
            a project, let AI help you edit files, then validate and preview the
            result locally.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <Button asChild size="sm" className="bg-linear-to-r from-glass-purple to-glass-coral hover:from-glass-purple/90 hover:to-glass-coral/90 text-white shadow-lg shadow-glass-purple/20">
              <Link href="/auth/sign-up">
                Create your workspace
                <ArrowUpRight className="ml-1 h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost" className="border border-glass-border/30 hover:border-glass-purple/50 hover:text-glass-purple transition-colors">
              <Link href="/auth/login">I already have an account</Link>
            </Button>
          </div>
        </div>

        <section className="mx-auto mt-8 grid w-full max-w-md grid-cols-2 gap-px overflow-hidden rounded-xl bg-glass-border/30 shadow-lg shadow-glass-purple/5">
          <div className="flex flex-col gap-1.5 liquid-glass prismatic-border prismatic-inner p-4">
            <FolderGit2 className="h-4 w-4 text-glass-coral" aria-hidden />
            <div className="text-sm font-medium text-white/90">Projects</div>
            <div className="text-xs leading-relaxed text-glass-purple-muted/70">
              Organize every idea as a real repo.
            </div>
          </div>
          <div className="flex flex-col gap-1.5 liquid-glass prismatic-border prismatic-inner p-4">
            <Bot className="h-4 w-4 text-glass-purple" aria-hidden />
            <div className="text-sm font-medium text-white/90">AI tasks</div>
            <div className="text-xs leading-relaxed text-glass-purple-muted/70">
              Scaffold, edit, refactor with guardrails.
            </div>
          </div>
          <div className="flex flex-col gap-1.5 liquid-glass prismatic-border prismatic-inner p-4">
            <Play className="h-4 w-4 text-glass-coral" aria-hidden />
            <div className="text-sm font-medium text-white/90">Runtime</div>
            <div className="text-xs leading-relaxed text-glass-purple-muted/70">
              Validate saved files and preview locally.
            </div>
          </div>
          <div className="flex flex-col gap-1.5 liquid-glass prismatic-border prismatic-inner p-4">
            <Terminal className="h-4 w-4 text-glass-purple" aria-hidden />
            <div className="text-sm font-medium text-white/90">Logs</div>
            <div className="text-xs leading-relaxed text-glass-purple-muted/70">
              Readable build and runtime output.
            </div>
          </div>
        </section>
      </main>

      <footer className="flex items-center justify-between border-t border-glass-border/20 px-4 pb-safe pt-2 text-xs text-glass-purple-muted/60">
        <span>u did dat</span>
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
