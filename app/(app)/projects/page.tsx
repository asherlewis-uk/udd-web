import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ProjectCard } from "@/components/projects/project-card";
import type { ProjectActivity } from "@/components/projects/activity-summary";
import { ProjectFilters } from "@/components/projects/project-filters";
import { MobileProjectsListScreen } from "@/components/mobile/projects-list-screen";
import { getSession } from "@/lib/auth-session";
import {
  getProfileDisplayName,
  getProjectsForOwner,
  getLatestAITaskActivityForProjects,
  getLatestRunSessionActivityForProjects,
} from "@/lib/db/queries";
import { mapProjectList } from "@/lib/db/mappers";
import { formatRelative } from "@/lib/slug";
import type { AITaskStatus, Project, RunStatus } from "@/lib/types";
import type { MobileProject } from "@/components/mobile/types";

export const metadata = {
  title: "Projects — u did dat",
};

type SP = Promise<{ q?: string; status?: string }>;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const { q = "", status = "all" } = await searchParams;

  const session = await getSession();
  if (!session) redirect("/auth/login");
  const user = session.user;

  const [projectsRaw, allProjectsRaw, displayName] = await Promise.all([
    getProjectsForOwner(user.id, { status, search: q }),
    getProjectsForOwner(user.id),
    getProfileDisplayName(user.id),
  ]);
  const projects = mapProjectList(projectsRaw) as Project[];
  const allProjects = mapProjectList(allProjectsRaw) as Project[];
  const mobileProjects = allProjects.map(toMobileProject);

  // Batch-fetch latest AI task and latest run session for activity surfacing.
  const activityMap = new Map<string, ProjectActivity>();
  if (allProjects.length > 0) {
    const projectIds = allProjects.map((p) => p.id);
    const [taskRows, runRows] = await Promise.all([
      getLatestAITaskActivityForProjects(projectIds, user.id),
      getLatestRunSessionActivityForProjects(projectIds, user.id),
    ]);

    const latestTasks = new Map<
      string,
      { title: string; status: AITaskStatus; created_at: string }
    >();
    for (const row of taskRows) {
      if (!latestTasks.has(row.projectId)) {
        latestTasks.set(row.projectId, {
          title: row.title,
          status: row.status as AITaskStatus,
          created_at: row.createdAt.toISOString(),
        });
      }
    }

    const latestRuns = new Map<
      string,
      { status: RunStatus; created_at: string }
    >();
    for (const row of runRows) {
      if (!latestRuns.has(row.projectId)) {
        latestRuns.set(row.projectId, {
          status: row.status as RunStatus,
          created_at: row.createdAt.toISOString(),
        });
      }
    }

    for (const p of allProjects) {
      activityMap.set(p.id, {
        latestTask: latestTasks.get(p.id) ?? null,
        latestRun: latestRuns.get(p.id) ?? null,
      });
    }
  }

  return (
    <>
      <div className="md:hidden">
        <MobileProjectsListScreen
          projects={mobileProjects}
          profile={{
            email: user?.email ?? "",
            displayName: displayName,
          }}
        />
      </div>

      <main className="mx-auto hidden w-full max-w-6xl flex-1 flex-col gap-8 px-5 py-8 md:flex">
        <section className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            <p className="text-sm text-muted-foreground">
              Every idea lives here as a real project. Search, filter, and open
              one to get to work.
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

        {projects.length === 0 ? (
          <Empty className="mt-6 border border-dashed border-border bg-card/40">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderPlus className="h-5 w-5" />
              </EmptyMedia>
              <EmptyTitle>
                {q || status !== "all"
                  ? "No projects match your filters"
                  : "No projects yet"}
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
              <ProjectCard
                key={p.id}
                project={p}
                activity={activityMap.get(p.id)}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function toMobileProject(project: Project): MobileProject {
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
    current: false,
  };
}
