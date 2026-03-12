"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar, Weight, PoundSterling, MessageCircle, X } from "lucide-react"
import type { BuyerIntent } from "@/actions/crop-advisor"

interface IntentCardProps {
  intent: BuyerIntent
  onWithdraw?: (intentId: string) => void
  onViewResponses?: (intent: BuyerIntent) => void
  isWithdrawing?: boolean
}

function getStatusVariant(status: string): "success" | "warning" | "destructive" | "secondary" {
  switch (status) {
    case "active": return "success"
    case "fulfilled": return "success"
    case "withdrawn": return "secondary"
    case "expired": return "destructive"
    default: return "secondary"
  }
}

/**
 * Single intent card used in the buyer's intent management view.
 */
export function IntentCard({ intent, onWithdraw, onViewResponses, isWithdrawing }: IntentCardProps) {
  return (
    <Card className="hover:-translate-y-0.5 active:scale-[0.99] duration-200 transition-transform">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-foreground">
                {intent.product_name || "Unknown Product"}
              </h3>
              <Badge variant={getStatusVariant(intent.status)}>
                {intent.status}
              </Badge>
              <Badge variant="secondary">{intent.category}</Badge>
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Weight className="h-3.5 w-3.5" />
                {intent.weekly_quantity_kg} kg/week
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                From {new Date(intent.desired_start_date).toLocaleDateString("en-GB", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </span>
              {intent.target_price_per_kg != null && (
                <span className="flex items-center gap-1">
                  <PoundSterling className="h-3.5 w-3.5" />
                  £{Number(intent.target_price_per_kg).toFixed(2)}/kg
                </span>
              )}
            </div>

            {intent.notes && (
              <p className="text-sm text-muted-foreground line-clamp-2">{intent.notes}</p>
            )}

            <p className="text-xs text-muted-foreground">
              Created {new Date(intent.created_at).toLocaleDateString("en-GB")}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {intent.response_count > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onViewResponses?.(intent)}
              >
                <MessageCircle className="h-3.5 w-3.5 mr-1" />
                {intent.response_count} response{intent.response_count !== 1 ? "s" : ""}
              </Button>
            )}
            {intent.status === "active" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onWithdraw?.(intent.id)}
                disabled={isWithdrawing}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Withdraw
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
