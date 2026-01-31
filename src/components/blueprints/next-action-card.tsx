'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { NextAction } from '@/types/blueprints'
import {
  Target,
  Users,
  HelpCircle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  AlertTriangle,
} from 'lucide-react'

interface NextActionCardProps {
  action: NextAction
  onAction?: (actionType: string) => void
  className?: string
}

export function NextActionCard({ action, onAction, className }: NextActionCardProps) {
  const priorityColors = {
    critical: 'border-l-rose-500 bg-rose-50/50',
    high: 'border-l-amber-500 bg-amber-50/50',
    medium: 'border-l-blue-500 bg-blue-50/50',
    low: 'border-l-emerald-500 bg-emerald-50/50',
  }

  const priorityBadge = {
    critical: { variant: 'destructive' as const, label: 'Critical' },
    high: { variant: 'warning' as const, label: 'High Priority' },
    medium: { variant: 'secondary' as const, label: 'Medium Priority' },
    low: { variant: 'outline' as const, label: 'Low Priority' },
  }

  const typeIcons = {
    gap: AlertTriangle,
    milestone: Target,
    update: CheckCircle2,
  }

  const TypeIcon = typeIcons[action.type]

  return (
    <Card className={cn('border-l-4', priorityColors[action.priority], className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              action.type === 'gap' ? 'bg-rose-100' : 'bg-emerald-100'
            )}>
              <TypeIcon className={cn(
                'h-5 w-5',
                action.type === 'gap' ? 'text-rose-600' : 'text-emerald-600'
              )} />
            </div>
            <div>
              <CardTitle className="text-lg">{action.title}</CardTitle>
              <Badge {...priorityBadge[action.priority]} className="mt-1">
                {priorityBadge[action.priority].label}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-muted-foreground">{action.description}</p>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {action.actions.map((act, idx) => (
            <div key={act.action}>
              {act.url ? (
                <Link href={act.url}>
                  <Button
                    variant={idx === 0 ? 'default' : 'outline'}
                    size="sm"
                    className={idx === 0 ? 'bg-international-orange hover:bg-international-orange/90' : ''}
                  >
                    {act.action === 'marketplace' && <Users className="mr-2 h-4 w-4" />}
                    {act.action === 'advisory' && <HelpCircle className="mr-2 h-4 w-4" />}
                    {act.label}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <Button
                  variant={idx === 0 ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onAction?.(act.action)}
                >
                  {act.label}
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// Simplified "Your Next Move" component for Today page integration
interface NextMoveWidgetProps {
  action: NextAction | null
  blueprintId: string
  blueprintName: string
  onDismiss?: () => void
  className?: string
}

export function NextMoveWidget({
  action,
  blueprintId,
  blueprintName,
  onDismiss,
  className,
}: NextMoveWidgetProps) {
  if (!action) return null

  return (
    <div className={cn(
      'rounded-lg border bg-card p-4 space-y-3',
      action.priority === 'critical' && 'border-rose-200 bg-rose-50/50',
      className
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-international-orange" />
          <span className="text-sm font-medium">From: {blueprintName}</span>
        </div>
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        )}
      </div>

      <div className="space-y-1">
        <p className="font-medium">{action.title}</p>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {action.description}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {action.actions[0]?.url ? (
          <Link href={action.actions[0].url}>
            <Button size="sm" className="bg-international-orange hover:bg-international-orange/90">
              {action.actions[0].label}
            </Button>
          </Link>
        ) : (
          <Button size="sm" className="bg-international-orange hover:bg-international-orange/90">
            {action.actions[0]?.label || 'View'}
          </Button>
        )}
        <Link href={`/blueprints/${blueprintId}`}>
          <Button variant="outline" size="sm">
            View Blueprint
          </Button>
        </Link>
      </div>
    </div>
  )
}
