'use client'

/**
 * @file clear-demo-data-button.tsx
 * @description Settings card with a destructive button + confirmation dialog
 * to permanently remove all demo/seed data from the user's foundry.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
} from '@/components/ui/alert-dialog'
import { Trash2, Loader2, CheckCircle2 } from 'lucide-react'
import { clearDemoData } from '@/actions/onboarding'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

/**
 * ClearDemoDataButton — settings card that lets users remove all sample content
 * created during onboarding (demo objectives, tasks, listings, events).
 * Uses a confirmation AlertDialog to prevent accidental deletion.
 */
export function ClearDemoDataButton() {
  const router = useRouter()
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)

  async function handleClear() {
    setClearing(true)
    try {
      const result = await clearDemoData()
      if (result.success) {
        const total =
          result.cleared.objectives +
          result.cleared.tasks +
          result.cleared.listings +
          result.cleared.events
        toast.success(
          `Cleared ${total} demo items (${result.cleared.objectives} objectives, ${result.cleared.tasks} tasks)`
        )
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
      <CardHeader>
        <div className="flex items-center gap-2">
          <Trash2 className="h-5 w-5 text-destructive" />
          <CardTitle>Demo Data</CardTitle>
        </div>
        <CardDescription>
          Remove all sample data created during onboarding. This includes demo
          objectives, demo tasks, and sample marketplace listings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={clearing}>
              {clearing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear Demo Data
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all demo data?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete all demo objectives, tasks, marketplace
                listings, and activity events from your workspace. This action cannot
                be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClear}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Yes, clear demo data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
