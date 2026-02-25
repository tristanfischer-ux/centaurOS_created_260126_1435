'use client'

/**
 * @file outreach-dashboard.tsx — Outreach pipeline dashboard.
 *
 * @description Shows pipeline funnel and quick stats for the outreach workflow.
 * Provides a data-oriented view complementing the campaign-based list.
 */

import { useState, useEffect, useCallback, useTransition } from 'react'
import {
    Database,
    Megaphone,
    Users,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { getOutreachDashboard } from '@/actions/outreach-dashboard'
import type { DashboardData, PipelineStats } from '@/actions/outreach-dashboard'
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

// ─── Main component ──────────────────────────────────────────────────────────

export function OutreachDashboard() {
    const [data, setData] = useState<DashboardData | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [, startTransition] = useTransition()

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

        </div>
    )
}
