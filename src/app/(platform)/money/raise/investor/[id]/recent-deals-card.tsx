'use client'

/**
 * @file recent-deals-card.tsx
 *
 * Summary of the firm's recent deal flow. Prefers prose from
 * `attributes.recent_deals_summary` / `attributes.recent_deals` (when string),
 * falls back to rendering an array of strings if `attributes.recent_deals`
 * looks like a list. When the JSONB shape is a list of objects with unknown
 * keys we skip — that's left for a follow-up structured renderer.
 *
 * Hidden entirely when no surface-able content is found.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Newspaper } from 'lucide-react'

export function RecentDealsCard({
  recentDealsSummary,
  recentDeals,
}: {
  recentDealsSummary: string | null | undefined
  recentDeals: unknown
}) {
  const prose =
    typeof recentDealsSummary === 'string' && recentDealsSummary.trim().length > 0
      ? recentDealsSummary
      : typeof recentDeals === 'string' && recentDeals.trim().length > 0
        ? recentDeals
        : null

  const stringList =
    !prose && Array.isArray(recentDeals)
      ? (recentDeals as unknown[]).filter(
          (d): d is string => typeof d === 'string' && d.trim().length > 0,
        )
      : []

  if (!prose && stringList.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-muted-foreground" aria-hidden />
          Recent deals
        </CardTitle>
      </CardHeader>
      <CardContent>
        {prose ? (
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{prose}</p>
        ) : (
          <ul className="space-y-1">
            {stringList.map((deal, i) => (
              <li key={i} className="text-sm text-foreground">
                · {deal}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
