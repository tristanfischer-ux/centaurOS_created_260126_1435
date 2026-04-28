/**
 * @file HistoryEmptyState — shown on /plan/history when history_entries count = 0.
 *
 * No CTA — history_entries are written automatically by Plan server actions, so
 * the user doesn't need to do anything to make entries appear.
 */

import { Inbox } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export function HistoryEmptyState() {
  return (
    <Card className="mx-auto max-w-xl border-dashed">
      <CardContent className="flex flex-col items-center py-10 text-center">
        <div className="mb-4 rounded-full bg-muted p-3 text-muted-foreground">
          <Inbox className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-semibold tracking-tight">
          Nothing recorded yet
        </h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Every decision you make here is logged automatically. Pin a goal, run
          a pressure test, or send an update — it will show up here.
        </p>
      </CardContent>
    </Card>
  )
}
