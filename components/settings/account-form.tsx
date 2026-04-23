"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { updateDisplayName } from "@/app/actions/profile"

export function AccountForm({
  email,
  initialDisplayName,
}: {
  email: string
  initialDisplayName: string
}) {
  const [pending, startTransition] = useTransition()
  const [displayName, setDisplayName] = useState(initialDisplayName)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        await updateDisplayName(displayName)
        toast.success("Profile updated")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input id="email" value={email} disabled />
          <FieldDescription>Tied to your account. Not editable from here.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="displayName">Display name</FieldLabel>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="How you want to be referred to"
          />
        </Field>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner className="mr-2" /> : null}
            Save
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}
