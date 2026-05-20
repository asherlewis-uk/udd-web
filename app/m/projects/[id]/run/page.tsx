import { notFound } from "next/navigation"
import { MobilePreviewRouteScreen } from "@/components/mobile/preview-route-screen"
import { getSession } from "@/lib/auth-session"
import {
  getProjectByIdAndOwner,
  getProjectsForOwner,
  getProfileDisplayName,
  getRunSessionsForProject,
  countProjectFiles,
  getRunEventsForSession,
} from "@/lib/db/queries"
import {
  mapProject,
  mapProjectList,
  mapRunSession,
  mapRunEvent,
} from "@/lib/db/mappers"
import { reapStaleSessions } from "@/lib/runtime/service"
import type { Project } from "@/lib/types"
import { toMobileProject, toMobileRunSession, toMobileRunEvent } from "@/lib/mobile/mappers"

export default async function MobileRunPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await getSession()
  if (!session) notFound()
  const user = session.user

  const [projectRaw, allProjectsRaw, displayName] = await Promise.all([
    getProjectByIdAndOwner(id, user.id),
    getProjectsForOwner(user.id, { limit: 30 }),
    getProfileDisplayName(user.id),
  ])
  if (!projectRaw) notFound()

  await reapStaleSessions(id, user.id)

  const project = mapProject(projectRaw) as Project
  const allProjects = mapProjectList(allProjectsRaw) as Project[]

  const [sessionRows, filesCount] = await Promise.all([
    getRunSessionsForProject(id, user.id, { limit: 20 }),
    countProjectFiles(id, user.id),
  ])

  const sessions = sessionRows.map(mapRunSession)
  const current = sessions[0] ?? null

  const eventRows = current
    ? await getRunEventsForSession(current.id, user.id, { limit: 300 })
    : []
  const events = eventRows.map(mapRunEvent)

  const mobileSession = current ? toMobileRunSession(current) : null
  const mobileEvents = events.map(toMobileRunEvent)
  const mobileProject = toMobileProject(project, id)
  const mobileProjects = allProjects.map((item) => toMobileProject(item, id))

  return (
    <MobilePreviewRouteScreen
      projectId={id}
      projectName={project.name}
      project={mobileProject}
      projects={mobileProjects}
      profile={{
        email: user.email ?? "",
        displayName: displayName,
      }}
      filesCount={filesCount}
      session={mobileSession}
      events={mobileEvents}
    />
  )
}
