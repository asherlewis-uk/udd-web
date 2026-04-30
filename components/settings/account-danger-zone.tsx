"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import { deleteAccount } from "@/app/actions/profile"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

export function AccountDangerZone() {
  const [pending, startTransition] = useTransition()

  function handleDeleteAccount() {
    startTransition(async () => {
      try {
        const result = await deleteAccount()
        if (result.success) {
          window.location.href = "/"
          return
        }

        toast.error(result.error ?? "Failed to delete account")
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to delete account",
        )
      }
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-5 shadow-[0_24px_80px_-56px_rgba(0,0,0,0.95)]">
        <div>
          <div className="text-sm font-medium">Delete account</div>
          <div className="mt-1 text-xs text-muted-foreground">
            This permanently deletes your account, all projects, files, and
            credentials. This cannot be undone.
          </div>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={pending}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete account</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes your account, all projects, files, and
                credentials. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleDeleteAccount}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  )
}
