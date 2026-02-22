'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Inspiration] Error:', error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
      <p className="text-muted-foreground text-sm max-w-md text-center">
        We encountered an error loading the Inspiration page. Please try again.
      </p>
      <Button onClick={reset} variant="secondary">
        Try again
      </Button>
    </div>
  )
}
