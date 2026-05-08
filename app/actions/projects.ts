"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-session"
import {
  getProjectSlugsLike,
  insertProject,
  updateProject,
  deleteProject as deleteProjectDb,
} from "@/lib/db/queries"
import { slugify } from "@/lib/slug"
import type { ProjectStatus } from "@/lib/types"

async function getUser() {
  const session = await getSession()
  if (!session) throw new Error("Not authenticated")
  const user = session.user
  return { user }
}

async function uniqueSlug(ownerId: string, base: string) {
  const candidate = slugify(base)
  const rows = await getProjectSlugsLike(ownerId, candidate)
  const existing = new Set(rows.map((r) => r.slug))
  if (!existing.has(candidate)) return candidate
  let i = 2
  while (existing.has(`${candidate}-${i}`)) i++
  return `${candidate}-${i}`
}

export async function createProject(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim() || null
  const idea = String(formData.get("idea") ?? "").trim() || null
  if (!name) throw new Error("Name is required")

  const { user } = await getUser()
  const slug = await uniqueSlug(user.id, name)

  const row = await insertProject({
    ownerId: user.id,
    name,
    slug,
    description,
    idea,
    status: "draft" as ProjectStatus,
  })

  revalidatePath("/projects")
  redirect(`/projects/${row.id}`)
}

export async function updateProjectStatus(id: string, status: ProjectStatus) {
  const { user } = await getUser()
  await updateProject(id, user.id, { status })
  revalidatePath("/projects")
  revalidatePath(`/projects/${id}`)
  revalidatePath(`/projects/${id}/settings`)
}

export async function deleteProject(id: string) {
  const { user } = await getUser()
  await deleteProjectDb(id, user.id)
  revalidatePath("/projects")
  redirect("/projects")
}

export async function touchProjectOpened(id: string) {
  const { user } = await getUser()
  await updateProject(id, user.id, { lastOpenedAt: new Date() })
}

export async function updateProjectDetails(
  id: string,
  fields: { name?: string; description?: string | null; idea?: string | null },
) {
  const { user } = await getUser()
  const update: Partial<{ name: string; description: string | null; idea: string | null }> = {}
  if (typeof fields.name === "string") update.name = fields.name.trim()
  if (fields.description !== undefined) update.description = fields.description
  if (fields.idea !== undefined) update.idea = fields.idea
  if (Object.keys(update).length === 0) return
  await updateProject(id, user.id, update)
  revalidatePath(`/projects/${id}`)
  revalidatePath("/projects")
}
