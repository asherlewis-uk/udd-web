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
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();

  // Resolve user up-front so the query can belt-and-braces the RLS check
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

  if (!project) notFound();

  const { data } = await supabase
    .from("run_events")
    .select("id, level, source, message, created_at")
    .eq("project_id", id)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  const events = (data ?? []).slice().reverse();
  const typedProject = project as Project;
  const mobileProject = toMobileProject(typedProject, id);
  const mobileProjects = ((allProjectsData ?? []) as Project[]).map((item) =>
    toMobileProject(item, id),
  );
  const mobileRunSession = latestRunData
    ? toMobileRunSession(latestRunData as LatestRunSession)
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
            displayName: profileData?.display_name ?? null,
          }}
          runSession={mobileRunSession}
          filesCount={filesCount ?? 0}
          title="Console"
          subtitle={typedProject.name}
          chatHref={`/projects/${id}`}
        >
          <MobileLogsScreen events={mobileEvents} />
        </MobileRouteShell>
      </div>

      <WorkspaceContainer className="hidden md:flex">
        <SectionHeading
          title="Logs"
          description="Build and runtime output from past and current run sessions."
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

type LatestRunSession = {
  id: string;
  status: RunStatus;
  preview_url: string | null;
  started_at: string | null;
  stopped_at: string | null;
  created_at: string;
  error: string | null;
};

type RunEvent = {
  id: string;
  level: string;
  source: string;
  message: string;
  created_at: string;
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

function toMobileConsoleEvent(event: RunEvent): MobileConsoleEvent {
  return {
    id: event.id,
    level: event.level,
    source: event.source,
    message: event.message,
    createdLabel: formatRelative(event.created_at),
  };
}
