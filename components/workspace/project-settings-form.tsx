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
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { updateProjectDetails } from "@/app/actions/projects"
import type { Project } from "@/lib/types"

export function ProjectSettingsForm({ project }: { project: Project }) {
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description ?? "")
  const [idea, setIdea] = useState(project.idea ?? "")

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        await updateProjectDetails(project.id, {
          name,
          description: description.trim() ? description : null,
          idea: idea.trim() ? idea : null,
        })
        toast.success("Saved")
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save")
      }
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="p-name">Name</FieldLabel>
          <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field>
          <FieldLabel htmlFor="p-desc">Description</FieldLabel>
          <Input
            id="p-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One line summary"
          />
          <FieldDescription>Shown on the project card.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="p-idea">The idea</FieldLabel>
          <Textarea
            id="p-idea"
            rows={8}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Describe what you want to build..."
          />
          <FieldDescription>
            Seed context for AI tasks. Editable anytime — there is no history yet.
          </FieldDescription>
        </Field>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner className="mr-2" /> : null}
            Save changes
          </Button>
        </div>
      </FieldGroup>
    </form>
  )
}
