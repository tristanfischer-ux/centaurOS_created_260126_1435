'use client'

/**
 * DailyPulseWidget Component
 * 
 * Displays the daily pulse summary on the Today page
 */

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { TrendIndicator } from './TrendIndicator'
import { InsightList } from './InsightCard'
import { getMyDailyPulse } from '@/actions/reports'
import { BarChart3, RefreshCw, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FormattedReport, DailyPulseData } from '@/lib/reports/types'

interface DailyPulseWidgetProps {
    /** User ID for the report */
    userId: string
    /** User role for role-based content */
    userRole?: string
    /** Foundry ID */
    foundryId: string
    /** Additional className */
    className?: string
}

export function DailyPulseWidget({
    userId,
    userRole,
    foundryId,
    className
}: DailyPulseWidgetProps) {
    const [report, setReport] = useState<FormattedReport | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
    
    const isLeader = userRole === 'Executive' || userRole === 'Founder' || userRole === 'Team Lead'
    
    const fetchReport = useCallback(async () => {
        setLoading(true)
        setError(null)
        
        try {
            const result = await getMyDailyPulse()
            if (result.success && result.data) {
                setReport(result.data)
                setLastUpdated(new Date())
            } else {
                setError(result.error || 'Failed to load report')
            }
        } catch (err) {
            setError('Failed to load report')
        } finally {
            setLoading(false)
        }
    }, [])
    
    useEffect(() => {
        fetchReport()
    }, [fetchReport])
    
    if (loading) {
        return <DailyPulseWidgetSkeleton />
    }
    
    if (error || !report) {
        return (
            <Card className={cn('bg-background border border-t-2 border-t-electric-blue', className)}>
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-electric-blue/10 rounded-md">
                            <BarChart3 className="h-5 w-5 text-electric-blue" />
                        </div>
                        <CardTitle className="font-display text-base text-foreground">
                            Daily Pulse
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">
                        Coming soon
                    </p>
                </CardContent>
            </Card>
        )
    }
    
    const data = report.data as DailyPulseData
    const significantTrends = report.trends.filter(t => t.trend !== 'stable')
    
    return (
        <Card className={cn('bg-background border border-t-2 border-t-electric-blue', className)}>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-electric-blue/10 rounded-md">
                            <BarChart3 className="h-5 w-5 text-electric-blue" />
                        </div>
                        <CardTitle className="font-display text-base text-foreground">
                            Daily Pulse
                        </CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                        {lastUpdated && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {lastUpdated.toLocaleTimeString([], { 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                })}
                            </span>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={fetchReport}
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            
            <CardContent className="pt-0 space-y-4">
                {/* Summary */}
                <p className="text-sm text-foreground leading-relaxed">
                    {report.summary}
                </p>
                
                {/* Stats Row */}
                <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">Completed:</span>
                        <span className="font-semibold text-foreground">
                            {data.personal.tasks_completed_count}
                        </span>
                        {significantTrends.length > 0 && significantTrends[0].metric === 'Your Tasks' && (
                            <TrendIndicator
                                trend={significantTrends[0].trend}
                                value={significantTrends[0].changePercent}
                                size="sm"
                            />
                        )}
                    </div>
                    
                    {isLeader && (
                        <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground">Team:</span>
                            <span className="font-semibold text-foreground">
                                {data.team.total_completed}
                            </span>
                            {significantTrends.length > 1 && significantTrends[1].metric === 'Team Tasks' && (
                                <TrendIndicator
                                    trend={significantTrends[1].trend}
                                    value={significantTrends[1].changePercent}
                                    size="sm"
                                />
                            )}
                        </div>
                    )}
                    
                    {data.personal.tasks_overdue > 0 && (
                        <div className="flex items-center gap-1.5 text-status-warning">
                            <span>Overdue:</span>
                            <span className="font-semibold">{data.personal.tasks_overdue}</span>
                        </div>
                    )}
                </div>
                
                {/* Leader Stats */}
                {isLeader && (data.blockers.length > 0 || data.pending_approvals.length > 0) && (
                    <div className="flex flex-wrap gap-4 text-sm pt-1 border-t border-muted">
                        {data.blockers.length > 0 && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">Blockers:</span>
                                <span className="font-semibold text-status-warning">
                                    {data.blockers.length}
                                </span>
                            </div>
                        )}
                        {data.pending_approvals.length > 0 && (
                            <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">Awaiting approval:</span>
                                <span className="font-semibold text-status-info">
                                    {data.pending_approvals.length}
                                </span>
                            </div>
                        )}
                    </div>
                )}
                
                {/* Insights */}
                {report.insights.length > 0 && (
                    <InsightList 
                        insights={report.insights} 
                        limit={2} 
                        compact 
                    />
                )}
            </CardContent>
        </Card>
    )
}

/**
 * Skeleton loader for DailyPulseWidget
 */
function DailyPulseWidgetSkeleton() {
    return (
        <Card className="bg-background border border-t-2 border-t-electric-blue">
            <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <Skeleton className="h-5 w-24" />
                </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
                <Skeleton className="h-12 w-full" />
                <div className="flex gap-4">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-20" />
                </div>
                <Skeleton className="h-16 w-full" />
            </CardContent>
        </Card>
    )
}

export { DailyPulseWidgetSkeleton }
