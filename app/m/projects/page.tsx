import { redirect } from "next/navigation"
import { MobileProjectsListScreen } from "@/components/mobile/projects-list-screen"
import { getSession } from "@/lib/auth-session"
import {
  getProjectsForOwner,
  getProfileDisplayName,
} from "@/lib/db/queries"
import { mapProjectList } from "@/lib/db/mappers"
import type { Project } from "@/lib/types"
import { toMobileProject } from "@/lib/mobile/mappers"

export const metadata = {
  title: "Projects — u did dat",
}

export default async function MobileProjectsPage() {
  const session = await getSession()
  if (!session) redirect("/auth/login")
  const user = session.user

  const [allProjectsRaw, displayName] = await Promise.all([
    getProjectsForOwner(user.id),
    getProfileDisplayName(user.id),
  ])

  const allProjects = mapProjectList(allProjectsRaw) as Project[]
  const mobileProjects = allProjects.map((p) => toMobileProject(p))

  return (
    <MobileProjectsListScreen
      projects={mobileProjects}
      profile={{
        email: user?.email ?? "",
        displayName: displayName,
      }}
    />
  )
}
