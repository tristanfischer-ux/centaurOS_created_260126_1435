"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, ShoppingCart, BarChart3 } from "lucide-react"
import type { CropScore } from "@/actions/crop-advisor"

interface RevenueProjectionCardsProps {
  scores: CropScore[]
}

/**
 * Three KPI cards showing headline metrics from the scoring engine:
 * top-scoring crop, total unmet demand, and average price trend.
 */
export function RevenueProjectionCards({ scores }: RevenueProjectionCardsProps) {
  const topCrop = scores[0]

  const totalUnmetDemandKg = scores.reduce((sum, s) => {
    const gap = s.weeklyDemandKg - s.weeklySupplyKg
    return sum + Math.max(0, gap)
  }, 0)

  const avgTrend = scores.length > 0
    ? scores.reduce((sum, s) => sum + s.priceTrendPct, 0) / scores.length
    : 0

  const cards = [
    {
      title: "Top Opportunity",
      value: topCrop?.productName || "—",
      subtitle: topCrop ? `Score: ${topCrop.totalScore}/100` : "No data yet",
      icon: TrendingUp,
      iconBg: "bg-international-orange/10",
      iconColor: "text-international-orange",
    },
    {
      title: "Unmet Weekly Demand",
      value: `${Math.round(totalUnmetDemandKg).toLocaleString()} kg`,
      subtitle: "Across all products",
      icon: ShoppingCart,
      iconBg: "bg-info/10",
      iconColor: "text-info",
    },
    {
      title: "Avg Price Trend",
      value: `${avgTrend >= 0 ? "+" : ""}${avgTrend.toFixed(1)}%`,
      subtitle: "Last 4 weeks vs prior 4",
      icon: BarChart3,
      iconBg: avgTrend >= 0 ? "bg-success/10" : "bg-destructive/10",
      iconColor: avgTrend >= 0 ? "text-success" : "text-destructive",
    },
  ]

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card) => (
        <Card key={card.title} className="hover:-translate-y-0.5 active:scale-[0.99] duration-200 transition-transform">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-lg ${card.iconBg}`}>
                <card.icon className={`h-4 w-4 ${card.iconColor}`} />
              </div>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-display font-semibold text-foreground">
              {card.value}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
