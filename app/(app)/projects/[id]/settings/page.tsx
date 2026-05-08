import { notFound } from "next/navigation";
import {
  WorkspaceContainer,
  SectionHeading,
} from "@/components/workspace/workspace-container";
import { ProjectSettingsForm } from "@/components/workspace/project-settings-form";
import { ProjectDangerZone } from "@/components/workspace/project-danger-zone";
import { MobileRouteShell } from "@/components/mobile/mobile-route-shell";
import { MobileProjectSettingsScreen } from "@/components/mobile/project-settings-screen";
import { getSession } from "@/lib/auth-session";
import {
  getProjectByIdAndOwner,
  getProjectsForOwner,
  getProfileDisplayName,
  getRunSessionsForProject,
  countProjectFiles,
} from "@/lib/db/queries";
import { mapProject, mapProjectList, mapRunSession } from "@/lib/db/mappers";
import { formatRelative } from "@/lib/slug";
import type { Project, RunStatus } from "@/lib/types";
import type {
  MobileProject,
  MobileRunSession,
} from "@/components/mobile/types";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) notFound();
  const user = session.user;

  const [
    projectRaw,
    allProjectsRaw,
    displayName,
    latestRun,
    filesCount,
  ] = await Promise.all([
    getProjectByIdAndOwner(id, user.id),
    getProjectsForOwner(user.id, { limit: 30 }),
    getProfileDisplayName(user.id),
    getRunSessionsForProject(id, user.id, { limit: 1 }),
    countProjectFiles(id, user.id),
  ]);
  if (!projectRaw) notFound();

  const project = mapProject(projectRaw) as Project;
  const allProjects = mapProjectList(allProjectsRaw) as Project[];
  const mobileRunSession = latestRun[0]
    ? toMobileRunSession(mapRunSession(latestRun[0]))
    : null;

  return (
    <>
      <div className="md:hidden">
        <MobileRouteShell
          project={toMobileProject(project, id)}
          projects={allProjects.map((item) => toMobileProject(item, id))}
          profile={{
            email: user.email ?? "",
            displayName: displayName,
          }}
          runSession={mobileRunSession}
          filesCount={filesCount}
          title="Project settings"
          subtitle={project.name}
          chatHref={`/projects/${id}`}
        >
          <MobileProjectSettingsScreen project={project} />
        </MobileRouteShell>
      </div>

      <WorkspaceContainer className="hidden md:flex">
        <SectionHeading
          title="Project settings"
          description="Edit the core metadata and idea for this project."
        />
        <div className="rounded-lg border border-border bg-card p-6">
          <ProjectSettingsForm project={project} />
        </div>
        <ProjectDangerZone project={project} />
      </WorkspaceContainer>
    </>
  );
}

function toMobileProject(
  project: Project,
  currentProjectId: string,
): MobileProject {
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
  };
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
    startedLabel: session.started_at
      ? formatRelative(session.started_at)
      : null,
    stoppedLabel: session.stopped_at
      ? formatRelative(session.stopped_at)
      : null,
  };
}
