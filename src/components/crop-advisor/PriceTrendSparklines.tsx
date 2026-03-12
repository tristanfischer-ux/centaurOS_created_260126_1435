"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import type { CropScore } from "@/actions/crop-advisor"

interface PriceTrendSparklinesProps {
  scores: CropScore[]
}

/**
 * Mini trend indicators for the top 6 products showing price direction.
 */
export function PriceTrendSparklines({ scores }: PriceTrendSparklinesProps) {
  const top = scores.slice(0, 6)

  if (top.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Price Trends — Top Products</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {top.map((score) => {
            const isUp = score.priceTrendPct > 0.5
            const isDown = score.priceTrendPct < -0.5
            const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus

            return (
              <div
                key={score.productId}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
              >
                <div
                  className={`p-1.5 rounded-md ${
                    isUp
                      ? "bg-success/10 text-success"
                      : isDown
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {score.productName}
                  </p>
                  <p
                    className={`text-xs font-medium ${
                      isUp ? "text-success" : isDown ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {score.priceTrendPct >= 0 ? "+" : ""}
                    {score.priceTrendPct}%
                    {score.currentPricePerKg > 0 && (
                      <span className="text-muted-foreground ml-1">
                        · £{score.currentPricePerKg.toFixed(2)}/kg
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
