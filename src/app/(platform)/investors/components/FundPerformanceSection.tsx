/**
 * @file FundPerformanceSection.tsx
 *
 * @description Displays fund performance data (IRR, MOIC, exits) for professional+ users.
 * If the user lacks access, renders a LockedSection placeholder.
 */

import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp } from 'lucide-react'
import { LockedSection } from './LockedSection'

// SECURITY: Allowlist of fund_performance JSONB keys to display.
// Prevents arbitrary internal fields from leaking to the UI.
const PERFORMANCE_DISPLAY_KEYS = new Set([
  'net_irr', 'gross_irr', 'moic', 'tvpi', 'dpi', 'rvpi',
  'vintage_year', 'fund_size', 'deployed_pct', 'follow_on_ratio',
])

interface FundPerformanceSectionProps {
  fundHistory: unknown
  exits: unknown
  fundPerformance: unknown
  factCheckStatus: string | undefined
  hasAccess: boolean
}

export function FundPerformanceSection({
  fundHistory,
  exits,
  fundPerformance,
  factCheckStatus,
  hasAccess,
}: FundPerformanceSectionProps) {
  const hasAnyData = fundHistory || exits || fundPerformance

  // Don't show anything (including lock) when there's no data behind it
  if (!hasAnyData) return null

  // Show locked placeholder for non-professional users
  if (!hasAccess) {
    return (
      <LockedSection
        title="Fund Performance"
        requiredTier="professional"
        featureDescription="Access IRR, MOIC, exit history, and fund vintage data."
      >
        {/* Placeholder rows — generic labels only, no fake numbers */}
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Net IRR</span>
            <span className="text-sm font-semibold text-muted-foreground">—</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">MOIC</span>
            <span className="text-sm font-semibold text-muted-foreground">—</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Notable Exits</span>
            <span className="text-sm font-semibold text-muted-foreground">—</span>
          </div>
        </div>
      </LockedSection>
    )
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Fund Performance
          {factCheckStatus && (
            <Badge
              variant={factCheckStatus === 'verified' ? 'success' : 'outline'}
              className="text-xs"
            >
              {factCheckStatus === 'verified' ? 'Fact-checked' : factCheckStatus}
            </Badge>
          )}
        </h2>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Fund performance metrics — allowlisted keys only */}
        {fundPerformance != null && typeof fundPerformance === 'object' && !Array.isArray(fundPerformance) && (
          <div className="space-y-2">
            {Object.entries(fundPerformance as Record<string, unknown>)
              .filter(([key, v]) => PERFORMANCE_DISPLAY_KEYS.has(key) && v != null && typeof v !== 'object')
              .map(([key, value]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                <span className="font-medium text-foreground">{String(value)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Fund history */}
        {fundHistory != null && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Fund History</p>
            <p className="text-sm text-foreground leading-relaxed">
              {typeof fundHistory === 'string' ? fundHistory : JSON.stringify(fundHistory)}
            </p>
          </div>
        )}

        {/* Exits */}
        {exits != null && (
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Exits</p>
            {Array.isArray(exits) ? (
              <div className="space-y-1">
                {(exits as string[]).map((exit: string, i: number) => (
                  <p key={i} className="text-sm text-foreground">{String(exit)}</p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground leading-relaxed">
                {typeof exits === 'string' ? exits : JSON.stringify(exits)}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
