'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Calendar, MapPin, ArrowRight, Users, Video } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { getUpcomingGuildEvents, type GuildEvent } from '@/actions/guild-events'

/**
 * Dashboard widget showing the next 3 upcoming Guild events.
 * @description Drives awareness of Guild events from the main dashboard.
 */
export function UpcomingEvents() {
    const [events, setEvents] = useState<GuildEvent[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            const result = await getUpcomingGuildEvents(3)
            if (result.data) setEvents(result.data)
            setLoading(false)
        }
        load()
    }, [])

    if (loading) {
        return (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-orange-50/50 to-transparent">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-100 rounded-lg">
                            <Calendar className="w-5 h-5 text-international-orange" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">Guild Events</h2>
                            <p className="text-sm text-muted-foreground">Loading...</p>
                        </div>
                    </div>
                </div>
                <div className="p-6">
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-16 bg-muted/40 rounded-lg animate-pulse" />
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    if (events.length === 0) {
        return null
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-orange-50/50 to-transparent">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-100 rounded-lg">
                            <Calendar className="w-5 h-5 text-international-orange" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">Guild Events</h2>
                            <p className="text-sm text-muted-foreground">Upcoming O2O events</p>
                        </div>
                    </div>
                    <Link
                        href="/guild"
                        className="text-sm text-electric-blue hover:underline flex items-center gap-1"
                    >
                        View all <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>
            </div>

            {/* Event List */}
            <div className="p-6 space-y-3">
                {events.map(event => {
                    const eventDate = new Date(event.event_date)
                    return (
                        <Link
                            key={event.id}
                            href={`/guild/events/${event.id}`}
                            className="flex items-center gap-4 p-3 rounded-xl hover:bg-muted/50 transition-colors group"
                        >
                            {/* Date block */}
                            <div className="bg-muted rounded-lg p-2 text-center min-w-[52px]">
                                <p className="text-lg font-bold text-foreground leading-none">
                                    {eventDate.getDate()}
                                </p>
                                <p className="text-[10px] text-muted-foreground uppercase mt-0.5">
                                    {eventDate.toLocaleString('default', { month: 'short' })}
                                </p>
                            </div>

                            {/* Details */}
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground text-sm truncate group-hover:text-electric-blue transition-colors">
                                    {event.title}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                    {event.location_geo && (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                            <MapPin className="h-3 w-3 shrink-0" /> {event.location_geo}
                                        </span>
                                    )}
                                    {event.event_format === 'online' && (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Video className="h-3 w-3" /> Online
                                        </span>
                                    )}
                                </div>
                            </div>

                            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-electric-blue transition-colors shrink-0" />
                        </Link>
                    )
                })}
            </div>
        </div>
    )
}
