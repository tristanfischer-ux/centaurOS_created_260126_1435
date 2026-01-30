'use client'

import { useState, useMemo, useTransition } from 'react'
import { format, isToday, isBefore, startOfDay, addDays, eachDayOfInterval } from 'date-fns'
import { 
    ChevronLeft, 
    ChevronRight, 
    Lock, 
    Calendar as CalendarIcon,
    Ban,
    CalendarCheck,
    Clock
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useAvailability } from '@/hooks/useAvailability'
import { formatTimezoneOffset, getTimezoneLabel } from '@/lib/availability/timezone'
import type { AvailabilityStatus } from '@/actions/availability'
import { toast } from 'sonner'

interface AvailabilityCalendarProps {
    providerId?: string
    readonly?: boolean
    onDateSelect?: (date: Date, status: AvailabilityStatus | null) => void
    showBulkActions?: boolean
    showQuickActions?: boolean
    showLegend?: boolean
    showTimezone?: boolean
    className?: string
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getStatusColor(status: AvailabilityStatus | null, isCurrentMonth: boolean): string {
    if (!isCurrentMonth) {
        return 'bg-muted text-slate-300'
    }
    
    switch (status) {
        case 'available':
            return 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-200'
        case 'booked':
            return 'bg-blue-100 text-blue-800 border cursor-not-allowed'
        case 'blocked':
            return 'bg-slate-200 text-muted-foreground hover:bg-slate-300 border-slate-300'
        default:
            // Default: treat as available (no slot = available)
            return 'bg-background text-foreground hover:bg-emerald-50 border-slate-200'
    }
}

function getStatusLabel(status: AvailabilityStatus | null): string {
    switch (status) {
        case 'available':
            return 'Available'
        case 'booked':
            return 'Booked'
        case 'blocked':
            return 'Blocked'
        default:
            return 'Open'
    }
}

export function AvailabilityCalendar({
    providerId,
    readonly = false,
    onDateSelect,
    showBulkActions = true,
    showQuickActions = true,
    showLegend = true,
    showTimezone = true,
    className
}: AvailabilityCalendarProps) {
    const {
        currentMonth,
        profile,
        isLoading,
        error,
        goToNextMonth,
        goToPreviousMonth,
        toggleDate,
        bulkSet,
        openMonth,
        blockMonth,
        getCalendarDays
    } = useAvailability({ providerId, autoFetch: true })

    const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
    const [isSelecting, setIsSelecting] = useState(false)
    const [isPending, startTransition] = useTransition()

    const calendarDays = useMemo(() => getCalendarDays(), [getCalendarDays])

    // Quick action: Block next N days
    const handleBlockNextDays = async (days: number) => {
        const today = startOfDay(new Date())
        const dates = eachDayOfInterval({
            start: today,
            end: addDays(today, days - 1)
        })
        
        startTransition(async () => {
            const result = await bulkSet(dates, 'blocked')
            if (result.success) {
                toast.success(`Blocked next ${days} days`)
            } else {
                toast.error(result.error || 'Failed to block dates')
            }
        })
    }

    // Quick action: Make next N days available
    const handleOpenNextDays = async (days: number) => {
        const today = startOfDay(new Date())
        const dates = eachDayOfInterval({
            start: today,
            end: addDays(today, days - 1)
        })
        
        startTransition(async () => {
            const result = await bulkSet(dates, 'available')
            if (result.success) {
                toast.success(`Made next ${days} days available`)
            } else {
                toast.error(result.error || 'Failed to update dates')
            }
        })
    }

    const handleDayClick = async (day: typeof calendarDays[0]) => {
        if (readonly) {
            onDateSelect?.(day.date, day.status)
            return
        }

        // Can't modify past dates or booked dates
        if (isBefore(day.date, startOfDay(new Date())) || day.isBooked) {
            return
        }

        if (!day.isCurrentMonth) return

        await toggleDate(day.date)
        onDateSelect?.(day.date, day.status)
    }

    const handleBulkOpen = async () => {
        await openMonth()
    }

    const handleBulkBlock = async () => {
        await blockMonth()
    }

    // Stats for current month
    const stats = useMemo(() => {
        const monthDays = calendarDays.filter(d => d.isCurrentMonth)
        return {
            available: monthDays.filter(d => d.status === 'available' || d.status === null).length,
            booked: monthDays.filter(d => d.status === 'booked').length,
            blocked: monthDays.filter(d => d.status === 'blocked').length,
            total: monthDays.length
        }
    }, [calendarDays])

    if (error) {
        return (
            <Card className={cn("border-red-100 bg-red-50/50", className)}>
                <CardContent className="pt-6">
                    <p className="text-red-600 text-center">{error}</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className={cn("", className)}>
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                            Availability Calendar
                        </CardTitle>
                        {showTimezone && profile?.timezone && (
                            <CardDescription className="mt-1 flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" />
                                {getTimezoneLabel(profile.timezone)} ({formatTimezoneOffset(profile.timezone)})
                            </CardDescription>
                        )}
                    </div>
                    
                    {/* Month Navigation */}
                    <div className="flex items-center gap-2">
                        <Button 
                            variant="secondary" 
                            size="icon"
                            onClick={goToPreviousMonth}
                            disabled={isLoading}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-lg font-semibold min-w-[160px] text-center">
                            {format(currentMonth, 'MMMM yyyy')}
                        </span>
                        <Button 
                            variant="secondary" 
                            size="icon"
                            onClick={goToNextMonth}
                            disabled={isLoading}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Quick Actions & Bulk Actions */}
                {(showBulkActions || showQuickActions) && !readonly && (
                    <div className="flex flex-wrap items-center gap-2 mt-4">
                        {/* Quick Actions Dropdown */}
                        {showQuickActions && (
                            <>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button 
                                            variant="secondary" 
                                            size="sm"
                                            disabled={isLoading || isPending}
                                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                        >
                                            <CalendarCheck className="h-4 w-4 mr-1.5" />
                                            Make Available
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        <DropdownMenuItem onClick={() => handleOpenNextDays(7)}>
                                            Next 7 days
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleOpenNextDays(14)}>
                                            Next 14 days
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleOpenNextDays(30)}>
                                            Next 30 days
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={handleBulkOpen}>
                                            Entire {format(currentMonth, 'MMMM')}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button 
                                            variant="secondary" 
                                            size="sm"
                                            disabled={isLoading || isPending}
                                            className="text-muted-foreground hover:text-foreground"
                                        >
                                            <Ban className="h-4 w-4 mr-1.5" />
                                            Block Dates
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        <DropdownMenuItem onClick={() => handleBlockNextDays(7)}>
                                            Next 7 days
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleBlockNextDays(14)}>
                                            Next 14 days
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleBlockNextDays(30)}>
                                            Next 30 days
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onClick={handleBulkBlock}>
                                            Entire {format(currentMonth, 'MMMM')}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </>
                        )}

