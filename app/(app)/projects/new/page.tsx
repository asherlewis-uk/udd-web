import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { CreateProjectForm } from "@/components/projects/create-project-form"
import { MobileNewProjectScreen } from "@/components/mobile/new-project-screen"
import { WorkspaceContainer } from "@/components/workspace/workspace-container"

export const metadata = {
  title: "New project — u did dat",
}

export default function NewProjectPage() {
  return (
    <>
      <div className="md:hidden">
        <MobileNewProjectScreen />
      </div>

      <WorkspaceContainer className="hidden max-w-2xl md:flex">
        <div>
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Projects
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">New project</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Give it a name and outline the idea. You can fill everything else in later.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6">
          <CreateProjectForm />
        </div>
      </WorkspaceContainer>
    </>
  )
}
