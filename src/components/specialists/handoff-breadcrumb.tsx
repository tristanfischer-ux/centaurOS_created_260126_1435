'use client'

/**
 * @file handoff-breadcrumb.tsx
 *
 * @description Renders a breadcrumb trail showing the specialist handoff
 * history. Past specialists are clickable to switch back.
 */

import Image from 'next/image'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getSpecialistById } from '@/lib/agents/specialists-config'
import type { HandoffTrailEntry } from '@/lib/agents/specialist-handoff-types'

interface HandoffBreadcrumbProps {
    /** The handoff trail (oldest first, current last) */
    trail: HandoffTrailEntry[]
    /** The current specialist name */
    currentName: string
    /** Called when a past specialist is clicked */
    onSwitchBack?: (specialistId: string) => void
    className?: string
}

/**
 * Renders the specialist handoff trail as a breadcrumb.
 */
export function HandoffBreadcrumb({
    trail,
    currentName,
    onSwitchBack,
    className,
}: HandoffBreadcrumbProps) {
    if (trail.length === 0) return null

    return (
        <nav aria-label="Specialist handoff trail" className={cn('flex items-center gap-1 flex-wrap', className)}>
            {trail.map((entry, idx) => {
                const specialist = getSpecialistById(entry.specialistId)
                return (
                    <div key={`${entry.specialistId}-${idx}`} className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => onSwitchBack?.(entry.specialistId)}
                            aria-label={`Switch back to ${entry.name}`}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-international-orange transition-colors"
                        >
                            {specialist?.avatarImage && (
                                <div className="relative h-4 w-4 rounded-full overflow-hidden flex-shrink-0">
                                    <Image
                                        src={specialist.avatarImage}
                                        alt={entry.name}
                                        fill
                                        unoptimized
                                        className="object-cover"
                                        sizes="16px"
                                    />
                                </div>
                            )}
                            <span>{entry.name}</span>
                        </button>
                        <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                    </div>
                )
            })}
            <span className="text-xs font-semibold text-foreground" aria-current="step">
                {currentName}
            </span>
        </nav>
    )
}
