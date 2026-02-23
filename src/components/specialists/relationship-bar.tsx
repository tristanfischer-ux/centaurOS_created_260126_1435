'use client'

/**
 * @file relationship-bar.tsx
 *
 * @description Compact bar showing the relationship depth between
 * the founder and a specialist. Rendered below the specialist name
 * in the dialog/panel header.
 */

import { Badge } from '@/components/ui/badge'
import { MessageSquare, Scale, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TrustLevel = 'new' | 'building' | 'established' | 'deep'

export interface RelationshipSummary {
    level: TrustLevel
    conversationCount: number
    decisionsCount: number
    lastConversationDate: string | null
    mood: string | null
}

const TRUST_CONFIG: Record<TrustLevel, { label: string; className: string }> = {
    new: { label: 'New', className: 'bg-muted text-muted-foreground' },
    building: { label: 'Building', className: 'bg-status-info-light text-status-info' },
    established: { label: 'Established', className: 'bg-success/10 text-success' },
    deep: { label: 'Deep Trust', className: 'bg-international-orange/10 text-international-orange' },
}

interface RelationshipBarProps {
    summary: RelationshipSummary
    className?: string
}

/**
 * Renders a compact relationship indicator below the specialist name.
 */
export function RelationshipBar({ summary, className }: RelationshipBarProps) {
    const config = TRUST_CONFIG[summary.level]

    const lastTalked = summary.lastConversationDate
        ? formatRelativeDate(summary.lastConversationDate)
        : null

    return (
        <div className={cn('flex items-center gap-2 flex-wrap', className)}>
            <Badge className={cn('text-[10px] font-medium', config.className)}>
                {config.label}
            </Badge>
            {summary.conversationCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <MessageSquare className="h-2.5 w-2.5" />
                    {summary.conversationCount} chat{summary.conversationCount !== 1 ? 's' : ''}
                </span>
            )}
            {summary.decisionsCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Scale className="h-2.5 w-2.5" />
                    {summary.decisionsCount} decision{summary.decisionsCount !== 1 ? 's' : ''}
                </span>
            )}
            {lastTalked && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    {lastTalked}
                </span>
            )}
        </div>
    )
}

function formatRelativeDate(dateStr: string): string {
    const now = Date.now()
    const then = new Date(dateStr).getTime()
    const diffMs = now - then
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffDays === 0) return 'today'
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    return `${Math.floor(diffDays / 30)}mo ago`
}
