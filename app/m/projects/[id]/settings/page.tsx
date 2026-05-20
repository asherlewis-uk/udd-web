import { notFound } from "next/navigation"
import { MobileRouteShell } from "@/components/mobile/mobile-route-shell"
import { MobileProjectSettingsScreen } from "@/components/mobile/project-settings-screen"
import { getSession } from "@/lib/auth-session"
import {
  getProjectByIdAndOwner,
  getProjectsForOwner,
  getProfileDisplayName,
  getRunSessionsForProject,
  countProjectFiles,
} from "@/lib/db/queries"
import { mapProject, mapProjectList, mapRunSession } from "@/lib/db/mappers"
import type { Project } from "@/lib/types"
import { toMobileProject, toMobileRunSession } from "@/lib/mobile/mappers"

export default async function MobileProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getSession()
  if (!session) notFound()
  const user = session.user

  const [
    projectRaw,
    allProjectsRaw,
    displayName,
    latestRun,
    filesCount,
  ] = await Promise.all([
    getProjectByIdAndOwner(id, user.id),
    getProjectsForOwner(user.id, { limit: 30 }),
    getProfileDisplayName(user.id),
    getRunSessionsForProject(id, user.id, { limit: 1 }),
    countProjectFiles(id, user.id),
  ])
  if (!projectRaw) notFound()

  const project = mapProject(projectRaw) as Project
  const allProjects = mapProjectList(allProjectsRaw) as Project[]
  const mobileRunSession = latestRun[0]
    ? toMobileRunSession(mapRunSession(latestRun[0]))
    : null

  return (
    <MobileRouteShell
      project={toMobileProject(project, id)}
      projects={allProjects.map((item) => toMobileProject(item, id))}
      profile={{
        email: user.email ?? "",
        displayName: displayName,
      }}
      runSession={mobileRunSession}
      filesCount={filesCount}
      title="Project settings"
      subtitle={project.name}
      chatHref={`/projects/${id}`}
    >
      <MobileProjectSettingsScreen project={project} />
    </MobileRouteShell>
  )
}
