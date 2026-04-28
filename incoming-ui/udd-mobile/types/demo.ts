export interface DemoProject {
  id: string
  title: string
  timestamp: string
  isFavorite: boolean
}

export type Screen = "chat" | "preview" | "settings"

export interface AppState {
  currentScreen: Screen
  isDrawerOpen: boolean
  isActionsMenuOpen: boolean
  selectedProjectId: string | null
  composerValue: string
  isGenerating: boolean
}
