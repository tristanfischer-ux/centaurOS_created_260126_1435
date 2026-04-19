/**
 * @file WorkspaceEmptyState — shown on /plan when the foundry has 0 strategic_goals.
 *
 * Copy per PLAN-MOCKUP-EMPTY-STATES.html (sage nudge). Flag-gated — only rendered
 * when `new_plan_experience` is ON (the caller handles the flag check).
 */

import Link from "next/link"
import { Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export function WorkspaceEmptyState() {
  return (
    <Card className="mx-auto max-w-xl border-dashed">
      <CardContent className="flex flex-col items-center py-10 text-center">
        <div className="mb-4 rounded-full bg-primary/10 p-3 text-primary">
          <Target className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-semibold tracking-tight">
          No Strategic Goal yet
        </h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Want me to draft a first one? A Strategic Goal gives the rest of the
          plan something to point at.
        </p>
        <Button asChild className="mt-6">
          <Link href="/plan/goal/new">Draft a first goal</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
