import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowUpRight, Bot, FolderGit2, Play, Terminal } from "lucide-react"
import { Wordmark } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect("/projects")

  return (
    <div className="relative min-h-screen bg-background">
      <div className="udd-grid pointer-events-none absolute inset-0 opacity-[0.25]" aria-hidden />
      <div className="relative flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-6 py-5">
          <Wordmark />
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/auth/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/auth/sign-up">Get started</Link>
            </Button>
          </nav>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              Early access &middot; v0.1
            </div>
            <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
              The desktop for turning ideas into code.
            </h1>
            <p className="text-pretty mt-5 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              UDD is a personal, web-based dev workspace. Draft an idea, scaffold a project, let AI
              help you edit files, then run and ship — all from one calm surface.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/auth/sign-up">
                  Create your workspace
                  <ArrowUpRight className="ml-1 h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost">
                <Link href="/auth/login">I already have an account</Link>
              </Button>
            </div>
          </div>

          <section className="mx-auto mt-20 grid w-full max-w-4xl grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
            {[
              { icon: FolderGit2, label: "Projects", desc: "Organize every idea as a real repo." },
              { icon: Bot, label: "AI tasks", desc: "Scaffold, edit, refactor with guardrails." },
              { icon: Play, label: "Runtime", desc: "Preview in a sandbox without leaving UDD." },
              { icon: Terminal, label: "Logs", desc: "Readable build and runtime output." },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex flex-col gap-2 bg-card p-5">
                <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs leading-relaxed text-muted-foreground">{desc}</div>
              </div>
            ))}
          </section>
        </main>

        <footer className="flex items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <span>UDD &middot; Universal Dev Desktop</span>
          <span className="font-mono">single-user &middot; self-hosted-ready</span>
        </footer>
      </div>
    </div>
  )
}
