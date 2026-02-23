"use client"

/**
 * @file redline-diff.tsx — Tracked-changes display for progressive stage enrichment.
 *
 * @description Shows side-by-side diffs where a later stage (Build or Review)
 * refined or corrected assumptions from an earlier stage (Concept or Build).
 * Old text appears with red strikethrough, new text in green — like tracked
 * changes in a document review.
 *
 * @related
 * - Build page: src/app/(platform)/the-forge/cad-lab/build/page.tsx
 * - Review page: src/app/(platform)/the-forge/cad-lab/review/page.tsx
 */

import { ArrowRight, GitCompareArrows } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

// ─── Types ────────────────────────────────────────────────────────────

export interface RedlineItem {
  /** Short label for the change, e.g. "Material", "Parts count" */
  label: string
  /** Original text from the earlier stage. Null if this is a new addition. */
  before: string | null
  /** Updated text from the current stage. Null if the item was removed. */
  after: string | null
}

interface RedlineDiffProps {
  /** Heading for the diff section, e.g. "Concept → Build" */
  fromStage: string
  toStage: string
  /** List of changes to display */
  items: RedlineItem[]
}

// ─── Component ───────────────────────────────────────────────────────

export function RedlineDiff({ fromStage, toStage, items }: RedlineDiffProps): React.ReactNode {
  if (items.length === 0) return null

  return (
    <Card className="border-international-orange/20">
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-international-orange" />
          <p className="text-xs font-semibold text-foreground">
            Changes: {fromStage} → {toStage}
          </p>
          <span className="text-xs text-muted-foreground">
            {items.length} refinement{items.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="flex items-start gap-3 text-xs rounded-md border border-muted p-2.5">
              {/* Label */}
              <span className="font-medium text-muted-foreground w-24 flex-shrink-0 pt-0.5">
                {item.label}
              </span>

              {/* Diff content */}
              <div className="flex items-start gap-2 min-w-0 flex-1">
                {item.before && (
                  <span className="text-destructive line-through opacity-60 break-words">
                    {item.before}
                  </span>
                )}
                {item.before && item.after && (
                  <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                )}
                {item.after && (
                  <span className="text-status-success font-medium break-words">
                    {item.after}
                  </span>
                )}
                {!item.before && item.after && (
                  <span className="text-status-success font-medium break-words">
                    + {item.after}
                  </span>
                )}
                {item.before && !item.after && (
                  <span className="text-destructive line-through opacity-60 break-words">
                    Removed
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
