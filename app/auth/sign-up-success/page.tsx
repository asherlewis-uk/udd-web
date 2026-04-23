import Link from "next/link"
import { Mail } from "lucide-react"

export const metadata = {
  title: "Check your email — UDD",
}

export default function SignUpSuccessPage() {
  return (
    <div className="flex flex-col gap-6 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-border bg-card">
        <Mail className="h-5 w-5 text-muted-foreground" aria-hidden />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-balance text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-pretty text-sm text-muted-foreground">
          We sent you a confirmation link. Click it to finish setting up your account, then come
          back and sign in.
        </p>
      </div>
      <Link
        href="/auth/login"
        className="mx-auto text-sm text-foreground underline-offset-4 hover:underline"
      >
        Back to sign in
      </Link>
    </div>
  )
}
