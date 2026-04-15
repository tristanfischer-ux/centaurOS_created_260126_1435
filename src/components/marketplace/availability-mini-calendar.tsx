'use client'

/**
 * @file availability-mini-calendar.tsx
 *
 * @description Compact 30-day availability calendar for People marketplace listings.
 * Shows weekday-only grid with colored dots indicating available/booked/unset days.
 * Fetches data via the existing getAvailability server action.
 */

import { useState, useEffect } from 'react'
import { Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAvailability } from '@/actions/availability'

interface AvailabilityMiniCalendarProps {
  providerId: string
}

interface SlotData {
  date: string
  status: 'available' | 'booked' | 'blocked'
}

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr']

export function AvailabilityMiniCalendar({ providerId }: AvailabilityMiniCalendarProps) {
  const [slots, setSlots] = useState<SlotData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = new Date()
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + 30)

    const startStr = today.toISOString().split('T')[0]
    const endStr = endDate.toISOString().split('T')[0]

    getAvailability(providerId, startStr, endStr)
      .then((result) => {
        if (Array.isArray(result)) {
          setSlots(result as SlotData[])
        } else if (result && 'slots' in result) {
          setSlots((result as { slots: SlotData[] }).slots || [])
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [providerId])

  // Build weekday grid for next 30 days
  const today = new Date()
  const days: { date: string; dayOfWeek: number }[] = []
  for (let i = 0; i < 30; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const dow = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
    if (dow >= 1 && dow <= 5) {
      days.push({
        date: d.toISOString().split('T')[0],
        dayOfWeek: dow,
      })
    }
  }

  // Build slot lookup
  const slotMap = new Map<string, string>()
  for (const s of slots) {
    slotMap.set(s.date, s.status)
  }

  // Pad first row to start on the correct day
  const firstDow = days[0]?.dayOfWeek ?? 1
  const padBefore = firstDow - 1 // Mon=0 pad, Tue=1 pad, etc.

  if (loading) {
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Availability
        </h2>
        <div className="h-16 rounded-lg bg-muted animate-pulse" />
      </section>
    )
  }

  if (days.length === 0) return null

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Calendar className="h-4 w-4" />
        Next 30 Days
      </h2>

      {/* Day labels */}
      <div className="grid grid-cols-5 gap-1 max-w-[160px]">
        {DAY_LABELS.map((label) => (
          <span key={label} className="text-[10px] text-muted-foreground text-center">
            {label}
          </span>
        ))}
      </div>

      {/* Dots grid */}
      <div className="grid grid-cols-5 gap-1 max-w-[160px]">
        {/* Padding for first row alignment */}
        {Array.from({ length: padBefore }).map((_, i) => (
          <div key={`pad-${i}`} className="h-5" />
        ))}

        {days.map(({ date }) => {
          const status = slotMap.get(date)
          return (
            <div
              key={date}
              className="flex items-center justify-center h-5"
              title={`${date}: ${status || 'not set'}`}
            >
              <div
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  status === 'available' && 'bg-success',
                  status === 'booked' && 'bg-destructive',
                  status === 'blocked' && 'bg-destructive/60',
                  !status && 'bg-muted-foreground/20',
                )}
              />
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-success" /> Available
        </span>
        <span className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-destructive" /> Booked
        </span>
        <span className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-muted-foreground/20" /> Not set
        </span>
      </div>
    </section>
  )
}
