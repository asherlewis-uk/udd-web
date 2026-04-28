"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PreviewScreen } from "./preview-screen";
import { ProjectActionsMenu } from "./project-actions-menu";
import type { MobileRunEvent, MobileRunSession } from "./types";

export function MobilePreviewRouteScreen({
  projectId,
  projectName,
  filesCount,
  session,
  events,
}: {
  projectId: string;
  projectName: string;
  filesCount: number;
  session: MobileRunSession | null;
  events: MobileRunEvent[];
}) {
  const router = useRouter();
  const [isActionsOpen, setIsActionsOpen] = useState(false);

  return (
    <main className="h-dvh min-h-0 overflow-hidden bg-background text-foreground md:hidden">
      <PreviewScreen
        projectId={projectId}
        projectName={projectName}
        filesCount={filesCount}
        session={session}
        events={events}
        onBackToChat={() => router.push(`/projects/${projectId}`)}
        onActionsClick={() => setIsActionsOpen(true)}
      />
      <ProjectActionsMenu
        isOpen={isActionsOpen}
        projectId={projectId}
        runSession={session}
        filesCount={filesCount}
        onClose={() => setIsActionsOpen(false)}
      />
    </main>
  );
}
