import { notFound } from "next/navigation"
import { MobileRouteShell } from "@/components/mobile/mobile-route-shell"
import {
  MobileFilesScreen,
  type MobileFileDetail,
} from "@/components/mobile/files-screen"
import { getSession } from "@/lib/auth-session"
import {
  getProjectByIdAndOwner,
  getProjectsForOwner,
  getProfileDisplayName,
  getRunSessionsForProject,
  countProjectFiles,
  getProjectFilesForProject,
  getProjectFileByPath,
} from "@/lib/db/queries"
import {
  mapProject,
  mapProjectList,
  mapRunSession,
  mapProjectFile,
} from "@/lib/db/mappers"
import type { Project } from "@/lib/types"
import { toMobileProject, toMobileRunSession } from "@/lib/mobile/mappers"

type FileListItem = {
  id: string
  path: string
  language: string | null
  size_bytes: number
  updated_at: string
}

type SelectedFile = FileListItem & {
  content: string
}

export default async function MobileFilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ file?: string }>
}) {
  const { id } = await params
  const { file: requestedFile } = await searchParams

  const session = await getSession()
  if (!session) notFound()
  const user = session.user

  const [projectRaw, allProjectsRaw, displayName, latestRun] = await Promise.all([
    getProjectByIdAndOwner(id, user.id),
    getProjectsForOwner(user.id, { limit: 30 }),
    getProfileDisplayName(user.id),
    getRunSessionsForProject(id, user.id, { limit: 1 }),
  ])
  if (!projectRaw) notFound()

  const project = mapProject(projectRaw) as Project
  const allProjects = mapProjectList(allProjectsRaw) as Project[]

  const fileRows = await getProjectFilesForProject(id, user.id, { orderByPath: true })
  const fileList = fileRows.map((f) => ({
    id: f.id,
    path: f.path,
    language: f.language,
    size_bytes: f.sizeBytes,
    updated_at: f.updatedAt.toISOString(),
  }))

  const selectedPath =
    fileList.find((file) => file.path === requestedFile)?.path ??
    fileList[0]?.path ??
    null

  let selectedFile: SelectedFile | null = null
  if (selectedPath) {
    const row = await getProjectFileByPath(id, user.id, selectedPath)
    if (row) {
      const mapped = mapProjectFile(row)
      selectedFile = {
        id: mapped.id,
        path: mapped.path,
        language: mapped.language,
        size_bytes: mapped.size_bytes,
        updated_at: mapped.updated_at,
        content: mapped.content,
      }
    }
  }

  const mobileProject = toMobileProject(project, id)
  const mobileProjects = allProjects.map((item) => toMobileProject(item, id))
  const mobileFiles = fileList.map(toMobileFileDetail)
  const mobileSelectedFile = selectedFile
    ? { ...toMobileFileDetail(selectedFile), content: selectedFile.content }
    : null
  const mobileRunSession = latestRun[0]
    ? toMobileRunSession(mapRunSession(latestRun[0]))
    : null

  return (
    <MobileRouteShell
      project={mobileProject}
      projects={mobileProjects}
      profile={{
        email: user.email ?? "",
        displayName: displayName,
      }}
      runSession={mobileRunSession}
      filesCount={fileList.length}
      title="View code"
      subtitle={project.name}
      chatHref={`/projects/${id}`}
    >
      <MobileFilesScreen
        projectId={id}
        files={mobileFiles}
        selectedFile={mobileSelectedFile}
      />
    </MobileRouteShell>
  )
}

function toMobileFileDetail(file: FileListItem): MobileFileDetail {
  return {
    id: file.id,
    path: file.path,
    language: file.language,
    sizeLabel: formatBytes(file.size_bytes),
    updatedLabel: formatRelative(file.updated_at),
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return "just now"
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}
