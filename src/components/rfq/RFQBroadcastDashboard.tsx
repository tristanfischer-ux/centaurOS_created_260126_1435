'use client'

import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Send,
  Eye,
  Clock,
  CheckCircle2,
} from 'lucide-react'
import type { RFQBroadcastWithProvider, SupplierTier } from '@/types/rfq'
import { format } from 'date-fns'

interface RFQBroadcastDashboardProps {
  broadcasts: RFQBroadcastWithProvider[]
  className?: string
}

const tierLabels: Record<SupplierTier, string> = {
  verified_partner: 'Verified Partner',
  approved: 'Approved',
  pending: 'Pending',
  suspended: 'Suspended',
}

export function RFQBroadcastDashboard({
  broadcasts,
  className,
}: RFQBroadcastDashboardProps) {
  const viewed = broadcasts.filter((b) => b.viewed_at)
  const delivered = broadcasts.filter((b) => b.delivered_at && !b.viewed_at)
  const scheduled = broadcasts.filter((b) => !b.delivered_at)

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Send className="w-4 h-4" />
          Broadcast Status
        </CardTitle>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{viewed.length} viewed</span>
          <span>{delivered.length} delivered</span>
          <span>{scheduled.length} scheduled</span>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-2">
          {broadcasts.map((broadcast) => {
            const tier = broadcast.provider?.tier || 'pending'
            const timezone = broadcast.provider?.timezone || 'UTC'
            const isViewed = !!broadcast.viewed_at
            const isDelivered = !!broadcast.delivered_at

            return (
              <div
                key={broadcast.id}
                className="flex items-center justify-between p-3 rounded-lg border text-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full shrink-0',
                      isViewed
                        ? 'bg-status-success-light'
                        : isDelivered
                          ? 'bg-status-info-light'
                          : 'bg-muted'
                    )}
                  >
                    {isViewed ? (
                      <Eye className="w-4 h-4 text-status-success" />
                    ) : isDelivered ? (
                      <CheckCircle2 className="w-4 h-4 text-status-info" />
                    ) : (
                      <Clock className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {tierLabels[tier]}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{timezone}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Scheduled: {format(new Date(broadcast.scheduled_at), 'MMM d, HH:mm')}
                    </span>
                  </div>
                </div>

                <StatusBadge
                  status={isViewed ? 'success' : isDelivered ? 'info' : 'pending'}
                  size="sm"
                >
                  {isViewed ? 'Viewed' : isDelivered ? 'Delivered' : 'Scheduled'}
                </StatusBadge>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
