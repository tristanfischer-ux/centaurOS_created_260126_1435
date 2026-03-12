"use client"

import { useMemo } from "react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { CropScore } from "@/actions/crop-advisor"

interface DemandSupplyChartProps {
  scores: CropScore[]
}

/**
 * Grouped bar chart comparing weekly demand vs supply by product category.
 */
export function DemandSupplyChart({ scores }: DemandSupplyChartProps) {
  const chartData = useMemo(() => {
    // Aggregate by category
    const categoryMap = new Map<string, { demand: number; supply: number }>()

    for (const score of scores) {
      const existing = categoryMap.get(score.category) || { demand: 0, supply: 0 }
      existing.demand += score.weeklyDemandKg
      existing.supply += score.weeklySupplyKg
      categoryMap.set(score.category, existing)
    }

    return Array.from(categoryMap.entries())
      .map(([category, { demand, supply }]) => ({
        category,
        demand: Math.round(demand),
        supply: Math.round(supply),
      }))
      .sort((a, b) => b.demand - a.demand)
      .slice(0, 10) // Top 10 categories
  }, [scores])

  if (chartData.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Demand vs Supply by Category</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                interval={0}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                tickFormatter={(v: number) => `${v}kg`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: 12,
                }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(value: any, name: any) => [
                  `${Number(value ?? 0).toLocaleString()} kg/wk`,
                  name === "demand" ? "Demand" : "Supply",
                ]}
              />
              <Legend
                formatter={(value: string) => (
                  <span className="text-xs text-muted-foreground">
                    {value === "demand" ? "Demand" : "Supply"}
                  </span>
                )}
              />
              <Bar dataKey="demand" fill="hsl(var(--international-orange))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="supply" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
