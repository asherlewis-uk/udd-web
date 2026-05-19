import { SignUpForm } from "@/components/auth/sign-up-form"

export const metadata = {
  title: "Create account — u did dat",
}

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="bg-gradient-to-r from-glass-purple to-glass-coral bg-clip-text text-transparent text-balance text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-pretty text-sm text-glass-purple-muted/80">
          One account, all your projects. No collaborators, no noise.
        </p>
      </div>
      <SignUpForm />
    </div>
  )
}
