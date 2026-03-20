/**
 * @file SimilarInvestorsSection.tsx
 *
 * @description Horizontal scroll of 3-5 compact cards showing investors similar
 * to the one being viewed. Uses Jaccard similarity on sectors, stages, and geo.
 */

'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MapPin } from 'lucide-react'
import type { InvestorFirm } from '@/actions/investors'

interface SimilarInvestorsSectionProps {
  firms: InvestorFirm[]
  matchScores?: Record<string, number>
}

export function SimilarInvestorsSection({ firms, matchScores }: SimilarInvestorsSectionProps) {
  if (firms.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Investors Like This</h3>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {firms.map(firm => {
          const score = matchScores?.[firm.id]
          return (
            <Link key={firm.id} href={`/investors/${firm.id}`} className="shrink-0">
              <Card className="w-[200px] hover:-translate-y-0.5 transition-all duration-200">
                <CardContent className="p-3 space-y-2">
                  <p className="text-sm font-medium text-foreground line-clamp-1">{firm.title}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {firm.attributes.firm_type && (
                      <Badge variant="outline" className="text-[10px] py-0">{firm.attributes.firm_type}</Badge>
                    )}
                    {score != null && (
                      <Badge
                        variant="secondary"
                        className={`text-[10px] py-0 ${score >= 70 ? 'text-success' : score >= 40 ? 'text-warning' : ''}`}
                      >
                        {score}%
                      </Badge>
                    )}
                  </div>
                  {firm.attributes.hq_city && (
                    <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <MapPin className="h-2.5 w-2.5" />
                      {firm.attributes.hq_city}
                    </p>
                  )}
                  {firm.attributes.fund_size_gbp != null && (
                    <p className="text-[10px] text-muted-foreground">
                      Fund: £{(firm.attributes.fund_size_gbp / 1_000_000).toFixed(0)}M
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
