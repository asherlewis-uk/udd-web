import { Suspense } from "react"
import { LoginForm } from "@/components/auth/login-form"

export const metadata = {
  title: "Sign in — u did dat",
}

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="bg-gradient-to-r from-glass-purple to-glass-coral bg-clip-text text-transparent text-balance text-2xl font-semibold tracking-tight">Sign in to u did dat</h1>
        <p className="text-pretty text-sm text-glass-purple-muted/80">
          Your workspace for turning raw ideas into shippable code.
        </p>
      </div>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
