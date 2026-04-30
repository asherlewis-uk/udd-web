"use client";

import { useRouter } from "next/navigation";
import { MobileRouteShell } from "./mobile-route-shell";
import { PreviewScreen } from "./preview-screen";
import type {
  MobileProfile,
  MobileProject,
  MobileRunEvent,
  MobileRunSession,
} from "./types";

export function MobilePreviewRouteScreen({
  projectId,
  projectName,
  project,
  projects,
  profile,
  filesCount,
  session,
  events,
}: {
  projectId: string;
  projectName: string;
  project: MobileProject;
  projects: MobileProject[];
  profile: MobileProfile;
  filesCount: number;
  session: MobileRunSession | null;
  events: MobileRunEvent[];
}) {
  const router = useRouter();

  return (
    <div className="md:hidden">
      <MobileRouteShell
        project={project}
        projects={projects}
        profile={profile}
        runSession={session}
        filesCount={filesCount}
        title="Preview"
        subtitle={projectName}
        chatHref={`/projects/${projectId}`}
      >
        <PreviewScreen
          projectId={projectId}
          projectName={projectName}
          filesCount={filesCount}
          session={session}
          events={events}
          onBackToChat={() => router.push(`/projects/${projectId}`)}
          onActionsClick={() => {}}
          showHeader={false}
        />
      </MobileRouteShell>
    </div>
  );
}
