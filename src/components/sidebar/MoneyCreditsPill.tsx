'use client'

/**
 * Sidebar Credits pill — Phase 2 Money.
 *
 * Renders directly under `AICreditsBarLoader` when `newMoneyExperienceEnabled`.
 * Reads the active monthly `ai_credits_budget` + sums `ai_credits_ledger` for
 * the period via `getCreditsUsageSummary`.
 *
 * Variants:
 *   - hidden when no budget is configured (capCents === 0)
 *   - default: shows percentage + cost
 *   - warning (>= warning threshold, default 80%): warning tone
 *   - destructive (cost >= cap): destructive tone, links to /money/settings/credits
 *
 * Per CLAUDE.md no-AI-emphasis rule the label stays "Credits", not "AI Credits".
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
    getCreditsUsageSummary,
    type CreditsUsageSummary,
} from '@/actions/money-credits'

function formatAmount(cents: number, currency: string): string {
    try {
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency,
            maximumFractionDigits: cents >= 10_000 ? 0 : 2,
        }).format(cents / 100)
    } catch {
        return `${(cents / 100).toFixed(2)}`
    }
}

export function MoneyCreditsPill(): React.ReactElement | null {
    const [data, setData] = useState<CreditsUsageSummary | null>(null)

    useEffect(() => {
        let cancelled = false
        getCreditsUsageSummary()
            .then((result) => {
                if (cancelled) return
                if (!('error' in result)) setData(result)
            })
            .catch(() => {
                // Non-critical — swallow. The pill stays hidden if the read fails.
            })
        return () => {
            cancelled = true
        }
    }, [])

    if (!data || data.capCents === 0) return null

    const pct = Math.min(
        100,
        Math.round(data.capCents > 0 ? (data.usedCents / data.capCents) * 100 : 0),
    )

    const tone: 'default' | 'warning' | 'destructive' =
        data.breach ? 'destructive' :
        data.warning ? 'warning' :
        'default'

    const containerClass = cn(
        'w-full text-left px-2 py-2 rounded-md transition-colors',
        tone === 'destructive' && 'border border-destructive/40 bg-destructive/10 hover:bg-destructive/15',
        tone === 'warning' && 'border border-status-warning/40 bg-status-warning-light hover:bg-status-warning/10',
        tone === 'default' && 'border border-transparent hover:bg-muted/50',
    )

    const barColorClass =
        tone === 'destructive' ? 'bg-destructive' :
        tone === 'warning' ? 'bg-status-warning' :
        'bg-international-orange'

    const labelTone =
        tone === 'destructive' ? 'text-destructive' :
        tone === 'warning' ? 'text-status-warning' :
        'text-foreground'

    return (
        <Link
            href="/money/settings/credits"
            className={containerClass}
            aria-label={`Credits: ${formatAmount(data.usedCents, data.currency)} of ${formatAmount(data.capCents, data.currency)} used (${pct}%) for ${data.periodLabel}`}
        >
            <div className="flex items-center justify-between mb-1">
                <span className={cn('text-[10px] font-semibold', labelTone)}>
                    Credits
                </span>
                <span className={cn('text-[10px] font-semibold tabular-nums', labelTone)}>
                    {pct}% · {formatAmount(data.usedCents, data.currency)}
                </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                    className={cn('h-full rounded-full transition-all duration-500', barColorClass)}
                    style={{ width: `${pct}%` }}
                />
            </div>
            {tone === 'destructive' && (
                <p className="text-[9px] text-destructive mt-1 font-medium">
                    Over budget — review usage
                </p>
            )}
        </Link>
    )
}
