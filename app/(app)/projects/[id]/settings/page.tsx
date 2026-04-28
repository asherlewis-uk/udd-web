import { notFound } from "next/navigation";
import {
  WorkspaceContainer,
  SectionHeading,
} from "@/components/workspace/workspace-container";
import { ProjectSettingsForm } from "@/components/workspace/project-settings-form";
import { ProjectDangerZone } from "@/components/workspace/project-danger-zone";
import { MobileRouteShell } from "@/components/mobile/mobile-route-shell";
import { MobileProjectSettingsScreen } from "@/components/mobile/project-settings-screen";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/slug";
import type { Project } from "@/lib/types";
import type { RunStatus } from "@/lib/types";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [
    { data },
    { data: allProjectsData },
    { data: profileData },
    { data: latestRunData },
    { count: filesCount },
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
      .select(
        "id, status, preview_url, started_at, stopped_at, created_at, error",
      )
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
  ]);
  if (!data) notFound();
  const project = data as Project;
  const mobileProject = toMobileProject(project, id);
  const mobileProjects = ((allProjectsData ?? []) as Project[]).map((item) =>
    toMobileProject(item, id),
  );
  const mobileRunSession = latestRunData
    ? toMobileRunSession(latestRunData as LatestRunSession)
    : null;

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

type LatestRunSession = {
  id: string;
  status: RunStatus;
  preview_url: string | null;
  started_at: string | null;
  stopped_at: string | null;
  created_at: string;
  error: string | null;
};

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

function toMobileRunSession(session: LatestRunSession): MobileRunSession {
  return {
    id: session.id,
    status: session.status,
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
