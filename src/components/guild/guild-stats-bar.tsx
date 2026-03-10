"use client"

import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import {
    Calendar,
    Users,
    UserCheck,
    CalendarRange,
} from "lucide-react"

// ==========================================
// TYPES
// ==========================================

interface StatItem {
    label: string
    value: number
    icon: typeof Calendar
    zeroText: string
    clickAction?: string
}

interface GuildStatsBarProps {
    /** Number of upcoming events */
    upcomingEvents: number
    /** Number of active Guild members */
    totalMembers: number
    /** Number of people with RSVPs for upcoming events */
    totalAttending: number
    /** Number of events this month */
    eventsThisMonth: number
    /** Callback when a stat card is clicked */
    onStatClick?: (action: string) => void
}

// ==========================================
// HOOKS
// ==========================================

/**
 * Animates a number from 0 to target over duration ms.
 */
function useCountUp(target: number, duration: number = 400): number {
    const [current, setCurrent] = useState(0)
    const rafRef = useRef<number>(0)

    useEffect(() => {
        if (target === 0) {
            setCurrent(0)
            return
        }

        const startTime = performance.now()
        const animate = (now: number) => {
            const elapsed = now - startTime
            const progress = Math.min(elapsed / duration, 1)
            // Ease-out quad
            const eased = 1 - (1 - progress) * (1 - progress)
            setCurrent(Math.round(eased * target))

            if (progress < 1) {
                rafRef.current = requestAnimationFrame(animate)
            }
        }

        rafRef.current = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(rafRef.current)
    }, [target, duration])

    return current
}

// ==========================================
// COMPONENT
// ==========================================

/**
 * Quick stats bar showing Guild community health at a glance.
 *
 * @description Displays 4 key metrics with count-up animation,
 * contextual zero-state text, and clickable stat cards.
 */
export function GuildStatsBar({
    upcomingEvents,
    totalMembers,
    totalAttending,
    eventsThisMonth,
    onStatClick,
}: GuildStatsBarProps) {
    const stats: StatItem[] = [
        { label: "Upcoming Events", value: upcomingEvents, icon: Calendar, zeroText: "None scheduled", clickAction: "events" },
        { label: "Guild Members", value: totalMembers, icon: Users, zeroText: "Invite your team", clickAction: "network" },
        { label: "RSVPs", value: totalAttending, icon: UserCheck, zeroText: "Be the first to RSVP", clickAction: "events" },
        { label: "This Month", value: eventsThisMonth, icon: CalendarRange, zeroText: "No events yet", clickAction: "events" },
    ]

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat) => (
                <AnimatedStatCard key={stat.label} stat={stat} onStatClick={onStatClick} />
            ))}
        </div>
    )
}

function AnimatedStatCard({ stat, onStatClick }: { stat: StatItem; onStatClick?: (action: string) => void }) {
    const animatedValue = useCountUp(stat.value)
    const Icon = stat.icon
    const isClickable = !!onStatClick && !!stat.clickAction

    return (
        <Card
            className={`p-4 border ${isClickable ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200" : ""}`}
            onClick={() => isClickable && onStatClick!(stat.clickAction!)}
        >
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-international-orange-light shrink-0">
                    <Icon className="h-4 w-4 text-international-orange" />
                </div>
                <div className="min-w-0">
                    <p className="text-2xl font-bold text-foreground leading-none">
                        {animatedValue}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                        {stat.label}
                    </p>
                    {stat.value === 0 && (
                        <p className="text-[10px] text-muted-foreground/70 truncate">
                            {stat.zeroText}
                        </p>
                    )}
                </div>
            </div>
        </Card>
    )
}
