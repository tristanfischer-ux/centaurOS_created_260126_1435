'use client'

/**
 * IntelligenceReportCard - Displays a single intelligence report from a specialist.
 *
 * @description Renders a card with the report title, summary, implications,
 * recommended actions, and urgency level. Includes the specialist who generated
 * the report and actions to mark as read or discuss.
 *
 * @component
 *
 * @example
 * <IntelligenceReportCard
 *   report={report}
 *   onDiscuss={(specialistId, title) => openChat(specialistId)}
 * />
 */

import { useState } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { UserAvatar } from '@/components/ui/user-avatar'
import {
    AlertTriangle,
    Calendar,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Eye,
    Lightbulb,
    MessageSquare,
    Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'

import { getSpecialistById } from '@/app/(platform)/agents/specialists-data'
import { markReportRead } from '@/actions/intelligence'

import type { IntelligenceReportView } from '@/actions/intelligence'

// ─── Urgency Configuration ──────────────────────────────────────────

interface UrgencyConfig {
    label: string
    status: 'error' | 'warning' | 'info'
    icon: React.ElementType
    borderClass: string
}

const URGENCY_CONFIG = {
    immediate: {
        label: 'Urgent',
        status: 'error',
        icon: AlertTriangle,
        borderClass: 'border-l-4 border-l-destructive',
    },
    this_week: {
        label: 'This Week',
        status: 'warning',
        icon: Calendar,
        borderClass: 'border-l-4 border-l-status-warning',
    },
    monitor: {
        label: 'Monitor',
        status: 'info',
        icon: Eye,
        borderClass: 'border-l-4 border-l-status-info',
    },
} satisfies Record<string, UrgencyConfig>

// ─── Props ──────────────────────────────────────────────────────────

interface IntelligenceReportCardProps {
    /** The intelligence report to display */
    report: IntelligenceReportView
    /** Called when user wants to discuss with the specialist */
    onDiscuss?: (specialistId: string, reportTitle: string) => void
    /** Additional CSS classes */
    className?: string
}

// ─── Component ──────────────────────────────────────────────────────

export function IntelligenceReportCard({
    report,
    onDiscuss,
    className,
}: IntelligenceReportCardProps): React.JSX.Element {
    const [isExpanded, setIsExpanded] = useState(false)
    const [isRead, setIsRead] = useState(report.isRead)

    const specialist = getSpecialistById(report.specialistId)
    const urgencyConfig = URGENCY_CONFIG[report.urgency]

    const handleMarkRead = async (): Promise<void> => {
        setIsRead(true)
        await markReportRead(report.id)
    }

    const timeAgo = getTimeAgo(report.createdAt)

    return (
        <Card
            className={cn(
                'transition-all duration-200',
                urgencyConfig.borderClass,
                !isRead && 'bg-muted/30',
                className,
            )}
        >
            <CardContent className="pt-4 pb-3">
                {/* Header: specialist avatar, title, urgency badge, expand toggle */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                        {specialist && (
                            <UserAvatar
                                name={specialist.name}
                                role="AI_Agent"
                                size="sm"
                            />
                        )}
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-semibold text-foreground truncate">
                                    {report.title}
                                </h3>
                                <StatusBadge status={urgencyConfig.status} size="sm">
                                    {urgencyConfig.label}
                                </StatusBadge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {specialist?.name ?? report.specialistId} &middot; {timeAgo}
                            </p>
                        </div>
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsExpanded(!isExpanded)}
                        aria-label={isExpanded ? 'Collapse report' : 'Expand report'}
                        className="shrink-0"
                    >
                        {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                        ) : (
                            <ChevronDown className="h-4 w-4" />
                        )}
                    </Button>
                </div>

                {/* Summary - always visible */}
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                    {report.summary}
                </p>

                {/* Expanded: implications + recommended actions */}
                {isExpanded && (
                    <div className="mt-4 space-y-3">
                        {/* Implications */}
                        {report.implications.length > 0 && (
                            <div>
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <Lightbulb className="h-3.5 w-3.5 text-status-warning" />
                                    <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                        Implications
                                    </span>
                                </div>
                                <ul className="space-y-1">
                                    {report.implications.map((imp, i) => (
                                        <li
                                            key={i}
                                            className="text-sm text-muted-foreground flex items-start gap-2"
                                        >
                                            <span className="text-muted-foreground mt-1.5 shrink-0">
                                                &bull;
                                            </span>
                                            {imp}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Recommended Actions */}
                        {report.recommendedActions.length > 0 && (
                            <div>
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <Target className="h-3.5 w-3.5 text-status-success" />
                                    <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                                        Recommended Actions
                                    </span>
                                </div>
                                <ul className="space-y-1">
                                    {report.recommendedActions.map((action, i) => (
                                        <li
                                            key={i}
                                            className="text-sm text-muted-foreground flex items-start gap-2"
                                        >
                                            <CheckCircle2 className="h-3.5 w-3.5 text-status-success mt-0.5 shrink-0" />
                                            {action}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}

                {/* Actions footer */}
                <div className="flex items-center gap-2 mt-3 pt-2 border-t">
                    {!isRead && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleMarkRead}
                            className="text-xs"
                        >
                            <Eye className="h-3.5 w-3.5 mr-1.5" />
                            Mark Read
                        </Button>
                    )}
                    {onDiscuss && specialist && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onDiscuss(report.specialistId, report.title)}
                            className="text-xs"
                        >
                            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                            Discuss with {specialist.name}
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Formats a timestamp into a human-readable "time ago" string.
 *
 * @param dateStr - ISO date string
 * @returns Formatted relative time (e.g. "5m ago", "2h ago", "3d ago")
 */
function getTimeAgo(dateStr: string): string {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
}
