"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getSession } from "@/lib/auth-session"
import { createClient } from "@/lib/db/supabase-legacy"
import { slugify } from "@/lib/slug"
import type { ProjectStatus } from "@/lib/types"

async function getUser() {
  const supabase = await createClient()
  const session = await getSession()
  if (!session) throw new Error("Not authenticated")
  const user = session.user
  return { supabase, user }
}

async function uniqueSlug(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerId: string,
  base: string,
) {
  const candidate = slugify(base)
  const { data } = await supabase
    .from("projects")
    .select("slug")
    .eq("owner_id", ownerId)
    .like("slug", `${candidate}%`)
  const existing = new Set((data ?? []).map((r) => r.slug))
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

  const { supabase, user } = await getUser()
  const slug = await uniqueSlug(supabase, user.id, name)

  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      name,
      slug,
      description,
      idea,
      status: "draft" as ProjectStatus,
    })
    .select("id")
    .single()

  if (error) throw new Error(error.message)
  revalidatePath("/projects")
  redirect(`/projects/${data.id}`)
}

export async function updateProjectStatus(id: string, status: ProjectStatus) {
  const { supabase, user } = await getUser()
  const { error } = await supabase
    .from("projects")
    .update({ status })
    .eq("id", id)
    .eq("owner_id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath("/projects")
  revalidatePath(`/projects/${id}`)
  revalidatePath(`/projects/${id}/settings`)
}

export async function deleteProject(id: string) {
  const { supabase, user } = await getUser()
  const { error } = await supabase.from("projects").delete().eq("id", id).eq("owner_id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath("/projects")
  redirect("/projects")
}

export async function touchProjectOpened(id: string) {
  const { supabase, user } = await getUser()
  await supabase
    .from("projects")
    .update({ last_opened_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id)
}

export async function updateProjectDetails(
  id: string,
  fields: { name?: string; description?: string | null; idea?: string | null },
) {
  const { supabase, user } = await getUser()
  const update: Record<string, unknown> = {}
  if (typeof fields.name === "string") update.name = fields.name.trim()
  if (fields.description !== undefined) update.description = fields.description
  if (fields.idea !== undefined) update.idea = fields.idea
  if (Object.keys(update).length === 0) return
  const { error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", id)
    .eq("owner_id", user.id)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${id}`)
  revalidatePath("/projects")
}
