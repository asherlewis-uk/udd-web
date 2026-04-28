import Link from "next/link";
import { FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileFileDetail = {
  id: string;
  path: string;
  language: string | null;
  sizeLabel: string;
  updatedLabel: string;
  content?: string;
};

export function MobileFilesScreen({
  projectId,
  files,
  selectedFile,
}: {
  projectId: string;
  files: MobileFileDetail[];
  selectedFile: MobileFileDetail | null;
}) {
  if (files.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center py-16 text-center">
        <div className="flex max-w-xs flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary/80 text-muted-foreground">
            <FileCode2 className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">
              No files yet
            </h2>
            <p className="text-sm text-muted-foreground">
              Generate or repair a project to create saved files.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-4 pb-6">
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span className="uppercase tracking-wide">Files</span>
          <span>
            {files.length} file{files.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-3xl bg-secondary/65 p-1">
          {files.map((file) => {
            const active = file.path === selectedFile?.path;
            return (
              <Link
                key={file.id}
                href={fileHref(projectId, file.path)}
                scroll={false}
                className={cn(
                  "flex items-center gap-3 rounded-[1.35rem] px-3 py-3 transition active:scale-[0.99]",
                  active ? "bg-background/70" : "hover:bg-background/35",
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-background/65 text-muted-foreground">
                  <FileCode2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-sm text-foreground">
                    {file.path}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {file.language ?? "file"} · {file.sizeLabel} ·{" "}
                    {file.updatedLabel}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="min-h-0 overflow-hidden rounded-3xl border border-border/60 bg-[oklch(0.12_0_0)]">
        {selectedFile?.content !== undefined ? (
          <>
            <div className="border-b border-border/50 px-4 py-3">
              <div className="truncate font-mono text-sm text-foreground">
                {selectedFile.path}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {selectedFile.language ?? "file"} · {selectedFile.sizeLabel}
              </div>
            </div>
            <pre className="max-h-[48dvh] overflow-auto px-4 py-4 font-mono text-[12px] leading-relaxed text-foreground/90">
              <code>{selectedFile.content}</code>
            </pre>
          </>
        ) : (
          <div className="flex min-h-40 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Select a file to view its code.
          </div>
        )}
      </section>
    </div>
  );
}

function fileHref(projectId: string, path: string): string {
  const params = new URLSearchParams({ file: path });
  return `/projects/${projectId}/files?${params.toString()}`;
}
