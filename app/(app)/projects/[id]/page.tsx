import Link from "next/link"
import { notFound } from "next/navigation"
import { Bot, FolderTree, Play, Terminal, ArrowUpRight } from "lucide-react"
import { WorkspaceContainer, SectionHeading } from "@/components/workspace/workspace-container"
import { createClient } from "@/lib/supabase/server"
import { formatRelative } from "@/lib/slug"
import type { Project } from "@/lib/types"

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: project }, { count: filesCount }, { count: tasksCount }, { count: runsCount }] =
    await Promise.all([
      supabase.from("projects").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("project_files")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id),
      supabase.from("ai_tasks").select("id", { count: "exact", head: true }).eq("project_id", id),
      supabase
        .from("run_sessions")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id),
    ])

  if (!project) notFound()
  const p = project as Project

  const stats = [
    { label: "Files", value: filesCount ?? 0, href: `/projects/${id}/files`, icon: FolderTree },
    { label: "AI tasks", value: tasksCount ?? 0, href: `/projects/${id}/ai`, icon: Bot },
    { label: "Runs", value: runsCount ?? 0, href: `/projects/${id}/run`, icon: Play },
    { label: "Logs", value: "—", href: `/projects/${id}/logs`, icon: Terminal },
  ] as const

  return (
    <WorkspaceContainer>
      <SectionHeading
        title="Overview"
        description="A snapshot of this project. Use the tabs above to dig in."
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <Link
              key={s.label}
              href={s.href}
              className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition hover:border-border/80 hover:bg-card/80"
            >
              <div className="flex items-center justify-between">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:text-foreground" />
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            </Link>
          )
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="md:col-span-2 rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold tracking-tight">The idea</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {p.idea || "No idea recorded yet. Open Settings to describe what you want to build."}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold tracking-tight">Details</h3>
          <dl className="mt-3 flex flex-col gap-2.5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Slug</dt>
              <dd className="truncate font-mono text-xs">{p.slug}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatRelative(p.created_at)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Updated</dt>
              <dd>{formatRelative(p.updated_at)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Last opened</dt>
              <dd>{formatRelative(p.last_opened_at)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </WorkspaceContainer>
  )
}
