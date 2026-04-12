'use client'

/**
 * @file clear-demo-data-button.tsx
 * @description Button to clear all demo/seed data from the user's workspace.
 * Visible in Settings when demo data exists.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Trash2, Loader2, CheckCircle2 } from 'lucide-react'
import { clearDemoData } from '@/actions/onboarding'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

export function ClearDemoDataButton() {
  const router = useRouter()
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)

  async function handleClear() {
    if (!confirm('This will permanently remove all demo objectives, tasks, listings, and activity events from your workspace. This cannot be undone.')) {
      return
    }

    setClearing(true)
    try {
      const result = await clearDemoData()
      if (result.success) {
        const total = result.cleared.objectives + result.cleared.tasks + result.cleared.listings + result.cleared.events
        toast.success(`Cleared ${total} demo items (${result.cleared.objectives} objectives, ${result.cleared.tasks} tasks)`)
        setCleared(true)
        router.refresh()
      } else {
        toast.error(result.error ?? 'Failed to clear demo data')
      }
    } catch {
      toast.error('Failed to clear demo data')
    } finally {
      setClearing(false)
    }
  }

  if (cleared) {
    return (
      <Card className="border-success/20 bg-success/5">
        <CardContent className="py-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Demo data cleared</p>
            <p className="text-xs text-muted-foreground">Your workspace is clean.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">Clear Demo Data</p>
          <p className="text-xs text-muted-foreground">
            Remove all demo objectives, tasks, and sample listings that were created when you signed up.
          </p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={handleClear}
          disabled={clearing}
          className="shrink-0"
        >
          {clearing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              Clearing...
            </>
          ) : (
            <>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Clear Demo Data
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
