/**
 * /money/plan/pnl — Income Statement, projected Balance Sheet, waterfall.
 *
 * Restores loss #6 from the Money V2 parity audit. Starter+ tier gate via
 * getPnlReport(). Free tier sees an upgrade prompt rather than a half
 * report.
 */

import Link from 'next/link'
import { ArrowLeft, BarChart3, Lock } from 'lucide-react'
import { getPnlReport } from '@/actions/money-pnl'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PnlView } from './pnl-view'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'P&L · Money',
  description:
    'Monthly Income Statement, projected Balance Sheet, and waterfall chart from your plan line items.',
}

export default async function MoneyPnlPage() {
  const result = await getPnlReport({ months: 12 })

  if ('error' in result) {
    if (result.error === 'tier_upgrade_required') {
      return (
        <div className="space-y-6">
          <div>
            <Button variant="ghost" size="sm" asChild className="-ml-2">
              <Link href="/money/plan">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to plan
              </Link>
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-international-orange" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">P&amp;L</h1>
              <p className="text-sm text-muted-foreground">
                Monthly Income Statement, projected Balance Sheet, and waterfall
              </p>
            </div>
          </div>

          <Card className="max-w-2xl border-international-orange/30">
            <CardContent className="py-10 px-8 space-y-4 text-center">
              <div className="h-12 w-12 rounded-full bg-international-orange/10 flex items-center justify-center mx-auto">
                <Lock className="h-6 w-6 text-international-orange" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                Upgrade to Starter to unlock monthly P&amp;L reports
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Get a 12-month Income Statement, a week-by-week projected
                Balance Sheet, a 7-step revenue-to-profit waterfall, and a
                category breakdown across your plan lines.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  asChild
                  className="bg-international-orange hover:bg-international-orange/90"
                >
                  <Link href="/pricing?plan=starter">
                    Upgrade to Starter — £49/mo
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  No contracts, cancel anytime.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">P&amp;L</h1>
            <p className="text-sm text-muted-foreground">
              Couldn&rsquo;t load your P&amp;L right now.
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {result.error}
          </CardContent>
        </Card>
      </div>
    )
  }

  return <PnlView report={result} />
}
