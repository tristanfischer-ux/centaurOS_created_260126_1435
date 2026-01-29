"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { 
  FileSearch, 
  ArrowRight, 
  TrendingUp, 
  Clock, 
  Trophy,
  Zap,
  AlertCircle
} from "lucide-react"
import { getMyRFQs } from "@/actions/rfq"
import { RFQSummary } from "@/types/rfq"
import { cn } from "@/lib/utils"

interface RFQStats {
  activeMatches: number
  pendingResponses: number
  winRate: number
  avgResponseTime: string
  urgentCount: number
}

interface RFQWidgetProps {
  className?: string
}

export function RFQWidget({ className }: RFQWidgetProps) {
  const router = useRouter()
  const [stats, setStats] = useState<RFQStats | null>(null)
  const [recentRFQs, setRecentRFQs] = useState<RFQSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadRFQData() {
      try {
        // Fetch available RFQs for supplier
        const result = await getMyRFQs('supplier', { limit: 5 })
        
        if (!result.error && result.data) {
          setRecentRFQs(result.data)
          
          // Calculate stats from the data
          const urgentCount = result.data.filter(rfq => rfq.urgency === 'urgent').length
          const activeMatches = result.data.filter(
            rfq => rfq.status === 'Open' || rfq.status === 'Bidding'
          ).length
          
          // For now, set placeholder values for stats we can't calculate yet
          // These will be replaced with real data from a dedicated stats endpoint
          setStats({
            activeMatches,
            pendingResponses: activeMatches, // Simplified - RFQs not yet responded to
            winRate: 0, // Will need historical data
            avgResponseTime: '-', // Will need historical data
            urgentCount,
          })
        }
      } catch (err) {
        console.error('Error loading RFQ data:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadRFQData()
  }, [])

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  const hasUrgentRFQs = (stats?.urgentCount || 0) > 0
  const hasNewMatches = (stats?.activeMatches || 0) > 0

  return (
    <Card className={cn("relative overflow-hidden", className)}>
      {/* Gradient background for visual interest */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-purple-50/50 pointer-events-none" />
      
      <CardHeader className="relative pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-100">
              <FileSearch className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">RFQ Opportunities</CardTitle>
              <CardDescription>Request for Quote matches</CardDescription>
            </div>
          </div>
          {hasNewMatches && (
            <Badge variant="secondary" className="animate-pulse bg-green-100 text-green-700">
              New
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="relative space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Active Matches */}
          <div className="p-3 rounded-lg bg-white border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <FileSearch className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">Active Matches</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {stats?.activeMatches || 0}
            </p>
          </div>

          {/* Urgent RFQs */}
          <div className={cn(
            "p-3 rounded-lg border",
            hasUrgentRFQs 
              ? "bg-amber-50 border-amber-200" 
              : "bg-white border-slate-100"
          )}>
            <div className="flex items-center gap-2 mb-1">
              <Zap className={cn(
                "h-4 w-4",
                hasUrgentRFQs ? "text-amber-600" : "text-muted-foreground"
              )} />
              <span className="text-xs text-muted-foreground">Urgent</span>
            </div>
            <p className={cn(
              "text-2xl font-bold",
              hasUrgentRFQs ? "text-amber-700" : "text-slate-900"
            )}>
              {stats?.urgentCount || 0}
            </p>
          </div>

          {/* Win Rate */}
          <div className="p-3 rounded-lg bg-white border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Win Rate</span>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {stats?.winRate ? `${stats.winRate}%` : '-'}
            </p>
          </div>

          {/* Avg Response Time */}
          <div className="p-3 rounded-lg bg-white border border-slate-100">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-purple-600" />
              <span className="text-xs text-muted-foreground">Avg Response</span>
            </div>
            <p className="text-lg font-bold text-slate-900">
              {stats?.avgResponseTime || '-'}
            </p>
          </div>
        </div>

        {/* Recent RFQs Preview */}
        {recentRFQs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-700">Recent Opportunities</h4>
            <div className="space-y-2">
              {recentRFQs.slice(0, 3).map((rfq) => (
                <button
                  key={rfq.id}
                  onClick={() => router.push(`/rfq/${rfq.id}`)}
                  className="w-full flex items-center justify-between p-2 rounded-md border bg-white hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{rfq.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {rfq.category || 'Uncategorized'}
                    </p>
                  </div>
                  {rfq.urgency === 'urgent' && (
                    <Badge variant="secondary" className="ml-2 bg-amber-50 text-amber-700 border-amber-200 text-xs">
                      <Zap className="w-3 h-3" />
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {recentRFQs.length === 0 && (
          <div className="text-center py-6 px-4 rounded-lg bg-white border border-dashed">
            <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-slate-700">No RFQs available</p>
            <p className="text-xs text-muted-foreground mt-1">
              New opportunities will appear here
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="default"
            className="flex-1"
            onClick={() => router.push('/rfq?tab=available')}
          >
            <FileSearch className="w-4 h-4 mr-2" />
            View All RFQs
          </Button>
          {hasUrgentRFQs && (
            <Button
              variant="secondary"
              className="border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700"
              onClick={() => router.push('/rfq?tab=available&urgency=urgent')}
            >
              <Zap className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
