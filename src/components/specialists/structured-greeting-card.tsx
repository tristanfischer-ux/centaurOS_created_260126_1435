'use client'

/**
 * @file structured-greeting-card.tsx
 *
 * @description Renders structured greeting sections from a specialist
 * as distinct mini-cards with icons and discussion CTAs.
 */

import { Clock, Users, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { cn } from '@/lib/utils'

export interface GreetingSection {
    type: 'since_last_talk' | 'cross_specialist' | 'at_risk'
    content: string
}

const SECTION_CONFIG: Record<GreetingSection['type'], {
    icon: typeof Clock
    label: string
    borderClass: string
    bgClass: string
}> = {
    since_last_talk: {
        icon: Clock,
        label: 'Since we last talked',
        borderClass: 'border-l-status-info',
        bgClass: 'bg-status-info-light/20',
    },
    cross_specialist: {
        icon: Users,
        label: 'From the team',
        borderClass: 'border-l-international-orange',
        bgClass: 'bg-international-orange/5',
    },
    at_risk: {
        icon: AlertTriangle,
        label: 'Needs attention',
        borderClass: 'border-l-destructive',
        bgClass: 'bg-destructive/5',
    },
}

/**
 * Parses greeting sections from HTML comments in the greeting text.
 *
 * @param greetingText - The raw greeting response
 * @returns Object with parsed sections and the remaining text
 */
export function parseGreetingSections(greetingText: string): {
    sections: GreetingSection[]
    remainingText: string
} {
    const sections: GreetingSection[] = []
    let remaining = greetingText

    const patterns: Array<{ regex: RegExp; type: GreetingSection['type'] }> = [
        { regex: /<!--\s*SINCE_LAST_TALK:\s*([\s\S]*?)-->/gi, type: 'since_last_talk' },
        { regex: /<!--\s*CROSS_SPECIALIST:\s*([\s\S]*?)-->/gi, type: 'cross_specialist' },
        { regex: /<!--\s*AT_RISK:\s*([\s\S]*?)-->/gi, type: 'at_risk' },
    ]

    for (const { regex, type } of patterns) {
        let match: RegExpExecArray | null
        while ((match = regex.exec(greetingText)) !== null) {
            const content = match[1].trim()
            if (content) {
                sections.push({ type, content })
            }
            remaining = remaining.replace(match[0], '')
        }
    }

    return { sections, remainingText: remaining.trim() }
}

interface StructuredGreetingCardProps {
    sections: GreetingSection[]
    onDiscuss?: (content: string) => void
    className?: string
}

/**
 * Renders greeting sections as mini-cards with discussion CTAs.
 */
export function StructuredGreetingCard({
    sections,
    onDiscuss,
    className,
}: StructuredGreetingCardProps) {
    if (sections.length === 0) return null

    return (
        <div className={cn('space-y-2', className)}>
            {sections.map((section, idx) => {
                const config = SECTION_CONFIG[section.type]
                const Icon = config.icon
                return (
                    <div
                        key={`${section.type}-${idx}`}
                        className={cn(
                            'rounded-lg border-l-4 p-3',
                            config.borderClass,
                            config.bgClass,
                        )}
                    >
                        <div className="flex items-center gap-1.5 mb-1.5">
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {config.label}
                            </span>
                        </div>
                        <div className="text-sm">
                            <Markdown content={section.content} className="text-sm" />
                        </div>
                        {onDiscuss && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onDiscuss(section.content)}
                                className="mt-2 h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                            >
                                Discuss this
                            </Button>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
