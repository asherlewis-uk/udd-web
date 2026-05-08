import { notFound } from "next/navigation";
import { Terminal } from "lucide-react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  WorkspaceContainer,
  SectionHeading,
} from "@/components/workspace/workspace-container";
import { MobileRouteShell } from "@/components/mobile/mobile-route-shell";
import {
  MobileLogsScreen,
  type MobileConsoleEvent,
} from "@/components/mobile/logs-screen";
import { getSession } from "@/lib/auth-session";
import {
  getProjectByIdAndOwner,
  getProjectsForOwner,
  getProfileDisplayName,
  getRunSessionsForProject,
  countProjectFiles,
  getRunEventsForProject,
} from "@/lib/db/queries";
import { mapProject, mapProjectList, mapRunSession, mapRunEvent } from "@/lib/db/mappers";
import { formatRelative } from "@/lib/slug";
import { cn } from "@/lib/utils";
import type { Project, RunStatus } from "@/lib/types";
import type {
  MobileProject,
  MobileRunSession,
} from "@/components/mobile/types";

const LEVEL_TONE: Record<string, string> = {
  info: "text-muted-foreground",
  warn: "text-foreground",
  error: "text-destructive",
  system: "text-accent",
};

export default async function LogsPage({
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

  const eventRows = await getRunEventsForProject(id, user.id, { limit: 200 });
  const events = eventRows.map(mapRunEvent).slice().reverse();

  const mobileProject = toMobileProject(project, id);
  const mobileProjects = allProjects.map((item) => toMobileProject(item, id));
  const mobileRunSession = latestRun[0]
    ? toMobileRunSession(mapRunSession(latestRun[0]))
    : null;
  const mobileEvents = events.map(toMobileConsoleEvent);

  return (
    <>
      <div className="md:hidden">
        <MobileRouteShell
          project={mobileProject}
          projects={mobileProjects}
          profile={{
            email: user.email ?? "",
            displayName: displayName,
          }}
          runSession={mobileRunSession}
          filesCount={filesCount}
          title="Console"
          subtitle={project.name}
          chatHref={`/projects/${id}`}
        >
          <MobileLogsScreen events={mobileEvents} />
        </MobileRouteShell>
      </div>

      <WorkspaceContainer className="hidden md:flex">
        <SectionHeading
          title="Logs"
          description="Build and runtime output from past and current run sessions."
          actions={
            events.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                Showing last 200 events
              </span>
            ) : null
          }
        />

        {events.length === 0 ? (
          <Empty className="border border-dashed border-border bg-card/40">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Terminal className="h-5 w-5" />
              </EmptyMedia>
              <EmptyTitle>No logs yet</EmptyTitle>
              <EmptyDescription>
                Logs appear here as soon as you start a run. The runtime
                validates your generated files and reports build output in real
                time.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-[oklch(0.13_0_0)]">
            <pre className="max-h-[60vh] overflow-auto p-4 font-mono text-[12px] leading-relaxed">
              {events.map((e) => (
                <div key={e.id} className="flex gap-3">
                  <span className="shrink-0 text-muted-foreground/70">
                    {new Date(e.created_at).toLocaleTimeString()}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 uppercase tracking-wider",
                      LEVEL_TONE[e.level] ?? "text-muted-foreground",
                    )}
                  >
                    {e.level}
                  </span>
                  <span className="shrink-0 text-muted-foreground">
                    [{e.source}]
                  </span>
                  <span className="whitespace-pre-wrap break-all">
                    {e.message}
                  </span>
                </div>
              ))}
            </pre>
          </div>
        )}
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

function toMobileConsoleEvent(event: {
  id: string;
  level: string;
  source: string;
  message: string;
  created_at: string;
}): MobileConsoleEvent {
  return {
    id: event.id,
    level: event.level,
    source: event.source,
    message: event.message,
    createdLabel: formatRelative(event.created_at),
  };
}
