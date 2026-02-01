'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { 
  AlertCircle, 
  Clock, 
  ShieldCheck,
  ChevronRight 
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NeedsAttentionSummaryProps {
  overdueCount: number
  approvalsCount: number
  blockersCount?: number
  className?: string
}

export function NeedsAttentionSummary({ 
  overdueCount, 
  approvalsCount, 
  blockersCount = 0,
  className 
}: NeedsAttentionSummaryProps) {
  const totalCount = overdueCount + approvalsCount + blockersCount

  if (totalCount === 0) {
    return (
      <Card className={cn("border-status-success bg-status-success-light/30", className)}>
        <CardContent className="py-4">
          <div className="flex items-center gap-2 text-status-success-dark">
            <ShieldCheck className="h-4 w-4" />
            <span className="text-sm font-medium">All clear - nothing urgent</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn("border-red-200/50", className)}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <CardTitle className="text-sm">Needs Attention</CardTitle>
          <Badge variant="destructive" className="ml-auto">
            {totalCount}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="space-y-2">
          {overdueCount > 0 && (
            <Link 
              href="/tasks?filter=overdue"
              className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors group"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-destructive" />
                <span className="text-sm">Overdue tasks</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="border-destructive text-destructive">
                  {overdueCount}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          )}

          {approvalsCount > 0 && (
            <Link 
              href="/tasks?filter=pending-approval"
              className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors group"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-amber-600" />
                <span className="text-sm">Awaiting approval</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="border-amber-600 text-amber-600">
                  {approvalsCount}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          )}

          {blockersCount > 0 && (
            <Link 
              href="/team?tab=standups"
              className="flex items-center justify-between p-2 rounded-md hover:bg-muted transition-colors group"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <span className="text-sm">Blockers reported</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="border-destructive text-destructive">
                  {blockersCount}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
