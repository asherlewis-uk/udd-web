import Link from "next/link"
import { AlertTriangle } from "lucide-react"

export const metadata = {
  title: "Authentication error — UDD",
}

export default function AuthErrorPage() {
  return (
    <div className="flex flex-col gap-6 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-destructive/40 bg-destructive/10">
        <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-balance text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-pretty text-sm text-muted-foreground">
          We could not complete that authentication request. It may have expired or already been
          used.
        </p>
      </div>
      <Link
        href="/auth/login"
        className="mx-auto text-sm text-foreground underline-offset-4 hover:underline"
      >
        Try signing in again
      </Link>
    </div>
  )
}
