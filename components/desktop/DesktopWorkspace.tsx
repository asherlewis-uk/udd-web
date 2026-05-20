"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  ExternalLink,
  FileCode2,
  FolderTree,
  LayoutDashboard,
  Monitor,
  Play,
  Settings2,
  Sparkles,
  Terminal,
  Wrench,
  RefreshCw,
} from "lucide-react";
import { repairFailedTask, retryFailedTask } from "@/app/actions/ai";
import { AIPromptForm, type ActiveProviderInfo } from "@/components/ai/ai-prompt-form";
import { TaskDetail } from "@/components/ai/task-detail";
import { RunControls } from "@/components/run/run-controls";
import { LogStream } from "@/components/run/log-stream";
import { PreviewPanel } from "@/components/run/preview-panel";
import { RunStatusBadge } from "@/components/run/run-status-badge";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import type {
  MobileConversationEntry,
  MobileProfile,
  MobileProject,
  MobileRunSession,
} from "@/components/mobile/types";
import { ProjectDangerZone } from "@/components/workspace/project-danger-zone";
import { ProjectSettingsForm } from "@/components/workspace/project-settings-form";
import type { AITaskEventRow, AITaskRow } from "@/lib/ai/types";
import { formatRelative } from "@/lib/slug";
import type { Project } from "@/lib/types";
import type { NextAction, ProviderReadiness } from "@/lib/workspace/next-action";
import { cn } from "@/lib/utils";

export type DesktopPanel = "build" | "files" | "logs" | "settings";

export type DesktopRunEvent = {
  id: string;
  level: string;
  source: string;
  message: string;
  created_at: string;
};

export type DesktopProjectFile = {
  id: string;
  path: string;
  language: string | null;
  size_bytes: number;
  updated_at: string;
};

export type DesktopSelectedFile = DesktopProjectFile & {
  content: string;
};

type SelectedTaskEvent = Pick<AITaskEventRow, "id" | "kind" | "payload" | "created_at">;

type DesktopWorkspaceProps = {
  project: MobileProject;
  projectRecord: Project;
  projects: MobileProject[];
  profile: MobileProfile;
  conversation: MobileConversationEntry[];
  filesCount: number;
  latestRunSession: MobileRunSession | null;
  currentRunEvents: DesktopRunEvent[];
  projectLogEvents: DesktopRunEvent[];
  nextAction: NextAction;
  activeProvider: ActiveProviderInfo;
  providerReadiness: ProviderReadiness;
  taskInFlight: boolean;
  panel: DesktopPanel;
  files: DesktopProjectFile[];
  selectedFile: DesktopSelectedFile | null;
  selectedTask: AITaskRow | null;
  selectedTaskEvents: SelectedTaskEvent[];
  selectedTaskPrompt: string | null;
};

const PANEL_META: Record<
  DesktopPanel,
  {
    label: string;
    icon: typeof LayoutDashboard;
    description: string;
  }
> = {
  build: {
    label: "Build",
    icon: LayoutDashboard,
    description: "Conversation, next action, live preview, and current runtime output.",
  },
  files: {
    label: "Files",
    icon: FolderTree,
    description: "Saved project files, selected from persisted project state.",
  },
  logs: {
    label: "Logs",
    icon: Terminal,
    description: "Project-wide runtime and build output from recorded run events.",
  },
  settings: {
    label: "Settings",
    icon: Settings2,
    description: "Project metadata, idea seed, and destructive project actions.",
  },
};

export function normalizeDesktopPanel(panel?: string | null): DesktopPanel {
  if (panel === "files" || panel === "logs" || panel === "settings") return panel;
  return "build";
}

export function workspaceHref(
  projectId: string,
  panel: DesktopPanel,
  options?: { file?: string | null; task?: string | null },
): string {
  const params = new URLSearchParams();
  if (panel !== "build") {
    params.set("panel", panel);
  }
  if (options?.file && panel === "files") {
    params.set("file", options.file);
  }
  if (options?.task && panel === "build") {
    params.set("task", options.task);
  }
  const qs = params.toString();
  return qs ? `/projects/${projectId}?${qs}` : `/projects/${projectId}`;
}

