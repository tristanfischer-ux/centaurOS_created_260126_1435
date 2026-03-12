"use client"

import { useRef, useState } from "react"
import { Trash2, AlertTriangle, Loader2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { deleteMyAccount } from "@/actions/account"

interface AccountDangerZoneProps {
  userEmail: string
}

export function AccountDangerZone({ userEmail }: AccountDangerZoneProps) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blockers, setBlockers] = useState<
    Array<{ dataType: string; reason: string }> | null
  >(null)

  // SECURITY: Ref guard prevents double invocation from rapid clicks AND
  // provides synchronous read for stale-closure-prone callbacks
  // (onInteractOutside, onEscapeKeyDown, handleOpenChange).
  // React may not re-render between setIsDeleting(true) and the next
  // user interaction during the async gap — the ref is always current.
  const deletingRef = useRef(false)

  const isConfirmed = confirmText === "DELETE"

  async function handleDelete() {
    if (deletingRef.current) return
    deletingRef.current = true
    setIsDeleting(true)
    setError(null)
    setBlockers(null)

    try {
      const result = await deleteMyAccount()

      if (result.success) {
        // GOTCHA: After auth deletion the session cookie is invalid.
        // router.push does client-side navigation which may fail —
        // hard redirect ensures a clean page load and cookie clear.
        window.location.href = "/login"
        return
      }

      setError(result.error || "An unexpected error occurred.")
      if (result.blockers) setBlockers(result.blockers)
    } catch {
      // Network errors (offline, timeout) throw from the server action call.
      // Without this catch the dialog would be permanently stuck in loading state.
      setError("A network error occurred. Please check your connection and try again.")
    }

    setIsDeleting(false)
    deletingRef.current = false
  }

  function handleOpenChange(nextOpen: boolean) {
    // SECURITY: Use ref, not state — state may be stale during async gap
    if (deletingRef.current) return
    setOpen(nextOpen)
    if (!nextOpen) {
      setConfirmText("")
      setError(null)
      setBlockers(null)
    }
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-destructive/10 text-destructive">
            <Trash2 className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">Delete Account</CardTitle>
            <CardDescription className="mt-1">
              Permanently delete your account and all associated data. This action cannot be undone.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="text-sm text-muted-foreground space-y-1 mb-4 list-disc list-inside">
          <li>You will be removed from all foundries</li>
          <li>Your profile and personal data will be deleted</li>
          <li>Task assignments will be unlinked (tasks themselves are preserved)</li>
          <li>This cannot be undone</li>
        </ul>

        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button variant="destructive">Delete My Account</Button>
          </DialogTrigger>
          <DialogContent
            size="md"
            onInteractOutside={(e) => { if (deletingRef.current) e.preventDefault() }}
            onEscapeKeyDown={(e) => { if (deletingRef.current) e.preventDefault() }}
          >
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <DialogTitle>Delete your account?</DialogTitle>
              </div>
              <DialogDescription className="pt-2">
                This will permanently delete the account for <strong>{userEmail}</strong>.
                Your profile, memberships, and assignments will be removed. Tasks and foundries
                you belong to will not be deleted.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Type <strong>DELETE</strong> to confirm:
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                disabled={isDeleting}
                autoComplete="off"
                aria-label="Type DELETE to confirm account deletion"
              />
            </div>

            {error && (
              <div
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2"
                role="alert"
              >
                <p className="text-sm text-destructive">{error}</p>
                {blockers && blockers.length > 0 && (
                  <ul className="text-xs text-destructive/80 list-disc list-inside space-y-1">
                    {blockers.map((b) => (
                      <li key={b.dataType}>{b.reason}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="secondary"
                onClick={() => handleOpenChange(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={!isConfirmed || isDeleting}
              >
                {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Permanently Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
