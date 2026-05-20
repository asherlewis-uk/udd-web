import { formatRelative } from "@/lib/slug";
import type { Project, RunStatus } from "@/lib/types";
import type {
  MobileProject,
  MobileRunSession,
  MobileRunEvent,
} from "@/components/mobile/types";

export function toMobileProject(
  project: Project,
  currentProjectId?: string,
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
    current: currentProjectId ? project.id === currentProjectId : false,
  };
}

const RUN_STATUS_VALUES: readonly string[] = [
  "idle",
  "starting",
  "running",
  "stopping",
  "stopped",
  "error",
];

function isRunStatus(value: string): value is RunStatus {
  return RUN_STATUS_VALUES.includes(value);
}

export function toMobileRunSession(session: {
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
    status: isRunStatus(session.status) ? session.status : "idle",
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

export function toMobileRunEvent(event: {
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
