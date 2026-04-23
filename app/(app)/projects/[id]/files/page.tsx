import { FolderTree } from "lucide-react"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { WorkspaceContainer, SectionHeading } from "@/components/workspace/workspace-container"
import { createClient } from "@/lib/supabase/server"
import { formatRelative } from "@/lib/slug"

export default async function FilesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from("project_files")
    .select("id, path, language, size_bytes, updated_at")
    .eq("project_id", id)
    .order("path")

  const files = data ?? []

  return (
    <WorkspaceContainer>
      <SectionHeading
        title="Files"
        description="The source of truth for this project. AI and runtime will read from here."
      />

      {files.length === 0 ? (
        <Empty className="border border-dashed border-border bg-card/40">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderTree className="h-5 w-5" />
            </EmptyMedia>
            <EmptyTitle>No files yet</EmptyTitle>
            <EmptyDescription>
              Submit a prompt in the AI tab — generated files land here. This tab is read-only.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Path</th>
                <th className="px-4 py-2.5 text-left font-medium">Language</th>
                <th className="px-4 py-2.5 text-right font-medium">Size</th>
                <th className="px-4 py-2.5 text-right font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {files.map((f) => (
                <tr key={f.id} className="bg-background hover:bg-card/60">
                  <td className="px-4 py-2.5 font-mono text-xs">{f.path}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {f.language ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                    {f.size_bytes.toLocaleString()} B
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                    {formatRelative(f.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WorkspaceContainer>
  )
}
