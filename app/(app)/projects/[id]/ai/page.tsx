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
import { createClient } from "@/lib/supabase/server"
import type { AITaskEventRow, AITaskListItem, AITaskRow } from "@/lib/ai/types"

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

  const { data: tasksData } = await supabase
    .from("ai_tasks")
    .select("id, title, kind, status, created_at, finished_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(50)

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
      .single()
    selectedTask = (taskData as unknown as AITaskRow | null) ?? null

    if (selectedTask) {
      const [{ data: eventsData }, promptRes] = await Promise.all([
        supabase
          .from("ai_task_events")
          .select("id, kind, payload, created_at")
          .eq("task_id", activeTaskId)
          .order("created_at", { ascending: true }),
        selectedTask.prompt_id
          ? supabase
              .from("prompts")
              .select("body")
              .eq("id", selectedTask.prompt_id)
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

  return (
    <WorkspaceContainer>
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
              Your task list will populate here as soon as you submit a prompt. Results are
              currently produced by a deterministic local simulator.
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
  )
}
