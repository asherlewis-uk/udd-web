import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { StatusPill } from "@/components/status-pill"
import { ProjectTabs } from "@/components/workspace/project-tabs"
import { formatRelative } from "@/lib/slug"
import type { Project } from "@/lib/types"

export function ProjectHeader({ project }: { project: Project }) {
  return (
    <div className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-5 pt-5">
        <Link
          href="/projects"
          className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All projects
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-xl font-semibold tracking-tight">{project.name}</h1>
              <StatusPill status={project.status} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{project.slug}</span>
              <span aria-hidden>&middot;</span>
              <span>Updated {formatRelative(project.updated_at)}</span>
            </div>
            {project.description ? (
              <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
                {project.description}
              </p>
            ) : null}
          </div>
        </div>
        <ProjectTabs projectId={project.id} />
      </div>
    </div>
  )
}
