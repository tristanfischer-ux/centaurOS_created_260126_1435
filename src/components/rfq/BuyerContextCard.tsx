'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  User,
  Award,
  Clock,
  FileText,
  Loader2,
} from 'lucide-react'
import { getBuyerContext } from '@/actions/rfq'

interface BuyerContextCardProps {
  buyerId: string
  buyerName?: string | null
  buyerAvatarUrl?: string | null
  className?: string
}

export function BuyerContextCard({
  buyerId,
  buyerName,
  buyerAvatarUrl,
  className,
}: BuyerContextCardProps) {
  const [context, setContext] = useState<{
    totalRfqs: number
    awardedRfqs: number
    awardRate: number
    avgDecisionDays: number | null
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchContext = async () => {
      try {
        const result = await getBuyerContext(buyerId)
        if (result.data) {
          setContext(result.data)
        }
      } catch (error) {
        console.error('Failed to fetch buyer context:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchContext()
  }, [buyerId])

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 py-2 text-sm text-muted-foreground', className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading buyer info...
      </div>
    )
  }

  return (
    <div className={cn('flex items-center gap-3 pt-4 border-t', className)}>
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
        {buyerAvatarUrl ? (
          <img
            src={buyerAvatarUrl}
            alt={buyerName || 'Buyer'}
            className="w-10 h-10 rounded-full"
          />
        ) : (
          <User className="w-5 h-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{buyerName || 'Unknown'}</div>
        {context && (
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <FileText className="w-3 h-3" />
              {context.totalRfqs} RFQs
            </span>
            {context.totalRfqs > 0 && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px]',
                  context.awardRate >= 50 && 'text-status-success border-status-success'
                )}
              >
                <Award className="w-3 h-3 mr-0.5" />
                {context.awardRate}% award rate
              </Badge>
            )}
            {context.avgDecisionDays !== null && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                ~{context.avgDecisionDays}d decision
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
