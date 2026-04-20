'use client'

/**
 * @file team-expertise-card.tsx
 *
 * Pro-tier intel: synthesised summary of the team's expertise areas + a
 * breakdown of per-partner focus. Pulled from `attributes.team_expertise`
 * (Forge-Capital synthesised field) with a degraded fallback to partner
 * titles/seniority when the attribute is absent.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Award } from 'lucide-react'

export type TeamExpertisePartner = {
  name: string
  title: string | null
  focus_areas?: string[]
}

interface TeamExpertiseCardProps {
  /** Chips: free-form expertise tags extracted from attributes.team_expertise */
  expertise: string[] | null
  /** Partners with their focus areas (if available) */
  partners: TeamExpertisePartner[]
}

export function TeamExpertiseCard({ expertise, partners }: TeamExpertiseCardProps) {
  const chips = (expertise ?? []).slice(0, 20)
  const partnersWithFocus = partners.filter(
    (p) => p.focus_areas && p.focus_areas.length > 0,
  )
  const hasNothing = chips.length === 0 && partnersWithFocus.length === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Award className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Team expertise
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasNothing && partners.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No expertise signals captured for this firm&apos;s team.
          </p>
        )}

        {hasNothing && partners.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Team expertise data is being enriched. Check back later.
          </p>
        )}

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <Badge key={chip} variant="secondary" className="text-xs">
                {chip}
              </Badge>
            ))}
          </div>
        )}

        {partnersWithFocus.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Focus areas by partner
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Focus areas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partnersWithFocus.map((partner) => (
                    <TableRow key={`${partner.name}-${partner.title ?? ''}`}>
                      <TableCell className="font-medium">{partner.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {partner.title ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(partner.focus_areas ?? []).map((focus) => (
                            <Badge
                              key={focus}
                              variant="outline"
                              className="text-[10px] py-0"
                            >
                              {focus}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
