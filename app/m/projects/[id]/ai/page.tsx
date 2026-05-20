import { notFound } from "next/navigation"
import { MobileRouteShell } from "@/components/mobile/mobile-route-shell"
import { MobileAIScreen } from "@/components/mobile/ai-screen"
import { getSession } from "@/lib/auth-session"
import {
  getProjectByIdAndOwner,
  getProjectsForOwner,
  getProfileDisplayName,
  getRunSessionsForProject,
  countProjectFiles,
  getAITaskListItemsForProject,
  getAITaskById,
  getAITaskEvents,
  getPromptById,
} from "@/lib/db/queries"
import {
  mapProject,
  mapProjectList,
  mapAITask,
  mapAITaskListItem,
  mapAITaskEvent,
  mapRunSession,
} from "@/lib/db/mappers"
import { reapStaleTasks } from "@/lib/ai/service"
import type { Project } from "@/lib/types"
import type { AITaskEventRow, AITaskListItem, AITaskRow } from "@/lib/ai/types"
import { toMobileProject, toMobileRunSession } from "@/lib/mobile/mappers"

export default async function MobileAiPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ task?: string }>
}) {
  const { id } = await params
  const { task: requestedTaskId } = await searchParams

  const session = await getSession()
  if (!session) notFound()
  const user = session.user

  await reapStaleTasks(id, user.id)

  const [
    projectRaw,
    allProjectsRaw,
    displayName,
    latestRun,
    filesCount,
    tasksRaw,
  ] = await Promise.all([
    getProjectByIdAndOwner(id, user.id),
    getProjectsForOwner(user.id, { limit: 30 }),
    getProfileDisplayName(user.id),
    getRunSessionsForProject(id, user.id, { limit: 1 }),
    countProjectFiles(id, user.id),
    getAITaskListItemsForProject(id, user.id, 50),
  ])
  if (!projectRaw) notFound()

  const project = mapProject(projectRaw) as Project
  const allProjects = mapProjectList(allProjectsRaw) as Project[]
  const tasks = tasksRaw.map(mapAITaskListItem) as AITaskListItem[]

  const hasTasks = tasks.length > 0
  const activeTaskId =
    (requestedTaskId && tasks.find((t) => t.id === requestedTaskId)?.id) ?? tasks[0]?.id ?? null

  let selectedTask: AITaskRow | null = null
  let selectedEvents: Pick<AITaskEventRow, "id" | "kind" | "payload" | "created_at">[] = []
  let selectedPrompt: string | null = null

  if (activeTaskId) {
    const taskRaw = await getAITaskById(activeTaskId, user.id)
    selectedTask = taskRaw ? (mapAITask(taskRaw) as AITaskRow) : null

    if (selectedTask) {
      const [eventsRaw, promptRow] = await Promise.all([
        getAITaskEvents(activeTaskId, user.id),
        selectedTask.prompt_id
          ? getPromptById(selectedTask.prompt_id, user.id)
          : Promise.resolve(null),
      ])
      selectedEvents = eventsRaw.map(mapAITaskEvent) as typeof selectedEvents
      const inputPrompt =
        typeof (selectedTask.input as { prompt?: unknown })?.prompt === "string"
          ? ((selectedTask.input as { prompt: string }).prompt as string)
          : null
      selectedPrompt = promptRow?.body ?? inputPrompt ?? null
    }
  }

  const mobileProject = toMobileProject(project, id)
  const mobileProjects = allProjects.map((item) => toMobileProject(item, id))
  const mobileRunSession = latestRun[0]
    ? toMobileRunSession(mapRunSession(latestRun[0]))
    : null

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
      title="Generation history"
      subtitle={project.name}
      chatHref={`/projects/${id}`}
    >
      <MobileAIScreen
        projectId={id}
        tasks={tasks}
        activeTaskId={activeTaskId}
        selectedTask={selectedTask}
        selectedEvents={selectedEvents}
        selectedPrompt={selectedPrompt}
      />
    </MobileRouteShell>
  )
}
