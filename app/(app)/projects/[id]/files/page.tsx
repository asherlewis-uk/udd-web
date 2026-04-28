import Link from "next/link";
import { notFound } from "next/navigation";
import { FileCode2, FolderTree } from "lucide-react";
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
  MobileFilesScreen,
  type MobileFileDetail,
} from "@/components/mobile/files-screen";
import { createClient } from "@/lib/supabase/server";
import { formatRelative } from "@/lib/slug";
import { cn } from "@/lib/utils";
import type { Project, RunStatus } from "@/lib/types";
import type {
  MobileProject,
  MobileRunSession,
} from "@/components/mobile/types";

type FileListItem = {
  id: string;
  path: string;
  language: string | null;
  size_bytes: number;
  updated_at: string;
};

type SelectedFile = FileListItem & {
  content: string;
};

export default async function FilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ file?: string }>;
}) {
  const { id } = await params;
  const { file: requestedFile } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const [
    { data: project },
    { data: allProjectsData },
    { data: profileData },
    { data: latestRunData },
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
  ]);
  if (!project) notFound();

  const { data, error } = await supabase
    .from("project_files")
    .select("id, path, language, size_bytes, updated_at")
    .eq("project_id", id)
    .eq("owner_id", user.id)
    .order("path");

  const files = (data ?? []) as FileListItem[];
  const selectedPath =
    files.find((file) => file.path === requestedFile)?.path ??
    files[0]?.path ??
    null;

  let selectedFile: SelectedFile | null = null;
  if (selectedPath) {
    const { data: selectedData } = await supabase
      .from("project_files")
      .select("id, path, language, size_bytes, updated_at, content")
      .eq("project_id", id)
      .eq("owner_id", user.id)
      .eq("path", selectedPath)
      .maybeSingle();
    selectedFile = (selectedData as SelectedFile | null) ?? null;
  }

  const typedProject = project as Project;
  const mobileProject = toMobileProject(typedProject, id);
  const mobileProjects = ((allProjectsData ?? []) as Project[]).map((item) =>
    toMobileProject(item, id),
  );
  const mobileFiles = files.map(toMobileFileDetail);
  const mobileSelectedFile = selectedFile
    ? { ...toMobileFileDetail(selectedFile), content: selectedFile.content }
    : null;
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
          filesCount={files.length}
          title="View code"
          subtitle={typedProject.name}
          chatHref={`/projects/${id}`}
        >
          <MobileFilesScreen
            projectId={id}
            files={mobileFiles}
            selectedFile={mobileSelectedFile}
          />
        </MobileRouteShell>
      </div>

      <WorkspaceContainer className="hidden md:flex">
        <SectionHeading
          title="Files"
          description="Browse the code saved for this project."
        />

        {error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {error.message}
          </div>
        ) : files.length === 0 ? (
          <Empty className="border border-dashed border-border bg-card/40">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderTree className="h-5 w-5" />
              </EmptyMedia>
              <EmptyTitle>No files yet</EmptyTitle>
              <EmptyDescription>
                Generate or repair a project to create saved files.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <aside className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Saved files
                </span>
                <span className="text-xs text-muted-foreground">
                  {files.length} file{files.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="max-h-[70vh] divide-y divide-border overflow-auto">
                {files.map((file) => {
                  const active = file.path === selectedPath;
                  return (
                    <li key={file.id}>
                      <Link
                        href={fileHref(id, file.path)}
                        scroll={false}
                        className={cn(
                          "flex flex-col gap-1 px-4 py-3 text-sm transition",
                          active
                            ? "bg-secondary text-foreground"
                            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                        )}
                      >
                        <span className="truncate font-mono text-xs text-foreground">
                          {file.path}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {file.language ?? "file"} ·{" "}
                          {formatBytes(file.size_bytes)} · Updated{" "}
                          {formatRelative(file.updated_at)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </aside>

            <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
              {selectedFile ? (
                <>
                  <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FileCode2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <h3 className="truncate font-mono text-sm text-foreground">
                          {selectedFile.path}
                        </h3>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Saved {formatRelative(selectedFile.updated_at)} ·{" "}
                        {formatBytes(selectedFile.size_bytes)}
                      </p>
                    </div>
                    <span className="rounded-sm border border-border/70 bg-background/60 px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground">
                      {selectedFile.language ?? "file"}
                    </span>
                  </header>
                  <pre className="max-h-[70vh] overflow-auto bg-background px-4 py-4 font-mono text-xs leading-relaxed text-foreground">
                    <code>{selectedFile.content}</code>
                  </pre>
                </>
              ) : (
                <div className="flex min-h-64 items-center justify-center p-6 text-sm text-muted-foreground">
                  Select a file to view its code.
                </div>
              )}
            </section>
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

function toMobileFileDetail(file: FileListItem): MobileFileDetail {
  return {
    id: file.id,
    path: file.path,
    language: file.language,
    sizeLabel: formatBytes(file.size_bytes),
    updatedLabel: formatRelative(file.updated_at),
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

function fileHref(projectId: string, path: string): string {
  const params = new URLSearchParams({ file: path });
  return `/projects/${projectId}/files?${params.toString()}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
