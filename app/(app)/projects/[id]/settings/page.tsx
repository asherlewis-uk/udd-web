import { notFound } from "next/navigation"
import { WorkspaceContainer, SectionHeading } from "@/components/workspace/workspace-container"
import { ProjectSettingsForm } from "@/components/workspace/project-settings-form"
import { ProjectDangerZone } from "@/components/workspace/project-danger-zone"
import { createClient } from "@/lib/supabase/server"
import type { Project } from "@/lib/types"

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from("projects").select("*").eq("id", id).maybeSingle()
  if (!data) notFound()
  const project = data as Project

  return (
    <WorkspaceContainer>
      <SectionHeading
        title="Project settings"
        description="Edit the core metadata and idea for this project."
      />
      <div className="rounded-lg border border-border bg-card p-6">
        <ProjectSettingsForm project={project} />
      </div>
      <ProjectDangerZone project={project} />
    </WorkspaceContainer>
  )
}
