"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Megaphone, Calendar, Weight, PoundSterling, MessageCircle } from "lucide-react"
import { IntentResponseDialog } from "./IntentResponseDialog"
import type { BuyerIntent } from "@/actions/crop-advisor"

interface BuyerIntentFeedProps {
  intents: BuyerIntent[]
  onResponded?: () => void
}

/**
 * Card feed of active buyer intent signals visible to growers.
 */
export function BuyerIntentFeed({ intents, onResponded }: BuyerIntentFeedProps) {
  const [respondingTo, setRespondingTo] = useState<BuyerIntent | null>(null)

  if (intents.length === 0) {
    return (
      <EmptyState
        icon={<Megaphone className="h-10 w-10" />}
        title="No active demand signals"
        description="When buyers post what they need, their signals will appear here. Check back soon."
      />
    )
  }

  return (
    <>
      <div className="space-y-4">
        {intents.map((intent) => (
          <Card
            key={intent.id}
            className="hover:-translate-y-0.5 active:scale-[0.99] duration-200 transition-transform"
          >
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-foreground">
                      {intent.product_name || "Unknown Product"}
                    </h3>
                    <Badge variant="secondary">{intent.category}</Badge>
                    {intent.quality_grade && (
                      <Badge variant="secondary">Grade {intent.quality_grade}</Badge>
                    )}
                    {intent.growing_method && (
                      <Badge variant="secondary">{intent.growing_method}</Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Weight className="h-3.5 w-3.5" />
                      {intent.weekly_quantity_kg} kg/week
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(intent.desired_start_date).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                      {intent.desired_end_date && (
                        <> – {new Date(intent.desired_end_date).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}</>
                      )}
                    </span>
                    {intent.target_price_per_kg != null && (
                      <span className="flex items-center gap-1">
                        <PoundSterling className="h-3.5 w-3.5" />
                        Target: £{Number(intent.target_price_per_kg).toFixed(2)}/kg
                      </span>
                    )}
                    {intent.max_price_per_kg != null && (
                      <span className="text-xs">(max £{Number(intent.max_price_per_kg).toFixed(2)})</span>
                    )}
                  </div>

                  {intent.notes && (
                    <p className="text-sm text-muted-foreground">{intent.notes}</p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Posted by {intent.poster_name} ·{" "}
                    {new Date(intent.created_at).toLocaleDateString("en-GB")}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  {intent.response_count > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageCircle className="h-3 w-3" />
                      {intent.response_count} response{intent.response_count !== 1 ? "s" : ""}
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRespondingTo(intent)
                    }}
                  >
                    Respond
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {respondingTo && (
        <IntentResponseDialog
          intent={respondingTo}
          open={true}
          onOpenChange={(open) => {
            if (!open) setRespondingTo(null)
          }}
          onSubmitted={() => {
            setRespondingTo(null)
            onResponded?.()
          }}
        />
      )}
    </>
  )
}
