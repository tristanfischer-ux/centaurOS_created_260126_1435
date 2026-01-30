'use client'

import { useState, useMemo, useEffect } from 'react'
import { format, addDays, isBefore, isAfter, startOfDay, eachDayOfInterval, differenceInDays, isSameDay } from 'date-fns'
import { Calendar, CalendarCheck, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DateSelection } from '@/types/booking'
import type { AvailabilitySlot } from '@/actions/availability'

interface DateSelectorProps {
    providerId: string
    availabilitySlots?: AvailabilitySlot[]
    minimumDays?: number
    dayRate?: number
    currency?: string
    selectedDates: DateSelection
    onDatesChange: (dates: DateSelection) => void
    disabled?: boolean
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getMonthDays(year: number, month: number) {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days: { date: Date; isCurrentMonth: boolean }[] = []

    // Get the day of week for the first day (0 = Sunday, adjust for Monday start)
    let startOffset = firstDay.getDay() - 1
    if (startOffset < 0) startOffset = 6

    // Add days from previous month
    for (let i = startOffset - 1; i >= 0; i--) {
        days.push({
            date: addDays(firstDay, -i - 1),
            isCurrentMonth: false
        })
    }

    // Add days from current month
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
        days.push({
            date: new Date(d),
            isCurrentMonth: true
        })
    }

    // Add days from next month to complete the grid
    const remaining = 42 - days.length // 6 rows * 7 days
    for (let i = 1; i <= remaining; i++) {
        days.push({
            date: addDays(lastDay, i),
            isCurrentMonth: false
        })
    }

    return days
}

