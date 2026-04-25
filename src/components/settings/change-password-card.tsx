/**
 * @file change-password-card.tsx
 *
 * @description A card that lets the user request a password-reset email.
 * Supabase Auth handles the reset flow via email link — no password is
 * entered or stored here. The card sends one email and shows confirmation.
 *
 * Kept intentionally simple: one button, one state, one result.
 */

"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { KeyRound, CheckCircle2, Loader2 } from "lucide-react"

interface ChangePasswordCardProps {
  userEmail: string
}

export function ChangePasswordCard({ userEmail }: ChangePasswordCardProps) {
  const [sent, setSent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSendResetEmail() {
    setIsLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.resetPasswordForEmail(
        userEmail,
        { redirectTo: `${window.location.origin}/auth/callback?next=/settings/account` }
      )
      if (authError) {
        setError("Could not send the reset link. Please try again.")
      } else {
        setSent(true)
      }
    } catch {
      setError("Could not send the reset link. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Password</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Reset link sent</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Check {userEmail} for a link to set a new password. It expires in 1 hour.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              We send a one-time link to your email address. Click it to set a new password.
              No need to know your current one.
            </p>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSendResetEmail}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                  Sending
                </>
              ) : (
                "Send reset link"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
