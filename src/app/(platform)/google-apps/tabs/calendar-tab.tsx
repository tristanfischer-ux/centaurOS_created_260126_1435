/**
 * CalendarTab -- Google Calendar events view.
 *
 * @description Shows upcoming calendar events with Today/Week/Month toggles,
 * Google Meet links, and a quick-create button that opens Google Calendar
 * in a new tab.
 *
 * @component
 */

'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GoogleErrorDisplay } from '../google-error-boundary'
import {
    Calendar,
    Clock,
    MapPin,
    Video,
    ExternalLink,
    Plus,
    Users,
    CalendarPlus,
} from 'lucide-react'
import { listUpcomingEvents } from '@/actions/google-calendar'
import { cn } from '@/lib/utils'

/** Type matching the CalendarEvent shape from server actions */
interface CalendarEvent {
    id: string
    summary: string
    description: string | null
    startTime: string
    endTime: string
    allDay: boolean
    location: string | null
    meetLink: string | null
    htmlLink: string | null
    attendees: Array<{ email: string; displayName: string | null; responseStatus: string | null }>
    colorId: string | null
}

interface CalendarTabProps {
    isEnabled: boolean
}

type TimeRange = 'today' | 'week' | 'month'

/** In-memory cache for calendar events */
const calendarCache = new Map<string, { events: CalendarEvent[]; timestamp: number }>()
const CACHE_TTL_MS = 30_000 // 30 seconds (calendar data changes frequently)

/**
 * Format a time range for display.
 */
function formatEventTime(startTime: string, endTime: string, allDay: boolean): string {
    if (allDay) return 'All day'

    const start = new Date(startTime)
    const end = new Date(endTime)

    const timeOpts: Intl.DateTimeFormatOptions = {
        hour: 'numeric',
        minute: '2-digit',
    }

    return `${start.toLocaleTimeString('en-US', timeOpts)} – ${end.toLocaleTimeString('en-US', timeOpts)}`
}

/**
 * Format a date for the section header.
 */
function formatDateHeader(dateStr: string): string {
    const date = new Date(dateStr)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow'

    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    })
}

/**
 * Group events by date for section rendering.
 */
function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
    const groups = new Map<string, CalendarEvent[]>()

    for (const event of events) {
        const dateKey = new Date(event.startTime).toDateString()
        const existing = groups.get(dateKey) || []
        existing.push(event)
        groups.set(dateKey, existing)
    }

    return groups
}