                        {/* Legacy bulk actions (when quick actions disabled) */}
                        {showBulkActions && !showQuickActions && (
                            <>
                                <Button 
                                    variant="secondary" 
                                    size="sm"
                                    onClick={handleBulkOpen}
                                    disabled={isLoading || isPending}
                                    className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                >
                                    Open Entire Month
                                </Button>
                                <Button 
                                    variant="secondary" 
                                    size="sm"
                                    onClick={handleBulkBlock}
                                    disabled={isLoading || isPending}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    Block Entire Month
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </CardHeader>

            <CardContent>
                {/* Stats Bar */}
                <div className="flex gap-4 mb-4 text-sm">
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" />
                        <span className="text-muted-foreground">
                            Available: <strong>{stats.available}</strong>
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-blue-100 border border" />
                        <span className="text-muted-foreground">
                            Booked: <strong>{stats.booked}</strong>
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-slate-200 border border-slate-300" />
                        <span className="text-muted-foreground">
                            Blocked: <strong>{stats.blocked}</strong>
                        </span>
                    </div>
                </div>

                {/* Calendar Grid */}
                <div className="relative">
                    {(isLoading || isPending) && (
                        <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-10 rounded-lg">
                            <div className="animate-spin h-6 w-6 border-2 border-slate-300 border-t-slate-600 rounded-full" />
                        </div>
                    )}

                    {/* Weekday Headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {WEEKDAYS.map(day => (
                            <div 
                                key={day}
                                className="text-center text-sm font-medium text-muted-foreground py-2"
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Days Grid */}
                    <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((day) => {
                            const isPast = isBefore(day.date, startOfDay(new Date()))
                            const isClickable = !readonly && !isPast && !day.isBooked && day.isCurrentMonth

                            return (
                                <button
                                    key={day.dateStr}
                                    onClick={() => handleDayClick(day)}
                                    disabled={!isClickable}
                                    className={cn(
                                        "relative aspect-square p-1 rounded-lg border text-sm font-medium transition-all",
                                        getStatusColor(day.status, day.isCurrentMonth),
                                        isToday(day.date) && day.isCurrentMonth && "ring-2 ring-amber-400 ring-offset-1",
                                        isPast && day.isCurrentMonth && "opacity-50",
                                        isClickable && "cursor-pointer",
                                        !isClickable && "cursor-default"
                                    )}
                                >
                                    <span className="block text-center">
                                        {format(day.date, 'd')}
                                    </span>
                                    
                                    {/* Booked indicator */}
                                    {day.isBooked && (
                                        <Lock className="absolute top-0.5 right-0.5 h-3 w-3 text-blue-500" />
                                    )}

                                    {/* Today indicator */}
                                    {isToday(day.date) && day.isCurrentMonth && (
                                        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-amber-500 rounded-full" />
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Legend */}
                {showLegend && (
                    <div className="mt-6 pt-4 border-t border-slate-100">
                        <p className="text-xs text-muted-foreground">
                            <strong>Click</strong> on a day to toggle availability. 
                            <span className="inline-flex items-center gap-1 ml-2">
                                <Lock className="h-3 w-3" /> = Booked (cannot change)
                            </span>
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

// Mini calendar for marketplace preview
interface AvailabilityPreviewProps {
    providerId: string
    className?: string
}

export function AvailabilityPreview({ providerId, className }: AvailabilityPreviewProps) {
    const {
        currentMonth,
        isLoading,
        getCalendarDays
    } = useAvailability({ providerId, autoFetch: true })

    const calendarDays = useMemo(() => getCalendarDays(), [getCalendarDays])
    
    // Only show current month days
    const monthDays = calendarDays.filter(d => d.isCurrentMonth)
    
    // Calculate availability summary
    const available = monthDays.filter(d => 
        d.status === 'available' || d.status === null
    ).length
    const total = monthDays.length

    return (
        <Card className={cn("", className)}>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    Availability
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-center justify-between mb-3">
                    <span className="text-2xl font-bold text-emerald-600">
                        {available}
                    </span>
                    <span className="text-sm text-muted-foreground">
                        days available in {format(currentMonth, 'MMM')}
                    </span>
                </div>

                {/* Mini Grid Preview */}
                <div className="grid grid-cols-7 gap-0.5">
                    {monthDays.slice(0, 28).map((day) => (
                        <div
                            key={day.dateStr}
                            className={cn(
                                "aspect-square rounded-sm",
                                day.status === 'available' || day.status === null 
                                    ? 'bg-emerald-200' 
                                    : day.status === 'booked' 
                                        ? 'bg-blue-200' 
                                        : 'bg-slate-200'
                            )}
                        />
                    ))}
                </div>

                <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-sm bg-emerald-200" /> Available
                    </span>
                    <span className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-sm bg-blue-200" /> Booked
                    </span>
                    <span className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-sm bg-slate-200" /> Blocked
                    </span>
                </div>
            </CardContent>
        </Card>
    )
}

export default AvailabilityCalendar
