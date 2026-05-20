import { notFound } from "next/navigation"
import { MobileRouteShell } from "@/components/mobile/mobile-route-shell"
import {
  MobileLogsScreen,
  type MobileConsoleEvent,
} from "@/components/mobile/logs-screen"
import { getSession } from "@/lib/auth-session"
import {
  getProjectByIdAndOwner,
  getProjectsForOwner,
  getProfileDisplayName,
  getRunSessionsForProject,
  countProjectFiles,
  getRunEventsForProject,
} from "@/lib/db/queries"
import {
  mapProject,
  mapProjectList,
  mapRunSession,
  mapRunEvent,
} from "@/lib/db/mappers"
import type { Project } from "@/lib/types"
import { toMobileProject, toMobileRunSession } from "@/lib/mobile/mappers"

export default async function MobileLogsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await getSession()
  if (!session) notFound()
  const user = session.user

  const [projectRaw, allProjectsRaw, displayName, latestRun, filesCount] = await Promise.all([
    getProjectByIdAndOwner(id, user.id),
    getProjectsForOwner(user.id, { limit: 30 }),
    getProfileDisplayName(user.id),
    getRunSessionsForProject(id, user.id, { limit: 1 }),
    countProjectFiles(id, user.id),
  ])

  if (!projectRaw) notFound()

  const project = mapProject(projectRaw) as Project
  const allProjects = mapProjectList(allProjectsRaw) as Project[]

  const eventRows = await getRunEventsForProject(id, user.id, { limit: 200 })
  const events = eventRows.map(mapRunEvent).slice().reverse()

  const mobileProject = toMobileProject(project, id)
  const mobileProjects = allProjects.map((item) => toMobileProject(item, id))
  const mobileRunSession = latestRun[0]
    ? toMobileRunSession(mapRunSession(latestRun[0]))
    : null
  const mobileEvents = events.map(toMobileConsoleEvent)

  return (
    <MobileRouteShell
      project={mobileProject}
      projects={mobileProjects}
      profile={{
        email: user.email ?? "",
        displayName: displayName,
      }}
      runSession={mobileRunSession}
      filesCount={filesCount}
      title="Console"
      subtitle={project.name}
      chatHref={`/projects/${id}`}
    >
      <MobileLogsScreen events={mobileEvents} />
    </MobileRouteShell>
  )
}

function toMobileConsoleEvent(event: {
  id: string
  level: string
  source: string
  message: string
  created_at: string
}): MobileConsoleEvent {
  return {
    id: event.id,
    level: event.level,
    source: event.source,
    message: event.message,
    createdLabel: formatRelative(event.created_at),
  }
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return "just now"
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}
