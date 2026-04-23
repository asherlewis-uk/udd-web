import Link from "next/link"
import { Plus, FolderPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ProjectCard } from "@/components/projects/project-card"
import type { ProjectActivity } from "@/components/projects/activity-summary"
import { ProjectFilters } from "@/components/projects/project-filters"
import { createClient } from "@/lib/supabase/server"
import type { AITaskStatus, Project, RunStatus } from "@/lib/types"

export const metadata = {
  title: "Projects — UDD",
}

type SP = Promise<{ q?: string; status?: string }>

export default async function ProjectsPage({ searchParams }: { searchParams: SP }) {
  const { q = "", status = "all" } = await searchParams
  const supabase = await createClient()

  let query = supabase.from("projects").select("*").order("updated_at", { ascending: false })

  if (status && status !== "all") {
    query = query.eq("status", status)
  }
  if (q.trim()) {
    const term = `%${q.trim()}%`
    query = query.or(`name.ilike.${term},slug.ilike.${term},description.ilike.${term}`)
  }

  const { data, error } = await query
  const projects = (data ?? []) as Project[]

  // Batch-fetch latest AI task and latest run session for activity surfacing.
  const activityMap = new Map<string, ProjectActivity>()
  if (projects.length > 0) {
    const projectIds = projects.map((p) => p.id)
    const [tasksRes, runsRes] = await Promise.all([
      supabase
        .from("ai_tasks")
        .select("project_id, title, status, created_at")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("run_sessions")
        .select("project_id, status, created_at")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false }),
    ])

    const latestTasks = new Map<
      string,
      { title: string; status: AITaskStatus; created_at: string }
    >()
    for (const row of (tasksRes.data ?? []) as Array<{
      project_id: string
      title: string
      status: AITaskStatus
      created_at: string
    }>) {
      if (!latestTasks.has(row.project_id)) {
        latestTasks.set(row.project_id, {
          title: row.title,
          status: row.status,
          created_at: row.created_at,
        })
      }
    }

    const latestRuns = new Map<string, { status: RunStatus; created_at: string }>()
    for (const row of (runsRes.data ?? []) as Array<{
      project_id: string
      status: RunStatus
      created_at: string
    }>) {
      if (!latestRuns.has(row.project_id)) {
        latestRuns.set(row.project_id, { status: row.status, created_at: row.created_at })
      }
    }

    for (const p of projects) {
      activityMap.set(p.id, {
        latestTask: latestTasks.get(p.id) ?? null,
        latestRun: latestRuns.get(p.id) ?? null,
      })
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-5 py-8">
      <section className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Every idea lives here as a real project. Search, filter, and open one to get to work.
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="mr-1.5 h-4 w-4" />
            New project
          </Link>
        </Button>
      </section>

      <ProjectFilters initialQuery={q} initialStatus={status} />

      {error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error.message}
        </div>
      ) : projects.length === 0 ? (
        <Empty className="mt-6 border border-dashed border-border bg-card/40">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderPlus className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>
              {q || status !== "all" ? "No projects match your filters" : "No projects yet"}
            </EmptyTitle>
            <EmptyDescription>
              {q || status !== "all"
                ? "Try clearing the search or switching to a different status."
                : "Start by drafting an idea. You can always refine it later."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/projects/new">
                <Plus className="mr-1.5 h-4 w-4" />
                Create your first project
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} activity={activityMap.get(p.id)} />
          ))}
        </div>
      )}
    </main>
  )
}
