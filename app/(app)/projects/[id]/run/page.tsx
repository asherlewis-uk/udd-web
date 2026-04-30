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
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();

  // Resolve user up-front so every query can belt-and-braces the RLS check
  // with an explicit owner filter. The (app) layout already redirects
  // unauthenticated users, so notFound() here is purely defensive.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [
    { data: project },
    { data: allProjectsData },
    { data: profileData },
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
  ]);
  if (!project) notFound();

  // Opportunistically mark any long-stalled sessions as error before loading
  // the list. This keeps the UI honest without requiring a background job.
  await reapStaleSessions(id, user.id);

  const [{ data: sessionsData }, { count: filesCount }] = await Promise.all([
    supabase
      .from("run_sessions")
      .select(
        "id, status, preview_url, started_at, stopped_at, created_at, error",
      )
      .eq("project_id", id)
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("project_files")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id)
      .eq("owner_id", user.id),
  ]);

  const sessions = (sessionsData ?? []) as Array<{
    id: string;
    status: RunStatus;
    preview_url: string | null;
    started_at: string | null;
    stopped_at: string | null;
    created_at: string;
    error: string | null;
  }>;

  const current = sessions[0] ?? null;
  const status: RunStatus = current?.status ?? "idle";

  // Events for the current session (not the whole project) so the log panel
  // tracks this run specifically.
  const { data: eventsData } = current
    ? await supabase
        .from("run_events")
        .select("id, level, source, message, created_at")
        .eq("session_id", current.id)
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true })
        .limit(300)
    : { data: [] as never[] };

  const events = (eventsData ?? []) as Array<{
    id: string;
    level: string;
    source: string;
    message: string;
    created_at: string;
  }>;

  const inFlight =
    status === "starting" || status === "running" || status === "stopping";

  const mobileSession = current ? toMobileRunSession(current) : null;
  const mobileEvents = events.map(toMobileRunEvent);
  const typedProject = project as Project;
  const mobileProject = toMobileProject(typedProject, id);
  const mobileProjects = ((allProjectsData ?? []) as Project[]).map((item) =>
    toMobileProject(item, id),
  );
  const mobileProfile: MobileProfile = {
    email: user.email ?? "",
    displayName: profileData?.display_name ?? null,
  };

  return (
    <>
      <MobilePreviewRouteScreen
        projectId={id}
        projectName={typedProject.name}
        project={mobileProject}
        projects={mobileProjects}
        profile={mobileProfile}
        filesCount={filesCount ?? 0}
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
              projectName={typedProject.name}
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
            <SessionsHistory sessions={sessions.slice(1)} />
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
  status: RunStatus;
  preview_url: string | null;
  started_at: string | null;
  stopped_at: string | null;
  created_at: string;
  error: string | null;
}): MobileRunSession {
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
