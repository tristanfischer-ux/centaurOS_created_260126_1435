"use client"

/**
 * @file project-rating-prompt.tsx
 *
 * @description Auto-surfaced rating nudge (Task H). When a manufacturing order
 * on this project has been marked `delivered`, prompt the founder to rate any
 * shortlisted supplier they haven't rated yet. Reuses the existing
 * `RatingDialog` from `supplier-enrichment-panel.tsx` so submit logic stays
 * in one place.
 *
 * No-op cases:
 *   - No delivered orders on the project → render nothing.
 *   - All shortlisted suppliers already rated for this project → render nothing.
 *
 * The prompt dismisses per-listing as each rating lands (the rated listing
 * disappears from the pending list). The prompt disappears when pendingCount
 * hits zero.
 */

import React, { useCallback, useEffect, useState } from "react"
import { Star, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { RatingDialog } from "@/components/cad/supplier-enrichment-panel"
import { getProjectRatingPromptStatus } from "@/actions/manufacturing-orders"

interface ShortlistedLite {
  id: string
  name: string
}

interface Props {
  projectId: string
  /** Shortlisted suppliers available to rate (ID + display name). */
  shortlistedSuppliers: ShortlistedLite[]
}

export function ProjectRatingPrompt({ projectId, shortlistedSuppliers }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [deliveredCount, setDeliveredCount] = useState(0)
  const [ratedIds, setRatedIds] = useState<Set<string>>(new Set())
  const [activeRatingFor, setActiveRatingFor] = useState<ShortlistedLite | null>(null)

  const refresh = useCallback(async () => {
    const res = await getProjectRatingPromptStatus(projectId)
    if ("error" in res) {
      // Silent — nudge-prompt should never block the page on a read error.
      setLoaded(true)
      return
    }
    setDeliveredCount(res.deliveredOrderCount)
    setRatedIds(new Set(res.ratedListingIds))
    setLoaded(true)
  }, [projectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!loaded || deliveredCount === 0) return null

  const pending = shortlistedSuppliers.filter((s) => !ratedIds.has(s.id))
  if (pending.length === 0) return null

  return (
    <>
      <Card className="p-4 space-y-3 border-success/40 bg-success/5">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-foreground">
              {deliveredCount === 1
                ? "Your order was delivered — rate the suppliers you used."
                : `${deliveredCount} orders delivered — rate the suppliers you used.`}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Ratings stay private to your foundry by default. You choose whether to contribute the aggregate to the marketplace.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {pending.map((s) => (
            <Button
              key={s.id}
              variant="secondary"
              size="sm"
              onClick={() => setActiveRatingFor(s)}
              className="gap-1.5"
            >
              <Star className="h-3 w-3" />
              Rate {s.name}
            </Button>
          ))}
        </div>
      </Card>

      {activeRatingFor && (
        <RatingDialog
          open={true}
          onOpenChange={(v) => { if (!v) setActiveRatingFor(null) }}
          listingId={activeRatingFor.id}
          supplierName={activeRatingFor.name}
          projectId={projectId}
          onRated={() => { void refresh() }}
        />
      )}
    </>
  )
}
