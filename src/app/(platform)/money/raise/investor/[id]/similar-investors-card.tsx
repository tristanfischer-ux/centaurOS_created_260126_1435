'use client'

/**
 * @file similar-investors-card.tsx
 *
 * Pro-tier intel: horizontally-scrolling list of firms similar to the one being
 * viewed, based on Jaccard similarity (sectors/stages/geo) computed server-side
 * by `getSimilarInvestors` in `src/actions/investors.ts`.
 */

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Sparkles, MapPin } from 'lucide-react'

export type SimilarInvestorEntry = {
  id: string
  title: string
  subcategory: string | null
  country: string | null
  similarity_score?: number | null
}

interface SimilarInvestorsCardProps {
  similar: SimilarInvestorEntry[]
}

export function SimilarInvestorsCard({ similar }: SimilarInvestorsCardProps) {
  const items = similar.slice(0, 8)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-international-orange" aria-hidden="true" />
          Similar investors
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No similar investors found for this firm.
          </p>
        ) : (
          <div
            className="flex gap-3 overflow-x-auto pb-2"
            role="list"
            aria-label="Similar investors"
          >
            {items.map((firm) => {
              const score =
                typeof firm.similarity_score === 'number'
                  ? Math.round(firm.similarity_score)
                  : null
              return (
                <Link
                  key={firm.id}
                  href={`/money/raise/investor/${firm.id}`}
                  role="listitem"
                  className="shrink-0 w-[200px] rounded-md border border-border bg-card p-3 space-y-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-international-orange"
                >
                  <p className="text-sm font-medium text-foreground line-clamp-2">
                    {firm.title}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {firm.subcategory && (
                      <Badge variant="outline" className="text-[10px] py-0">
                        {firm.subcategory}
                      </Badge>
                    )}
                    {score !== null && (
                      <Badge
                        variant="secondary"
                        className={`text-[10px] py-0 ${
                          score >= 70
                            ? 'text-success'
                            : score >= 40
                              ? 'text-warning'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {score}% match
                      </Badge>
                    )}
                  </div>
                  {firm.country && (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <MapPin className="h-2.5 w-2.5" aria-hidden="true" />
                      {firm.country}
                    </p>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
