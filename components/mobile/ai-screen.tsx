import { Bot } from "lucide-react";
import { AIPromptForm } from "@/components/ai/ai-prompt-form";
import { TaskDetail } from "@/components/ai/task-detail";
import { TaskList } from "@/components/ai/task-list";
import type { AITaskEventRow, AITaskListItem, AITaskRow } from "@/lib/ai/types";

type MobileAIEvent = Pick<
  AITaskEventRow,
  "id" | "kind" | "payload" | "created_at"
>;

export function MobileAIScreen({
  projectId,
  tasks,
  activeTaskId,
  selectedTask,
  selectedEvents,
  selectedPrompt,
}: {
  projectId: string;
  tasks: AITaskListItem[];
  activeTaskId: string | null;
  selectedTask: AITaskRow | null;
  selectedEvents: MobileAIEvent[];
  selectedPrompt: string | null;
}) {
  if (tasks.length === 0) {
    return (
      <div className="flex min-h-full flex-col gap-4 pb-6">
        <AIPromptForm projectId={projectId} />
        <div className="flex flex-1 items-center justify-center py-12 text-center">
          <div className="flex max-w-xs flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/80 text-muted-foreground">
              <Bot className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">
                No AI tasks yet
              </h2>
              <p className="text-sm text-muted-foreground">
                Submit a prompt to start a generation run for this project.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-4 pb-6">
      <AIPromptForm projectId={projectId} />
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span className="uppercase tracking-wide">Tasks</span>
          <span>
            {tasks.length} task{tasks.length === 1 ? "" : "s"}
          </span>
        </div>
        <TaskList
          tasks={tasks}
          projectId={projectId}
          selectedId={activeTaskId}
        />
      </section>
      {selectedTask ? (
        <TaskDetail
          task={selectedTask}
          events={selectedEvents}
          prompt={selectedPrompt}
          projectId={projectId}
        />
      ) : (
        <div className="flex min-h-32 items-center justify-center rounded-3xl border border-dashed border-border bg-card/40 p-6 text-sm text-muted-foreground">
          Select a task from the list.
        </div>
      )}
    </div>
  );
}
