import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { CreateProjectForm } from "@/components/projects/create-project-form"

export const metadata = {
  title: "New project — UDD",
}

export default function NewProjectPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-5 py-8">
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
    </main>
  )
}
