import type { DemoProject } from "@/types/demo"

export const demoProjects: DemoProject[] = [
  {
    id: "proj-001",
    title: "UDD AI app builder",
    timestamp: "2 hours ago",
    isFavorite: true,
  },
  {
    id: "proj-002",
    title: "UDD Web/Desktop Build",
    timestamp: "Yesterday",
    isFavorite: true,
  },
  {
    id: "proj-003",
    title: "Nano Banana playground",
    timestamp: "2 days ago",
    isFavorite: false,
  },
  {
    id: "proj-004",
    title: "Login PIN UX",
    timestamp: "3 days ago",
    isFavorite: false,
  },
  {
    id: "proj-005",
    title: "AI-native IDE",
    timestamp: "1 week ago",
    isFavorite: true,
  },
  {
    id: "proj-006",
    title: "StoryBoard AI build",
    timestamp: "2 weeks ago",
    isFavorite: false,
  },
]

export const getFavoriteProjects = (): DemoProject[] => {
  return demoProjects.filter((p) => p.isFavorite)
}

export const getRecentProjects = (): DemoProject[] => {
  return demoProjects.filter((p) => !p.isFavorite)
}
