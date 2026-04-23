import { Suspense } from "react"
import { LoginForm } from "@/components/auth/login-form"

export const metadata = {
  title: "Sign in — UDD",
}

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-balance text-2xl font-semibold tracking-tight">Sign in to UDD</h1>
        <p className="text-pretty text-sm text-muted-foreground">
          Your workspace for turning raw ideas into shippable code.
        </p>
      </div>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
