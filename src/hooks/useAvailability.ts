'use client'

import { useState, useCallback, useEffect, useTransition } from 'react'
import { 
    format, 
    startOfMonth, 
    endOfMonth, 
    eachDayOfInterval,
    addMonths,
    subMonths,
    startOfWeek,
    endOfWeek,
    isSameMonth
} from 'date-fns'
import {
    getAvailability,
    setAvailability,
    bulkSetAvailability,
    toggleAvailability,
    getProviderProfile,
    type AvailabilitySlot,
    type AvailabilityStatus,
    type ProviderProfile
} from '@/actions/availability'

export interface AvailabilityMap {
    [date: string]: AvailabilitySlot
}

interface UseAvailabilityOptions {
    providerId?: string
    autoFetch?: boolean
}

export function useAvailability(options: UseAvailabilityOptions = {}) {
    const { providerId, autoFetch = true } = options
    
    const [currentMonth, setCurrentMonth] = useState<Date>(new Date())
    const [availability, setAvailabilityState] = useState<AvailabilityMap>({})
    const [profile, setProfile] = useState<ProviderProfile | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    // Fetch provider profile
    const fetchProfile = useCallback(async () => {
        const result = await getProviderProfile()
        if (result.data) {
            setProfile(result.data)
        }
        return result.data
    }, [])

    // Fetch availability for current month view
    const fetchAvailability = useCallback(async (month: Date, provId?: string) => {
        setIsLoading(true)
        setError(null)

        try {
            const targetProviderId = provId || providerId || profile?.id
            if (!targetProviderId) {
                // Try to get profile first
                const fetchedProfile = await fetchProfile()
                if (!fetchedProfile) {
                    setError('No provider profile found')
                    setIsLoading(false)
                    return
                }
            }

            const finalProviderId = targetProviderId || profile?.id
            if (!finalProviderId) {
                setError('No provider profile found')
                setIsLoading(false)
                return
            }

            // Get the full calendar view range (includes days from adjacent months)
            const monthStart = startOfMonth(month)
            const monthEnd = endOfMonth(month)
            const viewStart = startOfWeek(monthStart, { weekStartsOn: 1 })
            const viewEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

            const result = await getAvailability(
                finalProviderId,
                format(viewStart, 'yyyy-MM-dd'),
                format(viewEnd, 'yyyy-MM-dd')
            )

            if (result.error) {
                setError(result.error)
            } else {
                // Convert array to map for easy lookup
                const map: AvailabilityMap = {}
                result.data.forEach(slot => {
                    map[slot.date] = slot
                })
                setAvailabilityState(map)
            }
        } catch (err) {
            console.error('Error fetching availability:', err)
            setError('Failed to fetch availability')
        } finally {
            setIsLoading(false)
        }
    }, [providerId, profile?.id, fetchProfile])

    // Initial load
    useEffect(() => {
        if (autoFetch) {
            fetchProfile().then((prof) => {
                if (prof) {
                    fetchAvailability(currentMonth, prof.id)
                }
            })
        }
    }, [autoFetch]) // eslint-disable-line react-hooks/exhaustive-deps

    // Navigation
    const goToNextMonth = useCallback(() => {
        const nextMonth = addMonths(currentMonth, 1)
        setCurrentMonth(nextMonth)
        if (profile?.id) {
            fetchAvailability(nextMonth, profile.id)
        }
    }, [currentMonth, profile?.id, fetchAvailability])

    const goToPreviousMonth = useCallback(() => {
        const prevMonth = subMonths(currentMonth, 1)
        setCurrentMonth(prevMonth)
        if (profile?.id) {
            fetchAvailability(prevMonth, profile.id)
        }
    }, [currentMonth, profile?.id, fetchAvailability])

    const goToMonth = useCallback((month: Date) => {
        setCurrentMonth(month)
        if (profile?.id) {
            fetchAvailability(month, profile.id)
        }
    }, [profile?.id, fetchAvailability])

    // Get status for a specific date
    const getStatusForDate = useCallback((date: Date | string): AvailabilityStatus | null => {
        const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd')
        return availability[dateStr]?.status || null
    }, [availability])

    // Toggle a single date with optimistic update
    const toggleDate = useCallback(async (date: Date | string) => {
        const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd')
        const currentStatus = getStatusForDate(dateStr)

        // Can't toggle booked dates
        if (currentStatus === 'booked') {
            return { success: false, error: 'Cannot modify booked dates' }
        }

        // Optimistic update
        const newStatus: AvailabilityStatus = currentStatus === 'available' ? 'blocked' : 'available'
        const optimisticSlot: AvailabilitySlot = {
            id: availability[dateStr]?.id || 'temp',
            provider_id: profile?.id || '',
            date: dateStr,
            status: newStatus,
            booking_id: null,
            source: 'manual',
            created_at: new Date().toISOString()
        }

        setAvailabilityState(prev => ({
            ...prev,
            [dateStr]: optimisticSlot
        }))

        // Actual API call
        startTransition(async () => {
            const result = await toggleAvailability(dateStr, currentStatus)
            
            if (!result.success) {
                // Revert on failure
                if (currentStatus) {
                    setAvailabilityState(prev => ({
                        ...prev,
                        [dateStr]: availability[dateStr]
                    }))
                } else {
                    setAvailabilityState(prev => {
                        const updated = { ...prev }
                        delete updated[dateStr]
                        return updated
                    })
                }
                setError(result.error)
            }
        })
    }, [availability, getStatusForDate, profile?.id])

    // Bulk set availability for multiple dates
    const bulkSet = useCallback(async (dates: Date[] | string[], status: 'available' | 'blocked') => {
        const dateStrings = dates.map(d => 
            typeof d === 'string' ? d : format(d, 'yyyy-MM-dd')
        )

        // Optimistic updates
        setAvailabilityState(prev => {
            const updated = { ...prev }
            dateStrings.forEach(dateStr => {
                // Skip booked dates
                if (updated[dateStr]?.status === 'booked') return
                
                updated[dateStr] = {
                    id: updated[dateStr]?.id || 'temp',
                    provider_id: profile?.id || '',
                    date: dateStr,
                    status: status,
                    booking_id: null,
                    source: 'manual',
                    created_at: new Date().toISOString()
                }
            })
            return updated
        })

        const result = await bulkSetAvailability(dateStrings, status)
        
        if (!result.success) {
            // Refresh to get correct state
            if (profile?.id) {
                await fetchAvailability(currentMonth, profile.id)
            }
            setError(result.error)
        }

        return result
    }, [profile?.id, currentMonth, fetchAvailability])

    // Bulk actions for week/month
    const blockWeek = useCallback(async (weekStart: Date) => {
        const days = eachDayOfInterval({
            start: weekStart,
            end: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000)
        })
        return bulkSet(days, 'blocked')
    }, [bulkSet])

    const openWeek = useCallback(async (weekStart: Date) => {
        const days = eachDayOfInterval({
            start: weekStart,
            end: new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000)
        })
        return bulkSet(days, 'available')
    }, [bulkSet])

    const openMonth = useCallback(async (month: Date = currentMonth) => {
        const days = eachDayOfInterval({
            start: startOfMonth(month),
            end: endOfMonth(month)
        })
        return bulkSet(days, 'available')
    }, [bulkSet, currentMonth])

    const blockMonth = useCallback(async (month: Date = currentMonth) => {
        const days = eachDayOfInterval({
            start: startOfMonth(month),
            end: endOfMonth(month)
        })
        return bulkSet(days, 'blocked')
    }, [bulkSet, currentMonth])

    // Get calendar days for current month view
    const getCalendarDays = useCallback(() => {
        const monthStart = startOfMonth(currentMonth)
        const monthEnd = endOfMonth(currentMonth)
        const viewStart = startOfWeek(monthStart, { weekStartsOn: 1 })
        const viewEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

        return eachDayOfInterval({ start: viewStart, end: viewEnd }).map(day => ({
            date: day,
            dateStr: format(day, 'yyyy-MM-dd'),
            isCurrentMonth: isSameMonth(day, currentMonth),
            status: getStatusForDate(day),
            isBooked: availability[format(day, 'yyyy-MM-dd')]?.status === 'booked'
        }))
    }, [currentMonth, availability, getStatusForDate])

    // Refresh
    const refresh = useCallback(() => {
        if (profile?.id) {
            fetchAvailability(currentMonth, profile.id)
        }
    }, [profile?.id, currentMonth, fetchAvailability])

    return {
        // State
        currentMonth,
        availability,
        profile,
        isLoading: isLoading || isPending,
        error,

        // Navigation
        goToNextMonth,
        goToPreviousMonth,
        goToMonth,

        // Actions
        toggleDate,
        bulkSet,
        blockWeek,
        openWeek,
        openMonth,
        blockMonth,

        // Utilities
        getStatusForDate,
        getCalendarDays,
        refresh,
        fetchProfile
    }
}
