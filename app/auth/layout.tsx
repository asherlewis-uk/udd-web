import Link from "next/link"
import { Wordmark } from "@/components/brand"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background">
      <div className="pointer-events-none absolute inset-0 bg-radial-[at_50%_0%] from-glass-purple/8 via-transparent to-transparent" aria-hidden />
      <div className="relative flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-6 py-5">
          <Link href="/" aria-label="u did dat home">
            <Wordmark />
          </Link>
          <Link
            href="/"
            className="text-xs text-glass-purple-muted underline-offset-4 hover:text-glass-purple hover:underline"
          >
            Back to home
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm">{children}</div>
        </main>
        <footer className="px-6 py-6 text-center text-xs text-glass-purple-muted/60">
          u did dat
        </footer>
      </div>
    </div>
  )
}
