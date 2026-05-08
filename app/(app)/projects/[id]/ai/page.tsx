import { notFound } from "next/navigation"
import { Bot } from "lucide-react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { WorkspaceContainer, SectionHeading } from "@/components/workspace/workspace-container"
import { AIPromptForm } from "@/components/ai/ai-prompt-form"
import { TaskList } from "@/components/ai/task-list"
import { TaskDetail } from "@/components/ai/task-detail"
import { TaskPoller } from "@/components/ai/task-poller"
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
import { formatRelative } from "@/lib/slug"
import { reapStaleTasks } from "@/lib/ai/service"
import type { Project, RunStatus } from "@/lib/types"
import type { AITaskEventRow, AITaskListItem, AITaskRow } from "@/lib/ai/types"
import type { MobileProject, MobileRunSession } from "@/components/mobile/types"

export default async function AiPage({
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

  const anyInFlight = tasks.some((t) => t.status === "pending" || t.status === "running")

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
    <>
      <div className="md:hidden">
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
      </div>

      <WorkspaceContainer className="hidden md:flex">
        <SectionHeading
          title="AI"
          description="Submit a prompt and watch a task flow through pending, running, and completed."
        />

        <AIPromptForm projectId={id} />

        {!hasTasks ? (
          <Empty className="border border-dashed border-border bg-card/40">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bot className="h-5 w-5" />
              </EmptyMedia>
              <EmptyTitle>No AI tasks yet</EmptyTitle>
              <EmptyDescription>
                Your task list will populate here as soon as you submit a prompt. Tasks are
                processed by a real AI model and results are persisted to your project.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            <aside className="flex flex-col gap-2">
              <span className="px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Tasks <span className="opacity-60">({tasks.length})</span>
              </span>
              <TaskList tasks={tasks} projectId={id} selectedId={activeTaskId} />
            </aside>
            <div className="min-w-0">
              {selectedTask ? (
                <TaskDetail
                  task={selectedTask}
                  events={selectedEvents}
                  prompt={selectedPrompt}
                  projectId={id}
                />
              ) : (
                <div className="flex h-full min-h-48 items-center justify-center rounded-lg border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
                  Select a task from the list.
                </div>
              )}
            </div>
          </div>
        )}

        <TaskPoller active={anyInFlight} />
      </WorkspaceContainer>
    </>
  )
}

function toMobileProject(project: Project, currentProjectId: string): MobileProject {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    description: project.description,
    status: project.status,
    updatedLabel: `Updated ${formatRelative(project.updated_at)}`,
    lastOpenedLabel: project.last_opened_at
      ? `Opened ${formatRelative(project.last_opened_at)}`
      : null,
    current: project.id === currentProjectId,
  }
}

function toMobileRunSession(session: {
  id: string;
  status: string;
  preview_url: string | null;
  started_at: string | null;
  stopped_at: string | null;
  created_at: string;
  error: string | null;
}): MobileRunSession {
  return {
    id: session.id,
    status: session.status as RunStatus,
    previewUrl: session.preview_url,
    error: session.error,
    createdLabel: formatRelative(session.created_at),
    startedLabel: session.started_at ? formatRelative(session.started_at) : null,
    stoppedLabel: session.stopped_at ? formatRelative(session.stopped_at) : null,
  }
}
