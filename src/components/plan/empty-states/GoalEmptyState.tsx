/**
 * @file GoalEmptyState — shown on /plan/goal/[id] when the goal lookup returns null
 * (goal deleted, archived, or the id in the URL doesn't belong to the current foundry).
 */

import Link from "next/link"
import { Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export function GoalEmptyState() {
  return (
    <Card className="mx-auto max-w-xl border-dashed">
      <CardContent className="flex flex-col items-center py-10 text-center">
        <div className="mb-4 rounded-full bg-muted p-3 text-muted-foreground">
          <Target className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-semibold tracking-tight">
          This goal no longer exists
        </h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          It may have been archived or removed. The rest of Plan is still here.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/plan">Back to Plan</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
