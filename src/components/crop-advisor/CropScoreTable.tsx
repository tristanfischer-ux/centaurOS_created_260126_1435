"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ChevronDown, ChevronUp, ArrowUpDown, Megaphone } from "lucide-react"
import { ScoreBreakdownBar } from "./ScoreBreakdownBar"
import type { CropScore } from "@/actions/crop-advisor"

interface CropScoreTableProps {
  scores: CropScore[]
}

type SortKey = "totalScore" | "productName" | "weeklyDemandKg" | "priceTrendPct" | "revenueProjection"

function getScoreBadgeVariant(score: number): "success" | "warning" | "destructive" | "secondary" {
  if (score >= 70) return "success"
  if (score >= 40) return "warning"
  if (score >= 20) return "destructive"
  return "secondary"
}

/**
 * Sortable table of products with composite scores and expandable breakdown bars.
 */
export function CropScoreTable({ scores }: CropScoreTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("totalScore")
  const [sortAsc, setSortAsc] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const sorted = [...scores].sort((a, b) => {
    const aVal = a[sortKey]
    const bVal = b[sortKey]
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    return sortAsc ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal)
  })

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />
    return sortAsc
      ? <ChevronUp className="h-3 w-3 ml-1" />
      : <ChevronDown className="h-3 w-3 ml-1" />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Crop Recommendations</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button onClick={() => handleSort("productName")} className="flex items-center text-xs font-medium">
                    Product <SortIcon column="productName" />
                  </button>
                </TableHead>
                <TableHead className="text-center">
                  <button onClick={() => handleSort("totalScore")} className="flex items-center text-xs font-medium mx-auto">
                    Score <SortIcon column="totalScore" />
                  </button>
                </TableHead>
                <TableHead className="hidden md:table-cell min-w-[200px]">Breakdown</TableHead>
                <TableHead className="text-right">
                  <button onClick={() => handleSort("weeklyDemandKg")} className="flex items-center text-xs font-medium ml-auto">
                    Demand <SortIcon column="weeklyDemandKg" />
                  </button>
                </TableHead>
                <TableHead className="text-right">
                  <button onClick={() => handleSort("priceTrendPct")} className="flex items-center text-xs font-medium ml-auto">
                    Trend <SortIcon column="priceTrendPct" />
                  </button>
                </TableHead>
                <TableHead className="text-right hidden lg:table-cell">
                  <button onClick={() => handleSort("revenueProjection")} className="flex items-center text-xs font-medium ml-auto">
                    Rev/wk <SortIcon column="revenueProjection" />
                  </button>
                </TableHead>
                <TableHead className="text-center hidden sm:table-cell">Intents</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((score) => (
                <TableRow
                  key={score.productId}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedRow(expandedRow === score.productId ? null : score.productId)}
                >
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm text-foreground">{score.productName}</p>
                      <p className="text-xs text-muted-foreground">{score.category}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={getScoreBadgeVariant(score.totalScore)}>
                      {score.totalScore}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <ScoreBreakdownBar
                      demandScore={score.demandScore}
                      priceTrendScore={score.priceTrendScore}
                      supplyGapScore={score.supplyGapScore}
                      capabilityScore={score.capabilityScore}
                    />
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {score.weeklyDemandKg > 0
                      ? `${score.weeklyDemandKg.toLocaleString()} kg/wk`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <span className={score.priceTrendPct >= 0 ? "text-success" : "text-destructive"}>
                      {score.priceTrendPct >= 0 ? "+" : ""}{score.priceTrendPct}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-sm hidden lg:table-cell">
                    {score.revenueProjection > 0
                      ? `£${score.revenueProjection.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-center hidden sm:table-cell">
                    {score.intentCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-international-orange">
                        <Megaphone className="h-3 w-3" />
                        <span className="text-xs font-medium">{score.intentCount}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No products found. Add products to start seeing recommendations.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
