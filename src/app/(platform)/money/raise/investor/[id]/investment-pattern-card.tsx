'use client'

/**
 * @file investment-pattern-card.tsx
 *
 * Summary of how the firm deploys capital — pulls `attributes.investment_pattern`
 * first. Falls back to a computed one-line summary from portfolio rows if
 * the prose field is empty (cadence + dominant sectors). Hidden when neither
 * is available.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity } from 'lucide-react'
import type { PortfolioCompanyRow } from '@/actions/money-raise'

function computePortfolioPattern(portfolio: PortfolioCompanyRow[]): string | null {
  if (portfolio.length === 0) return null

  // Count investments in last 12 months (by investment_date if present).
  const now = Date.now()
  const oneYearMs = 365 * 24 * 60 * 60 * 1000
  const lastYearCount = portfolio.filter((p) => {
    if (!p.investment_date) return false
    const t = Date.parse(p.investment_date)
    return Number.isFinite(t) && now - t <= oneYearMs
  }).length

  // Dominant sectors (top 3 by frequency).
  const sectorCounts = new Map<string, number>()
  for (const row of portfolio) {
    if (row.sector) {
      sectorCounts.set(row.sector, (sectorCounts.get(row.sector) ?? 0) + 1)
    }
  }
  const topSectors = Array.from(sectorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([sector]) => sector)

  // Median cheque for portfolio rows that have amount_usd.
  const amounts = portfolio
    .map((p) => p.amount_usd)
    .filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    .sort((a, b) => a - b)
  const medianCheque =
    amounts.length > 0
      ? amounts[Math.floor(amounts.length / 2)]
      : null

  const parts: string[] = []
  if (lastYearCount > 0) {
    parts.push(`${lastYearCount} investment${lastYearCount === 1 ? '' : 's'} in the last 12 months`)
  } else {
    parts.push(`${portfolio.length} disclosed investment${portfolio.length === 1 ? '' : 's'}`)
  }
  if (medianCheque != null) {
    parts.push(
      `median cheque ${new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(medianCheque)}`,
    )
  }
  if (topSectors.length > 0) {
    parts.push(`active in ${topSectors.join(', ')}`)
  }
  return parts.join(' · ')
}

export function InvestmentPatternCard({
  investmentPattern,
  portfolio,
}: {
  investmentPattern: string | null | undefined
  portfolio: PortfolioCompanyRow[]
}) {
  const prose =
    typeof investmentPattern === 'string' && investmentPattern.trim().length > 0
      ? investmentPattern
      : null
  const computed = prose ? null : computePortfolioPattern(portfolio)

  if (!prose && !computed) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" aria-hidden />
          Investment pattern
        </CardTitle>
      </CardHeader>
      <CardContent>
        {prose ? (
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{prose}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{computed}</p>
        )}
      </CardContent>
    </Card>
  )
}
