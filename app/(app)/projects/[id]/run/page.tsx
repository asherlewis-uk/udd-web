import { notFound } from "next/navigation";
import {
  WorkspaceContainer,
  SectionHeading,
} from "@/components/workspace/workspace-container";
import { RunControls } from "@/components/run/run-controls";
import { RunStatusBadge } from "@/components/run/run-status-badge";
import { RunPoller } from "@/components/run/run-poller";
import { LogStream } from "@/components/run/log-stream";
import { PreviewPanel } from "@/components/run/preview-panel";
import { SessionsHistory } from "@/components/run/sessions-history";
import { MobilePreviewRouteScreen } from "@/components/mobile/preview-route-screen";
import { getSession } from "@/lib/auth-session";
import {
  getProjectByIdAndOwner,
  getProjectsForOwner,
  getProfileDisplayName,
  getRunSessionsForProject,
  countProjectFiles,
  getRunEventsForSession,
} from "@/lib/db/queries";
import { mapProject, mapProjectList, mapRunSession, mapRunEvent } from "@/lib/db/mappers";
import { formatRelative } from "@/lib/slug";
import { reapStaleSessions } from "@/lib/runtime/service";
import type { Project, RunStatus } from "@/lib/types";
import type {
  MobileProject,
  MobileProfile,
  MobileRunEvent,
  MobileRunSession,
} from "@/components/mobile/types";

export default async function RunPage({
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
  ] = await Promise.all([
    getProjectByIdAndOwner(id, user.id),
    getProjectsForOwner(user.id, { limit: 30 }),
    getProfileDisplayName(user.id),
  ]);
  if (!projectRaw) notFound();

  await reapStaleSessions(id, user.id);

  const project = mapProject(projectRaw) as Project;
  const allProjects = mapProjectList(allProjectsRaw) as Project[];

  const [sessionRows, filesCount] = await Promise.all([
    getRunSessionsForProject(id, user.id, { limit: 20 }),
    countProjectFiles(id, user.id),
  ]);

  const sessions = sessionRows.map(mapRunSession);
  const current = sessions[0] ?? null;
  const status: RunStatus = current?.status as RunStatus ?? "idle";

  const eventRows = current
    ? await getRunEventsForSession(current.id, user.id, { limit: 300 })
    : [];
  const events = eventRows.map(mapRunEvent);

  const inFlight =
    status === "starting" || status === "running" || status === "stopping";

  const mobileSession = current ? toMobileRunSession(current) : null;
  const mobileEvents = events.map(toMobileRunEvent);
  const mobileProject = toMobileProject(project, id);
  const mobileProjects = allProjects.map((item) => toMobileProject(item, id));
  const mobileProfile: MobileProfile = {
    email: user.email ?? "",
    displayName: displayName,
  };

  return (
    <>
      <MobilePreviewRouteScreen
        projectId={id}
        projectName={project.name}
        project={mobileProject}
        projects={mobileProjects}
        profile={mobileProfile}
        filesCount={filesCount}
        session={mobileSession}
        events={mobileEvents}
      />

      <WorkspaceContainer className="hidden md:flex">
        <div className="flex items-start justify-between gap-4">
          <SectionHeading
            title="Run"
            description="Validate saved files, start a bounded local preview when the project shape supports it, and watch real output stream in."
          />
          <div className="flex items-center gap-3 pt-1">
            <RunStatusBadge status={status} />
            <RunControls
              projectId={id}
              sessionId={current?.id ?? null}
              status={status}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <PreviewPanel
              status={status}
              projectName={project.name}
              previewUrl={current?.preview_url ?? null}
              error={current?.error ?? null}
            />
          </div>
          <div className="lg:col-span-2">
            <LogStream
              events={events}
              emptyLabel={
                current
                  ? "Warming up..."
                  : "No run yet. Press Start Preview to validate saved files and try a local preview."
              }
            />
          </div>
        </div>

        {sessions.length > 1 ? (
          <section className="flex flex-col gap-2">
            <span className="px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Recent sessions
            </span>
            <SessionsHistory sessions={sessions.slice(1).map((s) => ({ ...s, status: s.status as RunStatus }))} />
          </section>
        ) : null}

        <RunPoller active={inFlight} />
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

function toMobileRunEvent(event: {
  id: string;
  level: string;
  source: string;
  message: string;
  created_at: string;
}): MobileRunEvent {
  return {
    id: event.id,
    level: event.level,
    source: event.source,
    message: event.message,
    createdLabel: formatRelative(event.created_at),
  };
}
