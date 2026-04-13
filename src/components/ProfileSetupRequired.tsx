"use client"

import { useState } from "react"
import { Wrench, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { repairProfile } from "@/actions/onboarding"

/**
 * ProfileSetupRequired — Friendly recovery screen when a user's workspace
 * (foundry_id) is missing or invalid.
 *
 * @description Replaces the old dead-end "Profile Setup Incomplete" message
 * with a one-click repair flow. Shows a clear explanation and a button that
 * calls the `repairProfile` server action to create/assign a valid foundry.
 *
 * @component
 *
 * @example
 * if (!profile?.foundry_id) {
 *   return <ProfileSetupRequired userRole={profile?.role} />
 * }
 */
interface ProfileSetupRequiredProps {
  /** The user's role from their profile, if available */
  userRole?: string | null
}

export function ProfileSetupRequired({ userRole }: ProfileSetupRequiredProps) {
  const [isRepairing, setIsRepairing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  async function handleRepair(): Promise<void> {
    setIsRepairing(true)
    setError(null)

    try {
      const result = await repairProfile()

      if ("error" in result) {
        setError(result.error)
        setIsRepairing(false)
        return
      }

      // Show brief success state then reload so server components re-render
      setIsSuccess(true)
      setTimeout(() => {
        window.location.reload()
      }, 800)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong"
      setError(message)
      setIsRepairing(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-6">
        <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-status-success-light mx-auto">
          <CheckCircle2 className="h-7 w-7 text-status-success" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-foreground">All set!</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Your workspace has been created. Loading your page...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-6">
      <Card className="border shadow-sm bg-gradient-to-br from-background to-international-orange/[0.03]">
        <CardContent className="pt-8 pb-8 flex flex-col items-center gap-6">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-international-orange/10 mx-auto">
            <Wrench className="h-7 w-7 text-international-orange" />
          </div>

          <div className="space-y-2 max-w-md">
            <h1 className="text-xl font-bold text-foreground">
              Let&apos;s finish setting up your workspace
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              It looks like your workspace wasn&apos;t fully created during signup.
              No worries — we can fix this in one click.
            </p>
            {userRole && (
              <p className="text-xs text-muted-foreground">
                Setting up as: <span className="font-medium text-foreground">{userRole}</span>
              </p>
            )}
          </div>

          {error && (
            <Alert variant="destructive" className="max-w-md text-left">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error}
                <span className="block mt-1 text-xs">
                  If this persists, please contact{" "}
                  <a href="mailto:support@fractionalforge.app" className="underline">support@fractionalforge.app</a>
                </span>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-3 justify-center">
            <Button
              onClick={handleRepair}
              disabled={isRepairing}
              className="bg-international-orange hover:bg-international-orange/90 text-white"
            >
              {isRepairing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <Wrench className="h-4 w-4" />
                  Complete Setup
                </>
              )}
            </Button>
            <Button variant="outline" asChild>
              <a href="mailto:support@fractionalforge.app">Contact Support</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