export function DateSelector({
    providerId,
    availabilitySlots = [],
    minimumDays = 1,
    dayRate,
    currency = 'GBP',
    selectedDates,
    onDatesChange,
    disabled = false
}: DateSelectorProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [selectionStart, setSelectionStart] = useState<Date | null>(null)
    const [hoveredDate, setHoveredDate] = useState<Date | null>(null)

    const today = startOfDay(new Date())

    // Build availability map
    const availabilityMap = useMemo(() => {
        const map = new Map<string, AvailabilitySlot>()
        availabilitySlots.forEach(slot => {
            map.set(slot.date, slot)
        })
        return map
    }, [availabilitySlots])

    // Get calendar days
    const calendarDays = useMemo(() => {
        return getMonthDays(currentMonth.getFullYear(), currentMonth.getMonth())
    }, [currentMonth])

    // Check if a date is available
    const isDateAvailable = (date: Date): boolean => {
        if (isBefore(date, today)) return false
        const dateStr = format(date, 'yyyy-MM-dd')
        const slot = availabilityMap.get(dateStr)
        // If no slot exists, it's available by default
        // If slot exists and status is 'available' or null, it's available
        // If status is 'booked' or 'blocked', it's not available
        if (!slot) return true
        return slot.status === 'available'
    }

    // Check if date is in selection range
    const isInRange = (date: Date): boolean => {
        if (!selectedDates.startDate || !selectedDates.endDate) return false
        return (
            (isAfter(date, selectedDates.startDate) || isSameDay(date, selectedDates.startDate)) &&
            (isBefore(date, selectedDates.endDate) || isSameDay(date, selectedDates.endDate))
        )
    }

    // Check if date is in hover preview range
    const isInPreviewRange = (date: Date): boolean => {
        if (!selectionStart || !hoveredDate || selectedDates.startDate) return false
        const start = isBefore(selectionStart, hoveredDate) ? selectionStart : hoveredDate
        const end = isAfter(selectionStart, hoveredDate) ? selectionStart : hoveredDate
        return (
            (isAfter(date, start) || isSameDay(date, start)) &&
            (isBefore(date, end) || isSameDay(date, end))
        )
    }

    // Handle date click
    const handleDateClick = (date: Date) => {
        if (disabled || !isDateAvailable(date)) return

        if (!selectionStart) {
            // First click - start selection
            setSelectionStart(date)
            onDatesChange({
                startDate: null,
                endDate: null,
                selectedDates: [],
                numberOfDays: 0,
                isValid: false,
                validationMessage: 'Select an end date'
            })
        } else {
            // Second click - complete selection
            const start = isBefore(selectionStart, date) ? selectionStart : date
            const end = isAfter(selectionStart, date) ? selectionStart : date

            // Get all dates in range
            const allDates = eachDayOfInterval({ start, end })
            
            // Check if all dates are available
            const unavailableDates = allDates.filter(d => !isDateAvailable(d))
            
            if (unavailableDates.length > 0) {
                onDatesChange({
                    startDate: null,
                    endDate: null,
                    selectedDates: [],
                    numberOfDays: 0,
                    isValid: false,
                    validationMessage: `${unavailableDates.length} date(s) in your selection are not available`
                })
                setSelectionStart(null)
                return
            }

            const numberOfDays = differenceInDays(end, start) + 1

            // Check minimum days
            if (numberOfDays < minimumDays) {
                onDatesChange({
                    startDate: start,
                    endDate: end,
                    selectedDates: allDates,
                    numberOfDays,
                    isValid: false,
                    validationMessage: `Minimum booking is ${minimumDays} day${minimumDays > 1 ? 's' : ''}`
                })
            } else {
                onDatesChange({
                    startDate: start,
                    endDate: end,
                    selectedDates: allDates,
                    numberOfDays,
                    isValid: true
                })
            }

            setSelectionStart(null)
        }
    }

    // Clear selection
    const handleClearSelection = () => {
        setSelectionStart(null)
        setHoveredDate(null)
        onDatesChange({
            startDate: null,
            endDate: null,
            selectedDates: [],
            numberOfDays: 0,
            isValid: false
        })
    }

    // Navigation
    const goToPreviousMonth = () => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
    }

    const goToNextMonth = () => {
        setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
    }

    // Calculate estimated cost
    const estimatedCost = useMemo(() => {
        if (!dayRate || !selectedDates.numberOfDays) return null
        return dayRate * selectedDates.numberOfDays
    }, [dayRate, selectedDates.numberOfDays])

    return (
        <Card>
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-muted-foreground" />
                            Select Dates
                        </CardTitle>
                        <CardDescription>
                            {minimumDays > 1 
                                ? `Minimum ${minimumDays} days required` 
                                : 'Click to select start and end dates'}
                        </CardDescription>
                    </div>

                    {/* Month Navigation */}
                    <div className="flex items-center gap-2">
                        <Button 
                            variant="secondary" 
                            size="icon"
                            onClick={goToPreviousMonth}
                            disabled={disabled}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-lg font-semibold min-w-[140px] text-center">
                            {format(currentMonth, 'MMMM yyyy')}
                        </span>
                        <Button 
                            variant="secondary" 
                            size="icon"
                            onClick={goToNextMonth}
                            disabled={disabled}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Selection Status */}
                {(selectedDates.startDate || selectionStart) && (
                    <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                            {selectionStart && !selectedDates.startDate ? (
                                <Badge variant="secondary">
                                    Start: {format(selectionStart, 'dd MMM yyyy')} - Select end date
                                </Badge>
                            ) : selectedDates.startDate && selectedDates.endDate ? (
                                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                                    <CalendarCheck className="h-3 w-3 mr-1" />
                                    {format(selectedDates.startDate, 'dd MMM')} - {format(selectedDates.endDate, 'dd MMM yyyy')}
                                    {' '}({selectedDates.numberOfDays} day{selectedDates.numberOfDays !== 1 ? 's' : ''})
                                </Badge>
                            ) : null}
                        </div>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleClearSelection}
                            disabled={disabled}
                        >
                            Clear
                        </Button>
                    </div>
                )}
            </CardHeader>

            <CardContent>
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
                    {calendarDays.map(({ date, isCurrentMonth }) => {
                        const dateStr = format(date, 'yyyy-MM-dd')
                        const isAvailable = isDateAvailable(date)
                        const isPast = isBefore(date, today)
                        const isSelected = isInRange(date)
                        const isPreview = isInPreviewRange(date)
                        const isStartDate = selectedDates.startDate && isSameDay(date, selectedDates.startDate)
                        const isEndDate = selectedDates.endDate && isSameDay(date, selectedDates.endDate)
                        const isSelectionStartDate = selectionStart && isSameDay(date, selectionStart)
                        const isClickable = isCurrentMonth && !isPast && isAvailable && !disabled

                        return (
                            <button
                                key={dateStr}
                                onClick={() => handleDateClick(date)}
                                onMouseEnter={() => setHoveredDate(date)}
                                onMouseLeave={() => setHoveredDate(null)}
                                disabled={!isClickable}
                                className={cn(
                                    "relative aspect-square p-1 rounded-lg border text-sm font-medium transition-all",
                                    // Base styles
                                    !isCurrentMonth && "bg-muted text-slate-300 cursor-default",
                                    isCurrentMonth && isPast && "bg-muted text-muted-foreground cursor-not-allowed",
                                    isCurrentMonth && !isPast && !isAvailable && "bg-slate-200 text-muted-foreground cursor-not-allowed",
                                    isCurrentMonth && !isPast && isAvailable && "bg-background text-foreground border-slate-200",
                                    // Hover state
                                    isClickable && "hover:bg-emerald-50 hover:border-emerald-200 cursor-pointer",
                                    // Selection preview
                                    isPreview && isAvailable && "bg-emerald-50 border-emerald-200",
                                    // Selected range
                                    isSelected && "bg-emerald-100 border-emerald-200",
                                    // Start/End dates
                                    (isStartDate || isEndDate || isSelectionStartDate) && "bg-emerald-500 text-white border-emerald-500",
                                    // Today
                                    isSameDay(date, today) && isCurrentMonth && "ring-2 ring-amber-400 ring-offset-1"
                                )}
                            >
                                <span className="block text-center">
                                    {format(date, 'd')}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* Legend */}
                <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-background border border-slate-200" /> Available
                    </span>
                    <span className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" /> Selected
                    </span>
                    <span className="flex items-center gap-1">
                        <div className="w-3 h-3 rounded bg-slate-200 border border-slate-300" /> Unavailable
                    </span>
                </div>

                {/* Validation Message */}
                {selectedDates.validationMessage && (
                    <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                        <p className="text-sm text-amber-700 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            {selectedDates.validationMessage}
                        </p>
                    </div>
                )}

                {/* Estimated Cost */}
                {estimatedCost !== null && selectedDates.isValid && (
                    <div className="mt-4 p-4 rounded-lg bg-muted border border-slate-200">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Estimated cost</span>
                            <span className="text-lg font-bold text-foreground">
                                {currency} {estimatedCost.toLocaleString()}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            {selectedDates.numberOfDays} day{selectedDates.numberOfDays !== 1 ? 's' : ''} × {currency} {dayRate?.toLocaleString()}/day
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export default DateSelector
