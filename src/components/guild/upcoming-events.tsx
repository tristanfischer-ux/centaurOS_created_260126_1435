'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Calendar, MapPin, ArrowRight, Video } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { getUpcomingGuildEvents, type GuildEvent } from '@/actions/guild-events'

/**
 * Widget showing the next 3 upcoming Guild events.
 *
 * @description Designed to be embedded in the Guild page header or Updates page
 * to drive awareness of upcoming community events.
 */
export function UpcomingEvents() {
    const [events, setEvents] = useState<GuildEvent[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load(): Promise<void> {
            try {
                const result = await getUpcomingGuildEvents(3)
                if (result.data) setEvents(result.data)
            } catch (err) {
                console.error('[UpcomingEvents] Failed to load events:', err instanceof Error ? err.message : 'Unknown error')
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    if (loading) {
        return (
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-3 text-lg">
                        <div className="p-2 bg-international-orange-light rounded-lg">
                            <Calendar className="w-5 h-5 text-international-orange" />
                        </div>
                        Guild Events
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => (
                            <Skeleton key={i} className="h-16 w-full" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        )
    }

    if (events.length === 0) {
        return null
    }

    return (
        <Card>
            {/* Header */}
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-3 text-lg">
                        <div className="p-2 bg-international-orange-light rounded-lg">
                            <Calendar className="w-5 h-5 text-international-orange" />
                        </div>
                        Guild Events
                    </CardTitle>
                    <Link
                        href="/guild"
                        className="text-sm text-electric-blue hover:underline flex items-center gap-1"
                    >
                        View all <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>
                <p className="text-sm text-muted-foreground mt-1">Upcoming O2O events</p>
            </CardHeader>

            {/* Event List */}
            <CardContent className="space-y-3">
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
                                <p className="text-xs text-muted-foreground uppercase mt-0.5">
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
            </CardContent>
        </Card>
    )
}