export function CalendarTab({ isEnabled }: CalendarTabProps) {
    const [events, setEvents] = useState<CalendarEvent[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [range, setRange] = useState<TimeRange>('week')

    const loadEvents = useCallback(async (timeRange: TimeRange) => {
        // Check cache first
        const cached = calendarCache.get(timeRange)
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            setEvents(cached.events)
            setIsLoading(false)
        }

        setIsLoading(true)
        setError(null)

        const result = await listUpcomingEvents(timeRange)

        if (result.error) {
            setError(result.error)
            setIsLoading(false)
            return
        }

        setEvents(result.events)
        setIsLoading(false)

        calendarCache.set(timeRange, { events: result.events, timestamp: Date.now() })
    }, [])

    // Initial load
    useEffect(() => {
        if (isEnabled) {
            loadEvents('week')
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEnabled])

    const handleRangeChange = useCallback((value: string) => {
        const newRange = value as TimeRange
        setRange(newRange)
        loadEvents(newRange)
    }, [loadEvents])

    if (!isEnabled) {
        return (
            <GoogleErrorDisplay
                error="Request had insufficient authentication scopes"
                feature="calendar"
            />
        )
    }

    if (error) {
        return (
            <GoogleErrorDisplay
                error={error}
                feature="calendar"
                onRetry={() => loadEvents(range)}
            />
        )
    }

    const groupedEvents = groupEventsByDate(events)

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <Tabs value={range} onValueChange={handleRangeChange}>
                    <TabsList>
                        <TabsTrigger value="today">Today</TabsTrigger>
                        <TabsTrigger value="week">This Week</TabsTrigger>
                        <TabsTrigger value="month">This Month</TabsTrigger>
                    </TabsList>
                </Tabs>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open('https://calendar.google.com/calendar/r/eventedit', '_blank', 'noopener,noreferrer')}
                    className="gap-1.5"
                >
                    <Plus className="h-3.5 w-3.5" />
                    <CalendarPlus className="h-3.5 w-3.5" />
                    New Event
                </Button>
            </div>

            {/* Events */}
            {isLoading && events.length === 0 ? (
                <div className="space-y-6">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="space-y-3">
                            <Skeleton className="h-5 w-32" />
                            <div className="space-y-2">
                                <Skeleton className="h-16 w-full rounded-lg" />
                                <Skeleton className="h-16 w-full rounded-lg" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
                    <h3 className="text-base font-semibold text-foreground mb-1">
                        No upcoming events
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm mb-4">
                        {range === 'today'
                            ? 'Your calendar is clear for today. Enjoy the focus time!'
                            : `No events scheduled for ${range === 'week' ? 'this week' : 'this month'}.`
                        }
                    </p>
                    <Button
                        variant="outline"
                        onClick={() => window.open('https://calendar.google.com/calendar/r/eventedit', '_blank', 'noopener,noreferrer')}
                    >
                        <Plus className="h-4 w-4 mr-2" />
                        Create an Event
                    </Button>
                </div>
            ) : (
                <div className="space-y-6">
                    {Array.from(groupedEvents.entries()).map(([dateKey, dayEvents]) => (
                        <div key={dateKey}>
                            {/* Date Header */}
                            <h3 className="text-sm font-semibold text-foreground mb-3">
                                {formatDateHeader(dayEvents[0].startTime)}
                            </h3>

                            {/* Events for this date */}
                            <div className="space-y-2">
                                {dayEvents.map((event) => (
                                    <div
                                        key={event.id}
                                        className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
                                    >
                                        {/* Time indicator */}
                                        <div className="flex flex-col items-center justify-center min-w-[48px] pt-0.5">
                                            {event.allDay ? (
                                                <span className="text-xs font-medium text-muted-foreground">
                                                    All day
                                                </span>
                                            ) : (
                                                <span className="text-xs font-medium text-foreground">
                                                    {new Date(event.startTime).toLocaleTimeString('en-US', {
                                                        hour: 'numeric',
                                                        minute: '2-digit',
                                                    })}
                                                </span>
                                            )}
                                        </div>

                                        {/* Color bar */}
                                        <div className="w-1 self-stretch rounded-full bg-international-orange shrink-0" />

                                        {/* Event details */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">
                                                {event.summary}
                                            </p>

                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                                                {/* Time range */}
                                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                    <Clock className="h-3 w-3" />
                                                    {formatEventTime(event.startTime, event.endTime, event.allDay)}
                                                </span>

                                                {/* Location */}
                                                {event.location && (
                                                    <span className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[200px]">
                                                        <MapPin className="h-3 w-3 shrink-0" />
                                                        {event.location}
                                                    </span>
                                                )}

                                                {/* Attendees count */}
                                                {event.attendees.length > 0 && (
                                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                        <Users className="h-3 w-3" />
                                                        {event.attendees.length}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1 shrink-0">
                                            {event.meetLink && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    asChild
                                                    className="h-8 gap-1.5 text-status-info"
                                                >
                                                    <a
                                                        href={event.meetLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        <Video className="h-3.5 w-3.5" />
                                                        <span className="hidden sm:inline">Join</span>
                                                    </a>
                                                </Button>
                                            )}
                                            {event.htmlLink && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    asChild
                                                    className={cn(
                                                        'h-8 w-8',
                                                        !event.meetLink && 'opacity-0 group-hover:opacity-100 transition-opacity'
                                                    )}
                                                >
                                                    <a
                                                        href={event.htmlLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        aria-label="Open in Google Calendar"
                                                    >
                                                        <ExternalLink className="h-3.5 w-3.5" />
                                                    </a>
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
