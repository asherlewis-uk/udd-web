/**
 * Mappers to convert Drizzle ORM results (camelCase + Date timestamps)
 * to the legacy shape (snake_case + ISO string timestamps) expected by
 * existing components and types.
 */

import type {
  projects,
  profiles,
  projectFiles,
  aiTasks,
  aiTaskEvents,
  runSessions,
  runEvents,
  prompts,
  providerConfigs,
  userSecrets,
} from "./schema";

// ------------------------------------------------------------------
// Projects
// ------------------------------------------------------------------

export function mapProject(
  row: typeof projects.$inferSelect,
): {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  idea: string | null;
  status: string;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
} {
  return {
    id: row.id,
    owner_id: row.ownerId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    idea: row.idea,
    status: row.status,
    last_opened_at: row.lastOpenedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function mapProjectList(
  rows: (typeof projects.$inferSelect)[],
): ReturnType<typeof mapProject>[] {
  return rows.map(mapProject);
}

// ------------------------------------------------------------------
// Profiles
// ------------------------------------------------------------------

export function mapProfile(
  row: typeof profiles.$inferSelect,
): {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
} {
  return {
    id: row.id,
    display_name: row.displayName,
    avatar_url: row.avatarUrl,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// ------------------------------------------------------------------
// Project files
// ------------------------------------------------------------------

export function mapProjectFile(
  row: typeof projectFiles.$inferSelect,
): {
  id: string;
  project_id: string;
  owner_id: string;
  path: string;
  content: string;
  language: string | null;
  size_bytes: number;
  created_at: string;
  updated_at: string;
} {
  return {
    id: row.id,
    project_id: row.projectId,
    owner_id: row.ownerId,
    path: row.path,
    content: row.content,
    language: row.language,
    size_bytes: row.sizeBytes,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function mapProjectFileList(
  rows: (typeof projectFiles.$inferSelect)[],
): ReturnType<typeof mapProjectFile>[] {
  return rows.map(mapProjectFile);
}

// ------------------------------------------------------------------
// AI tasks
// ------------------------------------------------------------------

export function mapAITask(
  row: typeof aiTasks.$inferSelect,
): {
  id: string;
  project_id: string;
  owner_id: string;
  prompt_id: string | null;
  run_session_id: string | null;
  kind: string;
  title: string;
  status: string;
  input: Record<string, unknown>;
  output: unknown;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
} {
  return {
    id: row.id,
    project_id: row.projectId,
    owner_id: row.ownerId,
    prompt_id: row.promptId,
    run_session_id: row.runSessionId,
    kind: row.kind,
    title: row.title,
    status: row.status,
    input: row.input as Record<string, unknown>,
    output: row.output,
    error: row.error,
    created_at: row.createdAt.toISOString(),
    started_at: row.startedAt?.toISOString() ?? null,
    finished_at: row.finishedAt?.toISOString() ?? null,
  };
}

export function mapAITaskListItem(
  row: Pick<
    typeof aiTasks.$inferSelect,
    "id" | "title" | "kind" | "status" | "createdAt" | "finishedAt"
  >,
): {
  id: string;
  title: string;
  kind: string;
  status: string;
  created_at: string;
  finished_at: string | null;
} {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind,
    status: row.status,
    created_at: row.createdAt.toISOString(),
    finished_at: row.finishedAt?.toISOString() ?? null,
  };
}

// ------------------------------------------------------------------
// AI task events
// ------------------------------------------------------------------

export function mapAITaskEvent(
  row: typeof aiTaskEvents.$inferSelect,
): {
  id: string;
  task_id: string;
  owner_id: string;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
} {
  return {
    id: row.id,
    task_id: row.taskId,
    owner_id: row.ownerId,
    kind: row.kind,
    payload: row.payload as Record<string, unknown>,
    created_at: row.createdAt.toISOString(),
  };
}

// ------------------------------------------------------------------
// Run sessions
// ------------------------------------------------------------------

export function mapRunSession(
  row: typeof runSessions.$inferSelect,
): {
  id: string;
  project_id: string;
  owner_id: string;
  status: string;
  preview_url: string | null;
  started_at: string | null;
  stopped_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
} {
  return {
    id: row.id,
    project_id: row.projectId,
    owner_id: row.ownerId,
    status: row.status,
    preview_url: row.previewUrl,
    started_at: row.startedAt?.toISOString() ?? null,
    stopped_at: row.stoppedAt?.toISOString() ?? null,
    error: row.error,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function mapRunSessionList(
  rows: (typeof runSessions.$inferSelect)[],
): ReturnType<typeof mapRunSession>[] {
  return rows.map(mapRunSession);
}

// ------------------------------------------------------------------
// Run events
// ------------------------------------------------------------------

export function mapRunEvent(
  row: typeof runEvents.$inferSelect,
): {
  id: string;
  session_id: string;
  project_id: string;
  owner_id: string;
  level: string;
  source: string;
  message: string;
  created_at: string;
} {
  return {
    id: row.id,
    session_id: row.sessionId,
    project_id: row.projectId,
    owner_id: row.ownerId,
    level: row.level,
    source: row.source,
    message: row.message,
    created_at: row.createdAt.toISOString(),
  };
}

export function mapRunEventList(
  rows: (typeof runEvents.$inferSelect)[],
): ReturnType<typeof mapRunEvent>[] {
  return rows.map(mapRunEvent);
}

// ------------------------------------------------------------------
// Prompts
// ------------------------------------------------------------------

export function mapPrompt(
  row: typeof prompts.$inferSelect,
): {
  id: string;
  project_id: string;
  owner_id: string;
  body: string;
  created_at: string;
} {
  return {
    id: row.id,
    project_id: row.projectId,
    owner_id: row.ownerId,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

// ------------------------------------------------------------------
// Provider configs
// ------------------------------------------------------------------

export function mapProviderConfig(
  row: typeof providerConfigs.$inferSelect,
): {
  id: string;
  owner_id: string;
  kind: string;
  name: string;
  config: Record<string, unknown>;
  secret_ref: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
} {
  return {
    id: row.id,
    owner_id: row.ownerId,
    kind: row.kind,
    name: row.name,
    config: row.config as Record<string, unknown>,
    secret_ref: row.secretRef,
    is_active: row.isActive,
    is_default: row.isDefault,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

// ------------------------------------------------------------------
// User secrets
// ------------------------------------------------------------------

export function mapUserSecret(
  row: typeof userSecrets.$inferSelect,
): {
  id: string;
  owner_id: string;
  kind: string;
  name: string;
  encrypted_value: string;
  created_at: string;
  updated_at: string;
} {
  return {
    id: row.id,
    owner_id: row.ownerId,
    kind: row.kind,
    name: row.name,
    encrypted_value: row.encryptedValue,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}
