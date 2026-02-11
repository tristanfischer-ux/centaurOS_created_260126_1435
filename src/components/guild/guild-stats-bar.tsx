"use client"

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
}

// ==========================================
// COMPONENT
// ==========================================

/**
 * Quick stats bar showing Guild community health at a glance.
 *
 * @description Displays 4 key metrics in a responsive grid row.
 * Each stat card has an icon, a bold number, and a short label.
 * Adds visual weight to the page and communicates community activity.
 *
 * @component
 *
 * @example
 * <GuildStatsBar
 *   upcomingEvents={5}
 *   totalMembers={24}
 *   totalAttending={12}
 *   eventsThisMonth={3}
 * />
 */
export function GuildStatsBar({
    upcomingEvents,
    totalMembers,
    totalAttending,
    eventsThisMonth,
}: GuildStatsBarProps) {
    const stats: StatItem[] = [
        { label: "Upcoming Events", value: upcomingEvents, icon: Calendar },
        { label: "Guild Members", value: totalMembers, icon: Users },
        { label: "RSVPs", value: totalAttending, icon: UserCheck },
        { label: "This Month", value: eventsThisMonth, icon: CalendarRange },
    ]

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat) => {
                const Icon = stat.icon
                return (
                    <Card key={stat.label} className="p-4 border">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-international-orange-light shrink-0">
                                <Icon className="h-4 w-4 text-international-orange" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-2xl font-bold text-foreground leading-none">
                                    {stat.value}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1 truncate">
                                    {stat.label}
                                </p>
                            </div>
                        </div>
                    </Card>
                )
            })}
        </div>
    )
}
