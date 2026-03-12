"use client"

import { useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

export default function CropAdvisorError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Crop Advisor error:", error)
  }, [error])

  return (
    <div className="max-w-6xl mx-auto">
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="p-3 rounded-full bg-destructive/10 mb-4">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <h2 className="text-lg font-display font-semibold text-foreground mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-md">
            The crop advisor encountered an error. This is usually temporary — try refreshing.
          </p>
          <Button onClick={reset}>Try Again</Button>
        </CardContent>
      </Card>
    </div>
  )
}
