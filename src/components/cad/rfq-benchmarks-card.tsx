"use client"

/**
 * @file rfq-benchmarks-card.tsx — Category-level RFQ benchmarks from historical responses.
 *
 * @description Reads aggregated rfq_responses data to surface "typical quote"
 * ranges per category. Helps founders know whether their quote is in line.
 *
 * @related
 * - Action: src/actions/supplier-enrichment.ts::getRfqBenchmarks
 */

import React, { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BarChart3, Loader2 } from "lucide-react"
import { getRfqBenchmarks, type RFQBenchmark } from "@/actions/supplier-enrichment"

interface RFQBenchmarksCardProps {
  /** Optional category filter — e.g., pull only benchmarks relevant to this project */
  categories?: string[]
}

export function RFQBenchmarksCard({ categories }: RFQBenchmarksCardProps) {
  const [loading, setLoading] = useState(true)
  const [benchmarks, setBenchmarks] = useState<RFQBenchmark[] | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getRfqBenchmarks(categories).then((res) => {
      if (cancelled) return
      if ("error" in res) {
        setBenchmarks([])
      } else {
        setBenchmarks(res.benchmarks)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [categories])

  if (!loading && (!benchmarks || benchmarks.length === 0)) return null

  return (
    <Card className="border-border">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-international-orange" />
          <p className="text-sm font-semibold text-foreground">Typical quote ranges</p>
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">anonymised</Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Based on anonymised responses from other ForgeOS projects in the same categories. Use this to sanity-check incoming quotes.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-medium text-muted-foreground py-1.5">Category</th>
                  <th className="text-right font-medium text-muted-foreground py-1.5"># responses</th>
                  <th className="text-right font-medium text-muted-foreground py-1.5">Median £</th>
                  <th className="text-right font-medium text-muted-foreground py-1.5">Range £</th>
                  <th className="text-right font-medium text-muted-foreground py-1.5">Median wks</th>
                </tr>
              </thead>
              <tbody>
                {benchmarks!.map((b) => (
                  <tr key={b.category} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-1.5 text-foreground font-medium capitalize">{b.category}</td>
                    <td className="py-1.5 text-right text-muted-foreground font-mono">{b.responseCount}</td>
                    <td className="py-1.5 text-right text-foreground font-mono">{b.medianPriceGbp ? `£${Math.round(b.medianPriceGbp).toLocaleString()}` : "—"}</td>
                    <td className="py-1.5 text-right text-muted-foreground font-mono">
                      {b.minPriceGbp && b.maxPriceGbp
                        ? `£${Math.round(b.minPriceGbp).toLocaleString()}–£${Math.round(b.maxPriceGbp).toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="py-1.5 text-right text-muted-foreground font-mono">{b.medianTimelineWeeks ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
