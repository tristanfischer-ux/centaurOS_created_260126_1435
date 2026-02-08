"use client"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { Timer, TrendingUp, PiggyBank, ArrowUpRight, CalendarCheck } from "lucide-react"

import type { SummaryMetrics } from "./types"

interface SummaryCardsProps {
  metrics: SummaryMetrics
}

/**
 * Summary stat cards showing key Cost of Delay metrics.
 *
 * @description Displays the five most important numbers at a glance:
 * cost of delay per month, months saved, 12-month savings, ROI, and break-even.
 */
export function SummaryCards({ metrics }: SummaryCardsProps) {
  const formatCurrency = (value: number): string => {
    const abs = Math.abs(value)
    if (abs >= 1_000_000) return `${value < 0 ? "-" : ""}$${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000) return `${value < 0 ? "-" : ""}$${(abs / 1_000).toFixed(0)}k`
    return `${value < 0 ? "-" : ""}$${abs.toFixed(0)}`
  }

  const cards = [
    {
      label: "Cost of Delay / month",
      value: formatCurrency(metrics.costOfDelayPerMonth),
      description: "Every month you delay costs this much",
      icon: Timer,
      accent: "text-international-orange",
      accentBg: "bg-international-orange/10",
    },
    {
      label: "Months Saved",
      value: `${metrics.monthsSaved}`,
      description: "Faster time to revenue",
      icon: CalendarCheck,
      accent: "text-status-success",
      accentBg: "bg-status-success-light",
    },
    {
      label: "Net Savings at 12 Months",
      value: formatCurrency(metrics.savingsAt12Months),
      description: "Cumulative advantage after one year",
      icon: PiggyBank,
      accent: metrics.savingsAt12Months >= 0 ? "text-status-success" : "text-destructive",
      accentBg: metrics.savingsAt12Months >= 0 ? "bg-status-success-light" : "bg-status-error-light",
    },
    {
      label: "Acceleration ROI",
      value: `${metrics.accelerationROI >= 0 ? "+" : ""}${metrics.accelerationROI.toFixed(0)}%`,
      description: "Return on the acceleration investment",
      icon: TrendingUp,
      accent: metrics.accelerationROI >= 0 ? "text-status-success" : "text-destructive",
      accentBg: metrics.accelerationROI >= 0 ? "bg-status-success-light" : "bg-status-error-light",
    },
    {
      label: "Break-even",
      value: metrics.breakEvenMonths === Infinity ? "N/A" : `${metrics.breakEvenMonths} mo`,
      description: "When the investment pays for itself",
      icon: ArrowUpRight,
      accent: "text-electric-blue",
      accentBg: "bg-electric-blue-light",
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Card key={card.label} className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className={cn("flex items-center justify-center h-8 w-8 rounded-full", card.accentBg)}>
                <Icon className={cn("h-4 w-4", card.accent)} />
              </div>
            </div>
            <p className={cn("text-2xl font-bold tracking-tight", card.accent)}>
              {card.value}
            </p>
            <p className="text-xs font-medium text-foreground mt-1">{card.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
          </Card>
        )
      })}
    </div>
  )
}
