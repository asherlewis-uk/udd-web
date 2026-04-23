export type ProjectStatus = "draft" | "active" | "archived" | "error"

export type Project = {
  id: string
  owner_id: string
  name: string
  slug: string
  description: string | null
  idea: string | null
  status: ProjectStatus
  last_opened_at: string | null
  created_at: string
  updated_at: string
}

export type Profile = {
  id: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export type ProjectFile = {
  id: string
  project_id: string
  owner_id: string
  path: string
  content: string
  language: string | null
  size_bytes: number
  created_at: string
  updated_at: string
}

export type RunStatus = "idle" | "starting" | "running" | "stopping" | "stopped" | "error"
export type AiTaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled"
