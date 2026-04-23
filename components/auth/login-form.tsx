"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel, FieldGroup, FieldDescription, FieldError } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const redirectTo = search.get("redirect") ?? "/projects"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError
      router.push(redirectTo)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@domain.com"
          />
        </Field>
        <Field>
          <div className="flex items-baseline justify-between">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Link
              href="/auth/sign-up"
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              No account? Sign up
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <FieldDescription>Minimum 8 characters.</FieldDescription>
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
        <Button type="submit" disabled={loading} className="mt-2">
          {loading ? <Spinner className="mr-2" /> : null}
          Sign in
        </Button>
      </FieldGroup>
    </form>
  )
}
