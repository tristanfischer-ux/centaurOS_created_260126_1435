'use client'

import { useState } from 'react'
import {
  Clock,
  CheckCircle,
  AlertCircle,
  CreditCard,
  FileText,
  ChevronDown,
  ChevronUp,
  Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { TimesheetEntry, TimesheetStatus } from '@/types/retainers'
import { format, parseISO, addDays } from 'date-fns'

// ==========================================
// STATUS CONFIG
// ==========================================

const STATUS_CONFIG: Record<TimesheetStatus, {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  icon: typeof Clock
  color: string
}> = {
  draft: {
    label: 'Draft',
    variant: 'secondary',
    icon: FileText,
    color: 'text-muted-foreground',
  },
  submitted: {
    label: 'Submitted',
    variant: 'default',
    icon: Clock,
    color: 'text-status-info',
  },
  approved: {
    label: 'Approved',
    variant: 'default',
    icon: CheckCircle,
    color: 'text-status-success',
  },
  disputed: {
    label: 'Disputed',
    variant: 'destructive',
    icon: AlertCircle,
    color: 'text-destructive',
  },
  paid: {
    label: 'Paid',
    variant: 'default',
    icon: CreditCard,
    color: 'text-status-success',
  },
}

// ==========================================
// PROPS
// ==========================================

interface TimesheetHistoryProps {
  timesheets: TimesheetEntry[]
  hourlyRate: number
  currency: string
  onSelectTimesheet?: (timesheet: TimesheetEntry) => void
}

// ==========================================
// COMPONENT
// ==========================================

export function TimesheetHistory({
  timesheets,
  hourlyRate,
  currency,
  onSelectTimesheet,
}: TimesheetHistoryProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  if (timesheets.length === 0) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">
            <Calendar className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No timesheet history yet</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Timesheet History
        </CardTitle>
        <CardDescription>
          Past timesheets and their status
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {timesheets.map((timesheet) => {
            const status = timesheet.status as TimesheetStatus
            const config = STATUS_CONFIG[status]
            const StatusIcon = config.icon
            const isExpanded = expandedIds.has(timesheet.id)

            const weekStartDate = parseISO(timesheet.week_start)
            const weekEndDate = addDays(weekStartDate, 4)
            const amount = (timesheet.hours_logged || 0) * hourlyRate

            return (
              <Collapsible
                key={timesheet.id}
                open={isExpanded}
                onOpenChange={() => toggleExpanded(timesheet.id)}
              >
                <div
                  className={cn(
                    'border rounded-lg overflow-hidden transition-colors',
                    isExpanded && 'border-primary'
                  )}
                >
                  <CollapsibleTrigger asChild>
                    <button
                      className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                      onClick={() => toggleExpanded(timesheet.id)}
                    >
                      <div className="flex items-center gap-3">
                        <StatusIcon className={cn('h-5 w-5', config.color)} />
                        <div className="text-left">
                          <p className="font-medium">
                            {format(weekStartDate, 'dd MMM')} - {format(weekEndDate, 'dd MMM yyyy')}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {timesheet.hours_logged} hours logged
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={config.variant}>
                          {config.label}
                        </Badge>
                        <div className="text-right mr-2">
                          <p className="font-semibold">
                            {currency} {amount.toFixed(2)}
                          </p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4 pt-2 border-t bg-muted/30">
                      {/* Description */}
                      {timesheet.description && (
                        <div className="mb-3">
                          <p className="text-sm font-medium text-muted-foreground mb-1">
                            Work Description
                          </p>
                          <p className="text-sm whitespace-pre-wrap">
                            {timesheet.description}
                          </p>
                        </div>
                      )}

                      {/* Timestamps */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {timesheet.submitted_at && (
                          <div>
                            <p className="text-muted-foreground">Submitted</p>
                            <p>
                              {format(new Date(timesheet.submitted_at), 'dd MMM yyyy HH:mm')}
                            </p>
                          </div>
                        )}
                        {timesheet.approved_at && (
                          <div>
                            <p className="text-muted-foreground">Approved</p>
                            <p>
                              {format(new Date(timesheet.approved_at), 'dd MMM yyyy HH:mm')}
                            </p>
                          </div>
                        )}
                        {timesheet.paid_at && (
                          <div>
                            <p className="text-muted-foreground">Paid</p>
                            <p>
                              {format(new Date(timesheet.paid_at), 'dd MMM yyyy HH:mm')}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {onSelectTimesheet && (
                        <div className="mt-3 pt-3 border-t">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => onSelectTimesheet(timesheet)}
                          >
                            View Details
                          </Button>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export default TimesheetHistory
