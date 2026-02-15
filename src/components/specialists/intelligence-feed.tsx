'use client'

/**
 * IntelligenceFeed - Displays a feed of intelligence reports from specialist sweeps.
 *
 * @description Fetches and renders intelligence reports with filtering by urgency.
 * Includes a trigger button for manual sweeps and empty state guidance.
 *
 * @component
 *
 * @example
 * <IntelligenceFeed onDiscuss={(specialistId, title) => openChat(specialistId)} />
 */

import { useEffect, useState, useCallback } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Brain,
    Loader2,
    Radio,
    Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import { IntelligenceReportCard } from './intelligence-report-card'
import {
    getIntelligenceReports,
    triggerIntelligenceSweep,
} from '@/actions/intelligence'

import type { IntelligenceReportView } from '@/actions/intelligence'

// ─── Types ──────────────────────────────────────────────────────────

type UrgencyFilter = 'all' | 'immediate' | 'this_week' | 'monitor'

interface IntelligenceFeedProps {
    /** Called when user wants to discuss a report with a specialist */
    onDiscuss?: (specialistId: string, reportTitle: string) => void
    /** Additional CSS classes */
    className?: string
}

// ─── Component ──────────────────────────────────────────────────────

export function IntelligenceFeed({
    onDiscuss,
    className,
}: IntelligenceFeedProps): React.JSX.Element {
    const [reports, setReports] = useState<IntelligenceReportView[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSweeping, setIsSweeping] = useState(false)
    const [filter, setFilter] = useState<UrgencyFilter>('all')

    const loadReports = useCallback(async (): Promise<void> => {
        setIsLoading(true)
        try {
            const urgencyFilter = filter === 'all'
                ? undefined
                : (filter as 'immediate' | 'this_week' | 'monitor')
            const data = await getIntelligenceReports(20, urgencyFilter)
            setReports(data)
        } catch (err) {
            console.error('[IntelligenceFeed] Failed to load reports:', {
                error: err instanceof Error ? err.message : 'Unknown error',
            })
        } finally {
            setIsLoading(false)
        }
    }, [filter])

    useEffect(() => {
        void loadReports()
    }, [loadReports])

    const handleSweep = async (): Promise<void> => {
        setIsSweeping(true)
        try {
            const result = await triggerIntelligenceSweep()
            if (result.success) {
                toast.success(
                    `Intelligence sweep complete. ${result.reportsGenerated} new report${result.reportsGenerated === 1 ? '' : 's'}.`,
                )
                await loadReports()
            } else {
                toast.error('Sweep failed. Please try again.')
            }
        } catch {
            toast.error('Sweep failed. Please try again.')
        } finally {
            setIsSweeping(false)
        }
    }

    const unreadCount = reports.filter(r => !r.isRead).length
    const urgentCount = reports.filter(r => r.urgency === 'immediate' && !r.isRead).length

    return (
        <div className={cn('space-y-4', className)}>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-international-orange" />
                    <h2 className="text-lg font-semibold text-foreground">
                        Intelligence Feed
                    </h2>
                    {unreadCount > 0 && (
                        <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-international-orange text-white text-xs font-semibold">
                            {unreadCount}
                        </span>
                    )}
                    {urgentCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium">
                            <Zap className="h-3 w-3" />
                            {urgentCount} urgent
                        </span>
                    )}
                </div>

                <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSweep}
                    disabled={isSweeping}
                >
                    {isSweeping ? (
                        <>
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            Scanning...
                        </>
                    ) : (
                        <>
                            <Radio className="h-3.5 w-3.5 mr-1.5" />
                            Run Sweep
                        </>
                    )}
                </Button>
            </div>

            {/* Urgency filter tabs */}
            <Tabs
                value={filter}
                onValueChange={(v) => setFilter(v as UrgencyFilter)}
            >
                <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="immediate">Urgent</TabsTrigger>
                    <TabsTrigger value="this_week">This Week</TabsTrigger>
                    <TabsTrigger value="monitor">Monitor</TabsTrigger>
                </TabsList>
            </Tabs>

            {/* Report list */}
            {isLoading ? (
                <div className="space-y-3">
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                    <Skeleton className="h-24 w-full" />
                </div>
            ) : reports.length === 0 ? (
                <Card>
                    <CardContent className="pt-8 pb-8">
                        <div className="flex flex-col items-center justify-center text-center space-y-3">
                            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                                <Brain className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">
                                    No intelligence reports yet
                                </h3>
                                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                                    Run an intelligence sweep to have your specialists analyze
                                    your company&apos;s external landscape.
                                </p>
                            </div>
                            <Button
                                variant="default"
                                size="sm"
                                onClick={handleSweep}
                                disabled={isSweeping}
                            >
                                {isSweeping ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                        Scanning...
                                    </>
                                ) : (
                                    <>
                                        <Radio className="h-3.5 w-3.5 mr-1.5" />
                                        Run First Sweep
                                    </>
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {reports.map(report => (
                        <IntelligenceReportCard
                            key={report.id}
                            report={report}
                            onDiscuss={onDiscuss}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}
