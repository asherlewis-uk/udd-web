import { SignUpForm } from "@/components/auth/sign-up-form"

export const metadata = {
  title: "Create account — UDD",
}

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-balance text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-pretty text-sm text-muted-foreground">
          One account, all your projects. No collaborators, no noise.
        </p>
      </div>
      <SignUpForm />
    </div>
  )
}