export function DesktopWorkspace({
  project,
  projectRecord,
  projects,
  profile,
  conversation,
  filesCount,
  latestRunSession,
  currentRunEvents,
  projectLogEvents,
  nextAction,
  activeProvider,
  providerReadiness,
  taskInFlight,
  panel,
  files,
  selectedFile,
  selectedTask,
  selectedTaskEvents,
  selectedTaskPrompt,
}: DesktopWorkspaceProps) {
  const activePanel = PANEL_META[panel];
  const latestProjectLabel = project.lastOpenedLabel ?? project.updatedLabel;

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background text-foreground">
      <aside className="flex w-72 shrink-0 flex-col border-r border-glass-border/20 bg-background/80 backdrop-blur">
        <div className="border-b border-glass-border/20 px-5 py-4">
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 rounded-full border border-glass-border/30 bg-background/55 px-3 py-1.5 text-xs text-glass-purple-muted transition hover:border-glass-purple/40 hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All projects
          </Link>
          <div className="mt-4 rounded-2xl liquid-glass prismatic-border prismatic-inner p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-r from-glass-purple to-glass-coral text-white shadow-lg shadow-glass-purple/20">
                  <Sparkles className="h-4 w-4" />
                </div>
                <h1 className="mt-3 bg-gradient-to-r from-glass-purple to-glass-coral bg-clip-text text-xl font-semibold tracking-tight text-transparent">
                  {project.name}
                </h1>
                <p className="mt-1 text-sm text-glass-purple-muted/80">
                  {project.description ?? "Saved project workspace"}
                </p>
              </div>
              <StatusPill status={project.status} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="rounded-full border border-glass-border/30 bg-background/55 px-2.5 py-1 font-mono uppercase tracking-wider">
                {project.slug}
              </span>
              <span>{latestProjectLabel}</span>
            </div>
          </div>
        </div>

        <nav className="border-b border-glass-border/20 px-3 py-3">
          <div className="mb-2 px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Desktop workspace
          </div>
          <div className="space-y-1.5">
            {(Object.entries(PANEL_META) as Array<[DesktopPanel, (typeof PANEL_META)[DesktopPanel]]>).map(
              ([value, meta]) => {
                const Icon = meta.icon;
                const active = value === panel;
                return (
                  <Link
                    key={value}
                    href={workspaceHref(project.id, value)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                      active
                        ? "bg-linear-to-r from-glass-purple to-glass-coral text-white shadow-lg shadow-glass-purple/20"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="font-medium">{meta.label}</span>
                  </Link>
                );
              },
            )}
          </div>
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="mb-2 px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Projects
          </div>
          <div className="space-y-1.5">
            {projects.slice(0, 10).map((item) => (
              <Link
                key={item.id}
                href={`/projects/${item.id}`}
                className={cn(
                  "flex flex-col rounded-xl border px-3 py-3 transition",
                  item.current
                    ? "border-glass-purple/30 bg-glass-purple/10"
                    : "border-transparent hover:border-glass-border/30 hover:bg-secondary/55",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
                  {item.current ? (
                    <span className="rounded-full border border-glass-purple/30 bg-glass-purple/10 px-2 py-0.5 text-[10px] font-medium text-glass-purple">
                      Open
                    </span>
                  ) : null}
                </div>
                <span className="mt-1 truncate text-xs text-muted-foreground">
                  {item.description ?? item.updatedLabel}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="border-t border-glass-border/20 px-5 py-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl liquid-glass prismatic-border px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {profile.displayName ?? profile.email}
              </p>
              <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
            </div>
            <Link
              href="/settings"
              className="rounded-full border border-glass-border/30 bg-background/55 p-2 text-muted-foreground transition hover:text-foreground"
              aria-label="Open global settings"
            >
              <Settings2 className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 overflow-hidden">
        <section className="flex min-h-0 w-[27rem] shrink-0 flex-col border-r border-glass-border/20 bg-background/70 backdrop-blur">
          <div className="border-b border-glass-border/20 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Canonical desktop cockpit
                </p>
                <h2 className="mt-1 text-base font-semibold tracking-tight text-foreground">
                  Build in one place
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <RunStatusBadge status={latestRunSession?.status ?? "idle"} />
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                    providerReadiness.ready
                      ? "border-accent/35 bg-accent/10 text-accent"
                      : "border-destructive/35 bg-destructive/10 text-destructive",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      providerReadiness.ready ? "bg-accent" : "bg-destructive",
                    )}
                    aria-hidden
                  />
                  {activeProvider.label}
                </span>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-glass-border/25 bg-secondary/35 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{nextAction.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{nextAction.description}</p>
                </div>
                <Link
                  href={desktopCtaHref(project.id, nextAction)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition",
                    nextAction.state === "blocked"
                      ? "bg-amber-500/15 text-amber-300 hover:bg-amber-500/20"
                      : "bg-foreground text-background hover:opacity-90",
                  )}
                >
                  {nextAction.cta.label}
                </Link>
              </div>
              <p className="mt-3 text-xs text-muted-foreground/80">{nextAction.reason}</p>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {conversation.length === 0 && nextAction.code === "start_first_generation" ? (
              <div className="flex h-full min-h-80 items-center justify-center">
                <div className="max-w-sm rounded-3xl liquid-glass prismatic-border p-8 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-r from-glass-purple to-glass-coral text-white shadow-lg shadow-glass-purple/20">
                    <Bot className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold tracking-tight text-foreground">
                    Describe what you want to build
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    The desktop workspace stays on the real project route, uses the same persisted state as mobile, and starts with the same prompt-driven generation flow.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {conversation.map((entry) => (
                  <DesktopConversationMessage key={entry.id} entry={entry} projectId={project.id} />
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-glass-border/20 px-5 py-4">
            <AIPromptForm
              projectId={project.id}
              redirectTo={`/projects/${project.id}`}
              variant="cockpit"
              busy={taskInFlight}
              activeProvider={activeProvider}
            />
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <div className="border-b border-glass-border/20 px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <activePanel.icon className="h-4 w-4 text-glass-purple" />
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {activePanel.label}
                  </p>
                </div>
                <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                  {panelTitle(panel, selectedTask)}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">{activePanel.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {panel === "build" ? (
                  <>
                    <RunControls
                      projectId={project.id}
                      sessionId={latestRunSession?.id ?? null}
                      status={latestRunSession?.status ?? "idle"}
                    />
                    {latestRunSession?.status === "running" && latestRunSession.previewUrl ? (
                      <Button asChild variant="outline" size="sm" className="border-glass-border/30 bg-background/60">
                        <a href={latestRunSession.previewUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                          Open preview
                        </a>
                      </Button>
                    ) : null}
                  </>
                ) : null}
                {selectedTask ? (
                  <Button asChild variant="outline" size="sm" className="border-glass-border/30 bg-background/60">
                    <Link href={workspaceHref(project.id, "build")}>Back to canvas</Link>
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
            {panel === "build" ? (
              <BuildPanel
                project={project}
                filesCount={filesCount}
                latestRunSession={latestRunSession}
                currentRunEvents={currentRunEvents}
                selectedTask={selectedTask}
                selectedTaskEvents={selectedTaskEvents}
                selectedTaskPrompt={selectedTaskPrompt}
              />
            ) : null}
            {panel === "files" ? (
              <FilesPanel projectId={project.id} files={files} selectedFile={selectedFile} />
            ) : null}
            {panel === "logs" ? <LogsPanel events={projectLogEvents} /> : null}
            {panel === "settings" ? <SettingsPanel project={projectRecord} /> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function BuildPanel({
  project,
  filesCount,
  latestRunSession,
  currentRunEvents,
  selectedTask,
  selectedTaskEvents,
  selectedTaskPrompt,
}: {
  project: MobileProject;
  filesCount: number;
  latestRunSession: MobileRunSession | null;
  currentRunEvents: DesktopRunEvent[];
  selectedTask: AITaskRow | null;
  selectedTaskEvents: SelectedTaskEvent[];
  selectedTaskPrompt: string | null;
}) {
  if (selectedTask) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-glass-border/25 bg-secondary/30 p-4 text-sm text-muted-foreground">
          This workspace is showing the selected generation run inside the canonical desktop shell so desktop task inspection stays in one place instead of splitting back out into a separate route.
        </div>
        <TaskDetail
          task={selectedTask}
          events={selectedTaskEvents}
          prompt={selectedTaskPrompt}
          projectId={project.id}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="rounded-3xl liquid-glass prismatic-border prismatic-inner p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Project state
              </p>
              <h4 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
                {project.name}
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {filesCount} saved file{filesCount === 1 ? "" : "s"} · {project.updatedLabel}
              </p>
            </div>
            <StatusPill status={project.status} />
          </div>
        </div>

        <PreviewPanel
          status={latestRunSession?.status ?? "idle"}
          projectName={project.name}
          previewUrl={latestRunSession?.previewUrl ?? null}
          error={latestRunSession?.error ?? null}
          className="min-h-[32rem]"
        />
      </div>

      <div className="flex min-h-0 flex-col gap-5">
        <div className="rounded-3xl border border-glass-border/25 bg-secondary/35 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Monitor className="h-4 w-4 text-glass-purple" />
            Current runtime
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Build keeps the live preview and the current run output together so desktop does not split the cockpit into separate preview and console destinations anymore.
          </p>
        </div>
        <LogStream
          events={currentRunEvents}
          emptyLabel={
            latestRunSession
              ? "Waiting for current run output..."
              : "No run yet. Start local preview to validate saved files and stream runtime output here."
          }
          className="min-h-[24rem]"
        />
      </div>
    </div>
  );
}

function FilesPanel({
  projectId,
  files,
  selectedFile,
}: {
  projectId: string;
  files: DesktopProjectFile[];
  selectedFile: DesktopSelectedFile | null;
}) {
  if (files.length === 0) {
    return (
      <div className="flex min-h-[22rem] items-center justify-center rounded-3xl liquid-glass prismatic-border p-8 text-center">
        <div>
          <FolderTree className="mx-auto h-10 w-10 text-glass-purple-muted" />
          <h4 className="mt-4 text-lg font-semibold text-foreground">No saved files yet</h4>
          <p className="mt-2 text-sm text-muted-foreground">
            Generate or repair the project first. The desktop files pane reads real persisted project files, not mock output.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-3xl liquid-glass prismatic-border bg-card/60">
        <div className="flex items-center justify-between gap-3 border-b border-glass-border/20 px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Saved files
          </span>
          <span className="text-xs text-muted-foreground">
            {files.length} file{files.length === 1 ? "" : "s"}
          </span>
        </div>
        <ul className="max-h-[70vh] divide-y divide-glass-border/20 overflow-auto">
          {files.map((file) => {
            const active = file.path === selectedFile?.path;
            return (
              <li key={file.id}>
                <Link
                  href={workspaceHref(projectId, "files", { file: file.path })}
                  scroll={false}
                  className={cn(
                    "flex flex-col gap-1 px-4 py-3 text-sm transition",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  <span className="truncate font-mono text-xs text-foreground">{file.path}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {file.language ?? "file"} · {formatFileSize(file.size_bytes)} · Updated {formatRelative(file.updated_at)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="min-w-0 overflow-hidden rounded-3xl liquid-glass prismatic-border bg-card/60">
        {selectedFile ? (
          <>
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-glass-border/20 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <h4 className="truncate font-mono text-sm text-foreground">{selectedFile.path}</h4>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Saved {formatRelative(selectedFile.updated_at)} · {formatFileSize(selectedFile.size_bytes)}
                </p>
              </div>
              <span className="rounded-sm border border-border/70 bg-background/60 px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground">
                {selectedFile.language ?? "file"}
              </span>
            </header>
            <pre className="max-h-[75vh] overflow-auto p-4 font-mono text-[12px] leading-relaxed text-foreground">
              <code>{selectedFile.content}</code>
            </pre>
          </>
        ) : (
          <div className="flex min-h-[22rem] items-center justify-center p-6 text-sm text-muted-foreground">
            Select a saved file.
          </div>
        )}
      </section>
    </div>
  );
}

function LogsPanel({ events }: { events: DesktopRunEvent[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-3xl border border-glass-border/25 bg-secondary/35 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Terminal className="h-4 w-4 text-glass-purple" />
          Project-wide log history
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          This pane reads the recorded run events for the project and keeps desktop log inspection in the same cockpit instead of a separate desktop route.
        </p>
      </div>
      <LogStream
        events={events}
        autoScroll={false}
        emptyLabel="No logs yet. Start a run to populate project log history."
        className="min-h-[32rem]"
      />
    </div>
  );
}

function SettingsPanel({ project }: { project: Project }) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="rounded-3xl liquid-glass prismatic-border p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Project metadata
              </p>
              <h4 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                Edit name, description, and idea seed
              </h4>
            </div>
            <Button asChild variant="outline" size="sm" className="border-glass-border/30 bg-background/60">
              <Link href="/settings">Global settings</Link>
            </Button>
          </div>
          <div className="mt-6 rounded-2xl bg-background/55 p-5">
            <ProjectSettingsForm project={project} />
          </div>
        </div>
        <ProjectDangerZone project={project} />
      </div>

      <aside className="rounded-3xl border border-glass-border/25 bg-secondary/35 p-5">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Desktop risk guardrail
        </p>
        <h4 className="mt-2 text-sm font-semibold text-foreground">Keep provider management global</h4>
        <p className="mt-2 text-sm text-muted-foreground">
          The desktop workspace owns project metadata here, but provider credentials still live in global settings. That avoids splitting credential truth between mobile webview flows and the new desktop shell.
        </p>
      </aside>
    </div>
  );
}

function DesktopConversationMessage({
  entry,
  projectId,
}: {
  entry: MobileConversationEntry;
  projectId: string;
}) {
  const isUser = entry.role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[95%] text-sm leading-relaxed",
          isUser
            ? "rounded-3xl rounded-tr-md bg-foreground px-4 py-3 text-background"
            : "rounded-3xl rounded-tl-md liquid-glass prismatic-border px-4 py-3 text-foreground",
        )}
      >
        {!isUser && entry.badges?.length ? (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {entry.badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border border-glass-border/30 bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}
        <p className="whitespace-pre-wrap">{entry.body}</p>
        {!isUser && entry.facts?.length ? (
          <div className="mt-3 flex flex-col gap-1.5 text-xs text-muted-foreground">
            {entry.facts.map((fact) => (
              <p
                key={`${entry.id}-${fact.label}`}
                className={cn(
                  fact.tone === "destructive" && "text-destructive",
                  fact.tone === "success" && "text-accent",
                )}
              >
                <span className="font-medium text-foreground">{fact.label}:</span> {fact.value}
              </p>
            ))}
          </div>
        ) : null}
        {!isUser ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
            {entry.href ? (
              <Link
                href={desktopHrefFromConversation(projectId, entry.href.url, entry.taskId ?? null)}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {entry.href.label}
              </Link>
            ) : null}
            <DesktopRepairRetryControls entry={entry} projectId={projectId} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DesktopRepairRetryControls({
  entry,
  projectId,
}: {
  entry: MobileConversationEntry;
  projectId: string;
}) {
  if (!entry.taskId) return null;

  if (entry.canRepair) {
    return (
      <form action={repairFailedTask}>
        <input type="hidden" name="task_id" value={entry.taskId} />
        <input type="hidden" name="project_id" value={projectId} />
        <input type="hidden" name="redirect_to" value={workspaceHref(projectId, "build", { task: entry.taskId })} />
        <button
          type="submit"
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          <Wrench className="h-3.5 w-3.5" />
          Repair
        </button>
      </form>
    );
  }

  if (entry.canRetry) {
    return (
      <form action={retryFailedTask}>
        <input type="hidden" name="task_id" value={entry.taskId} />
        <input type="hidden" name="project_id" value={projectId} />
        <input type="hidden" name="redirect_to" value={workspaceHref(projectId, "build", { task: entry.taskId })} />
        <button
          type="submit"
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </form>
    );
  }

  return null;
}

function desktopHrefFromConversation(projectId: string, href: string, taskId: string | null): string {
  if (href.includes("/files")) {
    return workspaceHref(projectId, "files");
  }
  if (href.includes("/logs")) {
    return workspaceHref(projectId, "logs");
  }
  if (href.includes("/run")) {
    return workspaceHref(projectId, "build");
  }
  if (href.includes("/ai")) {
    return workspaceHref(projectId, "build", { task: taskId });
  }
  return workspaceHref(projectId, "build", { task: taskId });
}

function desktopCtaHref(projectId: string, nextAction: NextAction): string {
  if (nextAction.cta.action === "provider_credential") {
    return "/settings";
  }
  if (nextAction.cta.action === "inspect_runtime") {
    return workspaceHref(projectId, "logs");
  }
  if (nextAction.cta.action === "inspect_generation") {
    return workspaceHref(projectId, "build", { task: nextAction.cta.taskId ?? null });
  }
  if (nextAction.cta.action === "repair" || nextAction.cta.action === "retry") {
    return workspaceHref(projectId, "build", { task: nextAction.cta.taskId ?? null });
  }
  return workspaceHref(projectId, "build");
}

function panelTitle(panel: DesktopPanel, selectedTask: AITaskRow | null): string {
  if (panel !== "build") return PANEL_META[panel].label;
  if (selectedTask) return `Generation detail · ${selectedTask.title}`;
  return "Live cockpit";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
