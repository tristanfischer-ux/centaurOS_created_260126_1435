'use client'

/**
 * @file outreach-dashboard.tsx — "What to do next" dashboard for outreach.
 *
 * @description Shows pipeline funnel, prioritised action cards, and quick stats.
 * Provides a task-oriented view complementing the campaign-based list.
 */

import { useState, useEffect, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
    ArrowRight,
    Database,
    Download,
    Mail,
    MessageSquare,
    Megaphone,
    Send,
    Users,
    Wand2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getOutreachDashboard } from '@/actions/outreach-dashboard'
import type { DashboardData, NextAction, PipelineStats } from '@/actions/outreach-dashboard'
import { cn } from '@/lib/utils'

// ─── Pipeline funnel ─────────────────────────────────────────────────────────

const PIPELINE_STAGES: Array<{
    key: keyof PipelineStats
    label: string
    color: string
    bgColor: string
}> = [
    { key: 'total', label: 'Total', color: 'text-foreground', bgColor: 'bg-muted' },
    { key: 'enriched', label: 'Enriched', color: 'text-info', bgColor: 'bg-info/10' },
    { key: 'ready', label: 'Ready', color: 'text-success', bgColor: 'bg-success/10' },
    { key: 'imported', label: 'Imported', color: 'text-info', bgColor: 'bg-info/10' },
    { key: 'contacted', label: 'Contacted', color: 'text-warning', bgColor: 'bg-warning/10' },
    { key: 'replied', label: 'Replied', color: 'text-success', bgColor: 'bg-success/10' },
    { key: 'claimed', label: 'Claimed', color: 'text-success', bgColor: 'bg-success/10' },
    { key: 'onboarded', label: 'Onboarded', color: 'text-international-orange', bgColor: 'bg-international-orange/10' },
]

// ─── Action card icons ───────────────────────────────────────────────────────

const ACTION_ICONS: Record<NextAction['type'], React.ReactNode> = {
    enrich: <Database className="h-5 w-5" />,
    import: <Download className="h-5 w-5" />,
    generate: <Wand2 className="h-5 w-5" />,
    send: <Send className="h-5 w-5" />,
    follow_up: <Mail className="h-5 w-5" />,
    review_reply: <MessageSquare className="h-5 w-5" />,
}

const PRIORITY_STYLES: Record<string, string> = {
    high: 'border-l-international-orange',
    medium: 'border-l-warning',
    low: 'border-l-border',
}

// ─── Main component ──────────────────────────────────────────────────────────

export function OutreachDashboard() {
    const router = useRouter()
    const [data, setData] = useState<DashboardData | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isPending, startTransition] = useTransition()

    const loadDashboard = useCallback(async () => {
        startTransition(async () => {
            const result = await getOutreachDashboard()
            if (result.data) {
                setData(result.data)
            }
            setIsLoading(false)
        })
    }, [])

    useEffect(() => {
        loadDashboard()
    }, [loadDashboard])

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
                    ))}
                </div>
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
                    ))}
                </div>
            </div>
        )
    }

    if (!data) return null

    return (
        <div className="space-y-8">
            {/* Pipeline funnel */}
            <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Pipeline</h3>
                <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
                    {PIPELINE_STAGES.map(stage => (
                        <Card key={stage.key} className="overflow-hidden">
                            <CardContent className={cn('p-3 text-center', stage.bgColor)}>
                                <p className={cn('text-xl font-bold', stage.color)}>
                                    {data.pipeline[stage.key]}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">{stage.label}</p>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Quick stats row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="flex items-center gap-3 p-4">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-international-orange/10">
                            <Megaphone className="h-5 w-5 text-international-orange" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-foreground">{data.campaignCount}</p>
                            <p className="text-xs text-muted-foreground">Active Campaigns</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="flex items-center gap-3 p-4">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-info/10">
                            <Users className="h-5 w-5 text-info" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-foreground">{data.totalOutreachContacts}</p>
                            <p className="text-xs text-muted-foreground">Campaign Contacts</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="flex items-center gap-3 p-4">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-success/10">
                            <Database className="h-5 w-5 text-success" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-foreground">{data.pipeline.enriched}</p>
                            <p className="text-xs text-muted-foreground">Companies with Emails</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Next actions */}
            {data.nextActions.length > 0 && (
                <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">What to Do Next</h3>
                    <div className="space-y-3">
                        {data.nextActions.map((action, i) => (
                            <Card
                                key={i}
                                className={cn(
                                    'border-l-4 hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 cursor-pointer',
                                    PRIORITY_STYLES[action.priority]
                                )}
                                onClick={() => router.push(action.actionUrl)}
                            >
                                <CardContent className="flex items-center gap-4 p-4">
                                    <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted shrink-0">
                                        {ACTION_ICONS[action.type]}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-semibold text-foreground">
                                                {action.title}
                                            </p>
                                            {action.priority === 'high' && (
                                                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-international-orange/10 text-international-orange uppercase">
                                                    Priority
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {action.description}
                                        </p>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {data.nextActions.length === 0 && (
                <Card>
                    <CardContent className="p-8 text-center">
                        <p className="text-sm text-muted-foreground">
                            No pending actions. Start by enriching companies or creating a campaign.
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
