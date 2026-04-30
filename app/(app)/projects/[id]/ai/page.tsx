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
import { createClient } from "@/lib/supabase/server"
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
  const supabase = await createClient()

  // Resolve user up-front so every query can belt-and-braces the RLS check
  // with an explicit owner filter. The (app) layout already redirects
  // unauthenticated users, so notFound() here is purely defensive.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  // Opportunistically mark any long-stalled tasks as failed before loading
  // the list. This keeps the UI honest without requiring a background job.
  await reapStaleTasks(id, user.id)

  const [
    { data: projectData },
    { data: allProjectsData },
    { data: profileData },
    { data: latestRunData },
    { count: filesCount },
    { data: tasksData },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle(),
    supabase
      .from("projects")
      .select("*")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(30),
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("run_sessions")
      .select("id, status, preview_url, started_at, stopped_at, created_at, error")
      .eq("project_id", id)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("project_files")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id)
      .eq("owner_id", user.id),
    supabase
      .from("ai_tasks")
      .select("id, title, kind, status, created_at, finished_at")
      .eq("project_id", id)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ])
  if (!projectData) notFound()

  const tasks: AITaskListItem[] = (tasksData ?? []) as AITaskListItem[]
  const hasTasks = tasks.length > 0
  const activeTaskId =
    (requestedTaskId && tasks.find((t) => t.id === requestedTaskId)?.id) ?? tasks[0]?.id ?? null

  const anyInFlight = tasks.some((t) => t.status === "pending" || t.status === "running")

  let selectedTask: AITaskRow | null = null
  let selectedEvents: Pick<AITaskEventRow, "id" | "kind" | "payload" | "created_at">[] = []
  let selectedPrompt: string | null = null

  if (activeTaskId) {
    const { data: taskData } = await supabase
      .from("ai_tasks")
      .select(
        "id, project_id, prompt_id, kind, title, status, input, output, error, run_session_id, created_at, started_at, finished_at",
      )
      .eq("id", activeTaskId)
      .eq("owner_id", user.id)
      .single()
    selectedTask = (taskData as unknown as AITaskRow | null) ?? null

    if (selectedTask) {
      const [{ data: eventsData }, promptRes] = await Promise.all([
        supabase
          .from("ai_task_events")
          .select("id, kind, payload, created_at")
          .eq("task_id", activeTaskId)
          .eq("owner_id", user.id)
          .order("created_at", { ascending: true }),
        selectedTask.prompt_id
          ? supabase
              .from("prompts")
              .select("body")
              .eq("id", selectedTask.prompt_id)
              .eq("owner_id", user.id)
              .single()
          : Promise.resolve({ data: null as { body: string } | null }),
      ])
      selectedEvents = (eventsData ?? []) as typeof selectedEvents
      const inputPrompt =
        typeof (selectedTask.input as { prompt?: unknown })?.prompt === "string"
          ? ((selectedTask.input as { prompt: string }).prompt as string)
          : null
      selectedPrompt = promptRes?.data?.body ?? inputPrompt ?? null
    }
  }

  const project = projectData as Project
  const mobileProject = toMobileProject(project, id)
  const mobileProjects = ((allProjectsData ?? []) as Project[]).map((item) =>
    toMobileProject(item, id),
  )
  const mobileRunSession = latestRunData
    ? toMobileRunSession(latestRunData as LatestRunSession)
    : null

  return (
    <>
      <div className="md:hidden">
        <MobileRouteShell
          project={mobileProject}
          projects={mobileProjects}
          profile={{
            email: user.email ?? "",
            displayName: profileData?.display_name ?? null,
          }}
          runSession={mobileRunSession}
          filesCount={filesCount ?? 0}
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

type LatestRunSession = {
  id: string
  status: RunStatus
  preview_url: string | null
  started_at: string | null
  stopped_at: string | null
  created_at: string
  error: string | null
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

function toMobileRunSession(session: LatestRunSession): MobileRunSession {
  return {
    id: session.id,
    status: session.status,
    previewUrl: session.preview_url,
    error: session.error,
    createdLabel: formatRelative(session.created_at),
    startedLabel: session.started_at ? formatRelative(session.started_at) : null,
    stoppedLabel: session.stopped_at ? formatRelative(session.stopped_at) : null,
  }
}
