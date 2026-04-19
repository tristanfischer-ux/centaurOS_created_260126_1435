/**
 * @file ReportEmptyState — shown on /plan/report when reports_sent count = 0.
 *
 * CTA routes to `/plan/report/new` (compose surface — stub until Chunk C lands).
 */

import Link from "next/link"
import { FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export function ReportEmptyState() {
  return (
    <Card className="mx-auto max-w-xl border-dashed">
      <CardContent className="flex flex-col items-center py-10 text-center">
        <div className="mb-4 rounded-full bg-primary/10 p-3 text-primary">
          <FileText className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3 className="text-lg font-semibold tracking-tight">
          No updates sent yet
        </h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Talk to Cal to draft your first weekly team update. Sent updates will
          live here.
        </p>
        <Button asChild className="mt-6">
          <Link href="/plan/report/new">Draft an update</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
