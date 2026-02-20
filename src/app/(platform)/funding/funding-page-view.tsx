'use client'

import { useState } from 'react'
import Link from 'next/link'
import { DollarSign, TrendingUp, Calendar, ExternalLink, Target } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { typography } from '@/lib/design-system'
import { updateFundingRequirementStatus } from '@/actions/business-plan'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'
import type { SavedFundingRequirement } from '@/lib/business-plan-types'

interface FundingPageViewProps {
  requirements: SavedFundingRequirement[]
}

const STATUS_CONFIG = {
  projected: { label: 'Projected', color: 'bg-muted text-muted-foreground' },
  seeking: { label: 'Seeking', color: 'bg-status-info-light text-status-info' },
  secured: { label: 'Secured', color: 'bg-status-success-light text-status-success' },
  cancelled: { label: 'Cancelled', color: 'bg-muted text-muted-foreground opacity-50' },
} satisfies Record<string, { label: string; color: string }>

const FUNDING_TYPE_LABELS: Record<string, string> = {
  bootstrapping: 'Bootstrapping',
  angel: 'Angel Investment',
  vc: 'Venture Capital',
  grant: 'Grant',
  revenue_based: 'Revenue-Based',
  debt: 'Debt Financing',
  other: 'Other',
}

/**
 * @description Funding & Financing page client view. Shows summary cards
 * (total required / secured / still needed) and a list of funding events
 * with status controls.
 */
export function FundingPageView({ requirements }: FundingPageViewProps) {
  const router = useRouter()
  const [updating, setUpdating] = useState<string | null>(null)

  const totalRequired = requirements
    .filter(r => r.status !== 'cancelled')
    .reduce((sum, r) => sum + (r.amount_usd ?? 0), 0)

  const secured = requirements
    .filter(r => r.status === 'secured')
    .reduce((sum, r) => sum + (r.amount_usd ?? 0), 0)

  async function handleStatusChange(
    id: string,
    status: SavedFundingRequirement['status']
  ): Promise<void> {
    setUpdating(id)
    const result = await updateFundingRequirementStatus(id, status)
    setUpdating(null)
    if (result.error) {
      toast.error('Failed to update status')
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Funding & Financing</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Capital requirements derived from your business plan, linked to strategic objectives
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/pitch-prep">
            <ExternalLink className="h-4 w-4 mr-2" />
            Prepare Pitch
          </Link>
        </Button>
      </div>

      {requirements.length === 0 ? (
        <EmptyState
          title="No funding plan yet"
          description="Upload your business plan on the Strategy page to automatically generate funding requirements"
          action={
            <Button variant="outline" asChild>
              <a href="/strategy">Go to Strategy</a>
            </Button>
          }
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-status-info-light flex items-center justify-center">
                  <Target className="h-5 w-5 text-status-info" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Required</p>
                  <p className="text-2xl font-bold text-foreground">
                    ${totalRequired.toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-status-success-light flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-status-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Secured</p>
                  <p className="text-2xl font-bold text-foreground">
                    ${secured.toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6 flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-status-warning-light flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-status-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Still Needed</p>
                  <p className="text-2xl font-bold text-foreground">
                    ${(totalRequired - secured).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Funding events list */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-foreground">Funding Events</h2>
            {requirements.map((req) => {
              const statusConfig = STATUS_CONFIG[req.status]

              return (
                <Card key={req.id} className={cn('border', req.status === 'cancelled' && 'opacity-50')}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-foreground">{req.title}</p>
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', statusConfig.color)}>
                            {statusConfig.label}
                          </span>
                          {req.funding_type && (
                            <Badge variant="secondary">
                              {FUNDING_TYPE_LABELS[req.funding_type] ?? req.funding_type}
                            </Badge>
                          )}
                        </div>

                        {req.amount_usd != null && (
                          <p className="text-lg font-bold text-foreground mt-1">
                            ${req.amount_usd.toLocaleString()}
                          </p>
                        )}

                        {req.reason && (
                          <p className="text-sm text-muted-foreground mt-1">{req.reason}</p>
                        )}

                        {req.needed_by_date && (
                          <div className="flex items-center gap-1.5 mt-2 text-sm text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>
                              Needed by: {format(parseISO(req.needed_by_date), 'MMMM d, yyyy')}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Status controls */}
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {(['projected', 'seeking', 'secured'] as const).map((status) => (
                          <button
                            key={status}
                            disabled={req.status === status || updating === req.id}
                            onClick={() => handleStatusChange(req.id, status)}
                            className={cn(
                              'px-3 py-1 rounded-md text-xs font-medium transition-colors border',
                              req.status === status
                                ? STATUS_CONFIG[status].color + ' border-transparent'
                                : 'bg-transparent text-muted-foreground border-border hover:border-foreground/30'
                            )}
                          >
                            {STATUS_CONFIG[status].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
