'use client'

import { useState, useEffect } from 'react'
import {
  CreditCard,
  Clock,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Receipt,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { WeeklyBillingSummary as WeeklyBillingSummaryType, TimesheetStatus } from '@/types/retainers'
import { getWeeklyBillingSummary } from '@/actions/timesheets'

// ==========================================
// STATUS CONFIG
// ==========================================

const STATUS_CONFIG: Record<TimesheetStatus, {
  label: string
  description: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  icon: typeof Clock
}> = {
  draft: {
    label: 'Draft',
    description: 'Not yet submitted',
    variant: 'secondary',
    icon: Clock,
  },
  submitted: {
    label: 'Pending Approval',
    description: 'Awaiting buyer approval',
    variant: 'default',
    icon: Clock,
  },
  approved: {
    label: 'Approved',
    description: 'Payment will be processed',
    variant: 'default',
    icon: CheckCircle,
  },
  disputed: {
    label: 'Disputed',
    description: 'Payment on hold',
    variant: 'destructive',
    icon: AlertCircle,
  },
  paid: {
    label: 'Paid',
    description: 'Payment completed',
    variant: 'default',
    icon: CreditCard,
  },
}

// ==========================================
// PROPS
// ==========================================

interface WeeklyBillingSummaryProps {
  timesheetId: string
  summary?: WeeklyBillingSummaryType | null
  isLoading?: boolean
}

// ==========================================
// COMPONENT
// ==========================================

export function WeeklyBillingSummary({
  timesheetId,
  summary: propSummary,
  isLoading: propIsLoading,
}: WeeklyBillingSummaryProps) {
  const [summary, setSummary] = useState<WeeklyBillingSummaryType | null>(propSummary || null)
  const [isLoading, setIsLoading] = useState(propIsLoading ?? !propSummary)
  const [error, setError] = useState<string | null>(null)

  // Load summary if not provided
  useEffect(() => {
    if (propSummary) {
      setSummary(propSummary)
      setIsLoading(false)
      return
    }

    async function loadSummary() {
      setIsLoading(true)
      setError(null)

      try {
        const { data, error } = await getWeeklyBillingSummary(timesheetId)

        if (error) {
          setError(error)
          return
        }

        setSummary(data)
    } catch {
      setError('Failed to load billing summary')
    } finally {
        setIsLoading(false)
      }
    }

    loadSummary()
  }, [timesheetId, propSummary])

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-destructive">
            <AlertCircle className="h-10 w-10 mx-auto mb-2" />
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!summary) {
    return null
  }

  const statusConfig = STATUS_CONFIG[summary.status]
  const StatusIcon = statusConfig.icon

  // Calculate utilization
  const utilization = (summary.hoursLogged / summary.hoursCommitted) * 100

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Weekly Billing
            </CardTitle>
            <CardDescription>
              {summary.weekStart} - {summary.weekEnd}
            </CardDescription>
          </div>
          <Badge variant={statusConfig.variant} className="gap-1">
            <StatusIcon className="h-3 w-3" />
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Hours Summary */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <Clock className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{summary.hoursLogged}</p>
              <p className="text-sm text-muted-foreground">hours logged</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">of {summary.hoursCommitted} committed</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className={cn(
                'h-4 w-4',
                utilization >= 100 ? 'text-emerald-600' : 'text-amber-600'
              )} />
              <span className={cn(
                'font-medium',
                utilization >= 100 ? 'text-emerald-600' : 'text-amber-600'
              )}>
                {utilization.toFixed(0)}% utilization
              </span>
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="space-y-3">
          {summary.items.map((item, index) => {
            const isTotal = item.type === 'total'

            if (isTotal) {
              return (
                <div key={index}>
                  <Separator className="my-3" />
                  <div className="flex items-center justify-between font-semibold text-lg">
                    <span>{item.label}</span>
                    <span>
                      {summary.currency} {item.amount.toLocaleString('en-GB', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={index}
                className={cn(
                  'flex items-center justify-between text-sm',
                  item.type === 'fee' || item.type === 'tax' ? 'text-muted-foreground' : ''
                )}
              >
                <div>
                  <span>{item.label}</span>
                  {item.description && (
                    <p className="text-xs text-muted-foreground">{item.description}</p>
                  )}
                </div>
                <span>
                  {summary.currency} {item.amount.toLocaleString('en-GB', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            )
          })}
        </div>

        {/* Status Message */}
        <div className="p-3 bg-muted/30 rounded-lg text-sm text-muted-foreground">
          {statusConfig.description}
          {summary.status === 'approved' && (
            <p className="mt-1">
              Payment will be processed automatically at the end of the billing cycle.
            </p>
          )}
          {summary.status === 'paid' && (
            <p className="mt-1">
              Payment has been processed and transferred.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default WeeklyBillingSummary
