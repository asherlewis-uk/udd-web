import { notFound } from "next/navigation"
import { ProjectHeader } from "@/components/workspace/project-header"
import { createClient } from "@/lib/supabase/server"
import { touchProjectOpened } from "@/app/actions/projects"
import type { Project } from "@/lib/types"

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (error || !data) notFound()

  // Fire-and-forget — do not block rendering.
  touchProjectOpened(id).catch(() => {})

  const project = data as Project

  return (
    <div className="flex flex-1 flex-col">
      <ProjectHeader project={project} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  )
}
