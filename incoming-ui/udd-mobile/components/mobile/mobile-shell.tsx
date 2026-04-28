"use client"

import { useState, useCallback } from "react"
import type { Screen } from "@/types/demo"
import { demoProjects, getFavoriteProjects, getRecentProjects } from "@/data/demo-projects"
import { ChatBuildScreen } from "./chat-build-screen"
import { PreviewScreen } from "./preview-screen"
import { SettingsScreen } from "./settings-screen"
import { ProjectDrawer } from "./project-drawer"
import { ProjectActionsMenu } from "./project-actions-menu"

export function MobileShell() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("chat")
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string>("proj-001")
  const [composerValue, setComposerValue] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)

  const selectedProject = demoProjects.find((p) => p.id === selectedProjectId) ?? demoProjects[0]

  const handleComposerSubmit = useCallback(() => {
    if (!composerValue.trim()) return
    
    setIsGenerating(true)
    setComposerValue("")
    
    // Demo generation state - clears after 2 seconds
    const timeoutId = setTimeout(() => {
      setIsGenerating(false)
    }, 2000)

    return () => clearTimeout(timeoutId)
  }, [composerValue])

  const handleSelectProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId)
    setIsDrawerOpen(false)
    setCurrentScreen("chat")
  }, [])

  const navigateToChat = useCallback(() => {
    setCurrentScreen("chat")
    setIsActionsMenuOpen(false)
  }, [])

  const navigateToPreview = useCallback(() => {
    setCurrentScreen("preview")
  }, [])

  const navigateToSettings = useCallback(() => {
    setCurrentScreen("settings")
    setIsDrawerOpen(false)
  }, [])

  return (
    <div className="h-dvh w-full overflow-hidden bg-background">
      {/* Main screen content */}
      {currentScreen === "chat" && (
        <ChatBuildScreen
          composerValue={composerValue}
          onComposerChange={setComposerValue}
          onComposerSubmit={handleComposerSubmit}
          isGenerating={isGenerating}
          projectTitle={selectedProject.title}
          onMenuClick={() => setIsDrawerOpen(true)}
          onPreviewClick={navigateToPreview}
          onProjectPillClick={() => setIsDrawerOpen(true)}
        />
      )}

      {currentScreen === "preview" && (
        <PreviewScreen
          onBackToChat={navigateToChat}
          onActionsClick={() => setIsActionsMenuOpen(true)}
        />
      )}

      {currentScreen === "settings" && (
        <SettingsScreen onBack={navigateToChat} />
      )}

      {/* Overlays */}
      <ProjectDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        favoriteProjects={getFavoriteProjects()}
        recentProjects={getRecentProjects()}
        onSelectProject={handleSelectProject}
        onSettingsClick={navigateToSettings}
      />

      <ProjectActionsMenu
        isOpen={isActionsMenuOpen}
        onClose={() => setIsActionsMenuOpen(false)}
      />
    </div>
  )
}
