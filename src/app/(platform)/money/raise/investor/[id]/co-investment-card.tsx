'use client'

/**
 * @file co-investment-card.tsx
 *
 * Pro-tier intel: lists firms that share portfolio companies with the current
 * investor. Data comes from the `get_co_investors` RPC (aggregated portfolio
 * overlap), reused via `getCoInvestors` in `src/actions/investors.ts`.
 */

import Link from 'next/link'
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Users } from 'lucide-react'

export type CoInvestorEntry = {
  firm_id: string
  firm_title: string
  shared_portfolio_count: number
  shared_portfolio_sample: string[]
}

interface CoInvestmentCardProps {
  coInvestors: CoInvestorEntry[]
}

export function CoInvestmentCard({ coInvestors }: CoInvestmentCardProps) {
  const rows = coInvestors.slice(0, 15)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Co-investment network
          {coInvestors.length > 0 && (
            <Badge variant="secondary" className="ml-auto text-xs">
              {coInvestors.length} co-investor{coInvestors.length === 1 ? '' : 's'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No co-investment network data yet — enriches as more portfolio
            companies are added.
          </p>
        ) : (
          <TooltipProvider delayDuration={150}>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Co-investor</TableHead>
                    <TableHead className="text-right">Shared deals</TableHead>
                    <TableHead>Sample companies</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const sample = row.shared_portfolio_sample.slice(0, 3)
                    const sampleSummary =
                      sample.length === 0
                        ? '—'
                        : sample.join(', ') +
                          (row.shared_portfolio_sample.length > sample.length
                            ? ` +${row.shared_portfolio_sample.length - sample.length} more`
                            : '')
                    return (
                      <TableRow key={row.firm_id} className="cursor-pointer">
                        <TableCell>
                          <Link
                            href={`/money/raise/investor/${row.firm_id}`}
                            className="font-medium text-foreground hover:text-international-orange hover:underline"
                          >
                            {row.firm_title}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">
                          {row.shared_portfolio_sample.length > 0 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  variant="secondary"
                                  className="cursor-help tabular-nums"
                                >
                                  {row.shared_portfolio_count}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent
                                side="left"
                                className="max-w-xs text-xs"
                              >
                                <p className="font-semibold mb-1">
                                  Shared portfolio companies
                                </p>
                                <ul className="list-disc pl-4 space-y-0.5">
                                  {row.shared_portfolio_sample.map((company) => (
                                    <li key={company}>{company}</li>
                                  ))}
                                </ul>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Badge variant="secondary" className="tabular-nums">
                              {row.shared_portfolio_count}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[260px] truncate">
                          {sampleSummary}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </TooltipProvider>
        )}
      </CardContent>
    </Card>
  )
}
