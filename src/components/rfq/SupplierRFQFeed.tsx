// @ts-nocheck
'use client'

import { useState, useEffect, useCallback, memo } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Loader2,
  RefreshCw,
  Search,
  Zap,
  Clock,
  Bell,
  BellOff,
} from 'lucide-react'
import { getMyRFQs, markRFQViewed } from '@/actions/rfq'
import { RFQSummary, RFQ_CATEGORIES } from '@/types/rfq'
import { RFQCard } from './RFQCard'
import { useRFQFeed } from '@/hooks/useRFQFeed'

interface SupplierRFQFeedProps {
  initialRFQs?: RFQSummary[]
  className?: string
}

export const SupplierRFQFeed = memo(function SupplierRFQFeed({
  initialRFQs = [],
  className,
}: SupplierRFQFeedProps) {
  const router = useRouter()
  const [rfqs, setRfqs] = useState<RFQSummary[]>(initialRFQs)
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [urgencyFilter, setUrgencyFilter] = useState<string>('')

  // Real-time updates hook
  const { newRFQCount, clearNewCount } = useRFQFeed({
    onNewRFQ: useCallback((rfq: RFQSummary) => {
      setRfqs((prev) => {
        // Avoid duplicates
        if (prev.some((r) => r.id === rfq.id)) return prev
        return [rfq, ...prev]
      })
    }, []),
  })

  // Fetch RFQs
  const fetchRFQs = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getMyRFQs('supplier', {
        search: searchQuery || undefined,
        category: categoryFilter || undefined,
        urgency: urgencyFilter as 'urgent' | 'standard' | undefined,
      })

      if (!result.error) {
        setRfqs(result.data)
        clearNewCount()
      }
    } catch (err) {
      console.error('Error fetching RFQs:', err)
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, categoryFilter, urgencyFilter, clearNewCount])

  // Initial fetch and filter changes
  useEffect(() => {
    // Skip initial fetch if we have initialRFQs
    const shouldFetch = initialRFQs.length === 0 || searchQuery || categoryFilter || urgencyFilter
    if (!shouldFetch) return

    const timeout = setTimeout(fetchRFQs, initialRFQs.length === 0 ? 0 : 300)
    return () => clearTimeout(timeout)
  }, [searchQuery, categoryFilter, urgencyFilter, fetchRFQs, initialRFQs.length])

  // Handle respond action
  const handleRespond = async (rfqId: string) => {
    // Mark as viewed
    await markRFQViewed(rfqId)
    // Navigate to detail page
    router.push(`/rfq/${rfqId}`)
  }

  // Filter urgent RFQs
  const urgentRFQs = rfqs.filter((r) => r.urgency === 'urgent')
  const standardRFQs = rfqs.filter((r) => r.urgency === 'standard')

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with new notification */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">Available RFQs</h2>
          {newRFQCount > 0 && (
            <Badge variant="secondary" className="animate-pulse">
              <Bell className="w-3 h-3 mr-1" />
              {newRFQCount} new
            </Badge>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={fetchRFQs}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          <span className="ml-2 hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search RFQs..."
                className="pl-9"
              />
            </div>

            {/* Category filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Categories</SelectItem>
                {RFQ_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Urgency filter */}
            <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="All Urgency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                <SelectItem value="urgent">
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    Urgent
                  </span>
                </SelectItem>
                <SelectItem value="standard">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Standard
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Loading state */}
      {isLoading && rfqs.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && rfqs.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <BellOff className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No RFQs Available</h3>
            <p className="text-muted-foreground">
              Check back later for new requests from buyers.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Urgent RFQs */}
      {urgentRFQs.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-amber-700">Urgent RFQs</h3>
            <Badge variant="secondary" className="bg-amber-50 text-amber-700 border-amber-200">
              {urgentRFQs.length}
            </Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {urgentRFQs.map((rfq) => (
              <RFQCard
                key={rfq.id}
                rfq={rfq}
                role="supplier"
                onRespond={() => handleRespond(rfq.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Standard RFQs */}
      {standardRFQs.length > 0 && (
        <div className="space-y-4">
          {urgentRFQs.length > 0 && (
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              <h3 className="font-semibold">Standard RFQs</h3>
              <Badge variant="secondary">
                {standardRFQs.length}
              </Badge>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {standardRFQs.map((rfq) => (
              <RFQCard
                key={rfq.id}
                rfq={rfq}
                role="supplier"
                onRespond={() => handleRespond(rfq.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

// Minimal feed for dashboard widgets
interface SupplierRFQFeedMinimalProps {
  limit?: number
  className?: string
}

export function SupplierRFQFeedMinimal({
  limit = 5,
  className,
}: SupplierRFQFeedMinimalProps) {
  const router = useRouter()
  const [rfqs, setRfqs] = useState<RFQSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchRFQs() {
      try {
        const result = await getMyRFQs('supplier', { limit })
        if (!result.error) {
          setRfqs(result.data)
        }
      } catch (err) {
        console.error('Error fetching RFQs:', err)
      } finally {
        setIsLoading(false)
      }
    }
    fetchRFQs()
  }, [limit])

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  if (rfqs.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-6 text-center text-muted-foreground">
          No RFQs available
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          Available RFQs
          <Badge variant="secondary">{rfqs.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rfqs.map((rfq) => (
          <button
            key={rfq.id}
            onClick={() => router.push(`/rfq/${rfq.id}`)}
            className="w-full flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{rfq.title}</div>
              <div className="text-xs text-muted-foreground">
                {rfq.category || 'Uncategorized'}
              </div>
            </div>
            {rfq.urgency === 'urgent' && (
              <Badge variant="secondary" className="ml-2 bg-amber-50 text-amber-700 border-amber-200">
                <Zap className="w-3 h-3" />
              </Badge>
            )}
          </button>
        ))}

        <Button
          variant="ghost"
          className="w-full mt-2"
          onClick={() => router.push('/rfq')}
        >
          View All RFQs
        </Button>
      </CardContent>
    </Card>
  )
}
