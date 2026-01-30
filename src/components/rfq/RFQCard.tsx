'use client'

import { memo } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Clock,
  Calendar,
  MessageSquare,
  Zap,
  Award,
  Users,
  ChevronRight,
} from 'lucide-react'
import { RFQSummary, RFQStatus, RFQType } from '@/types/rfq'
import { formatDistanceToNow, format } from 'date-fns'

interface RFQCardProps {
  rfq: RFQSummary
  role?: 'buyer' | 'supplier'
  onRespond?: () => void
  className?: string
}

const statusConfig: Record<RFQStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; color: string }> = {
  'Open': { label: 'Open', variant: 'secondary', color: 'bg-blue-50 text-blue-700 border' },
  'Bidding': { label: 'Bidding', variant: 'default', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'priority_hold': { label: 'Priority Hold', variant: 'secondary', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  'Awarded': { label: 'Awarded', variant: 'default', color: 'bg-violet-50 text-violet-700 border-violet-200' },
  'Closed': { label: 'Closed', variant: 'secondary', color: 'bg-gray-50 text-gray-700 border-gray-200' },
  'cancelled': { label: 'Cancelled', variant: 'destructive', color: 'bg-red-50 text-red-700 border-red-200' },
}

const typeConfig: Record<RFQType, { label: string; icon: typeof Zap }> = {
  'commodity': { label: 'Commodity', icon: Zap },
  'custom': { label: 'Custom', icon: Clock },
  'service': { label: 'Service', icon: Users },
}

export const RFQCard = memo(function RFQCard({
  rfq,
  role = 'buyer',
  onRespond,
  className,
}: RFQCardProps) {
  const status = statusConfig[rfq.status] || statusConfig['Open']
  const type = typeConfig[rfq.rfq_type] || typeConfig['commodity']
  const TypeIcon = type.icon

  const formatBudget = () => {
    if (rfq.budget_min && rfq.budget_max) {
      return `£${rfq.budget_min.toLocaleString()} - £${rfq.budget_max.toLocaleString()}`
    }
    if (rfq.budget_min) {
      return `From £${rfq.budget_min.toLocaleString()}`
    }
    if (rfq.budget_max) {
      return `Up to £${rfq.budget_max.toLocaleString()}`
    }
    return null
  }

  const budget = formatBudget()

  return (
    <Card className={cn('hover:shadow-md transition-shadow', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 flex-1 min-w-0">
            <Link 
              href={`/rfq/${rfq.id}`}
              className="font-semibold text-lg hover:underline line-clamp-1"
            >
              {rfq.title}
            </Link>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className={cn('text-xs', status.color)}>
                {status.label}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                <TypeIcon className="w-3 h-3 mr-1" />
                {type.label}
              </Badge>
              {rfq.urgency === 'urgent' && (
                <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                  <Zap className="w-3 h-3 mr-1" />
                  Urgent
                </Badge>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Category */}
        {rfq.category && (
          <span className="text-sm text-muted-foreground">{rfq.category}</span>
        )}

        {/* Budget and Deadline */}
        <div className="flex items-center gap-4 flex-wrap text-sm">
          {budget && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="font-medium">{budget}</span>
            </div>
          )}
          {rfq.deadline && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>Due {format(new Date(rfq.deadline), 'MMM d, yyyy')}</span>
            </div>
          )}
        </div>

        {/* Response count and timing */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <MessageSquare className="w-4 h-4" />
            <span>
              {rfq.response_count} {rfq.response_count === 1 ? 'response' : 'responses'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>
              {formatDistanceToNow(new Date(rfq.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* Buyer info for supplier view */}
        {role === 'supplier' && rfq.buyer?.full_name && (
          <div className="text-sm text-muted-foreground">
            From: <span className="font-medium">{rfq.buyer.full_name}</span>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-0">
        {role === 'supplier' && onRespond && (
          rfq.status === 'Open' || rfq.status === 'Bidding' ? (
            <Button onClick={onRespond} className="w-full">
              Respond
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : rfq.status === 'Awarded' ? (
            <div className="flex items-center gap-2 text-violet-600">
              <Award className="w-4 h-4" />
              <span className="text-sm font-medium">Awarded</span>
            </div>
          ) : null
        )}

        {role === 'buyer' && (
          <Button variant="secondary" asChild className="w-full">
            <Link href={`/rfq/${rfq.id}`}>
              View Details
              <ChevronRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  )
})

// Minimal card variant for lists
interface RFQCardMinimalProps {
  rfq: RFQSummary
  className?: string
}

export const RFQCardMinimal = memo(function RFQCardMinimal({
  rfq,
  className,
}: RFQCardMinimalProps) {
  const status = statusConfig[rfq.status] || statusConfig['Open']

  return (
    <Link
      href={`/rfq/${rfq.id}`}
      className={cn(
        'flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors',
        className
      )}
    >
      <div className="flex-1 min-w-0">
        <h4 className="font-medium truncate">{rfq.title}</h4>
        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
          {rfq.category && <span>{rfq.category}</span>}
          <span>•</span>
          <span>{rfq.response_count} responses</span>
        </div>
      </div>
      <Badge variant="secondary" className={cn('text-xs ml-2', status.color)}>
        {status.label}
      </Badge>
    </Link>
  )
})
