"use client";

import { useCallback, useState } from "react";
import { ChatBuildScreen } from "./chat-build-screen";
import { PreviewScreen } from "./preview-screen";
import { ProjectActionsMenu } from "./project-actions-menu";
import { ProjectDrawer } from "./project-drawer";
import { SettingsScreen } from "./settings-screen";
import type { MobileScreen, MobileShellProps } from "./types";

export function MobileShell({
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
}: MobileShellProps) {
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
