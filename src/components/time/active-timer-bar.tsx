'use client'

/**
 * @file active-timer-bar.tsx — Sticky bar showing the running timer.
 *
 * @description Self-loading component that checks for an active timer on mount.
 * When active, renders a compact bar at the top of the page showing elapsed time,
 * optional task name, and a Stop button. Updates every second via setInterval.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Clock, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { getActiveTimer, stopTimer } from '@/actions/time-tracking'
import { invalidateWeeklyTimeCache } from '@/hooks/use-weekly-time'
import { formatDuration } from '@/lib/format-duration'

interface ActiveTimerData {
  id: string
  startedAt: string
  description: string
  taskTitle: string | null
}

export function ActiveTimerBar() {
  const [timer, setTimer] = useState<ActiveTimerData | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [stopping, setStopping] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Check for active timer — on mount, tab focus, and timer-started events
  const checkingRef = useRef(false)
  const checkTimer = useCallback(() => {
    if (checkingRef.current) return // dedup rapid calls (visibilitychange can fire multiple times)
    checkingRef.current = true
    getActiveTimer().then((result) => {
      if ('error' in result) {
        console.warn('[TIMER] Active timer check failed:', result.error)
        setTimer(null)
        return
      }
      if ('active' in result && result.active) {
        setTimer({ id: result.id, startedAt: result.startedAt, description: result.description, taskTitle: result.taskTitle })
      } else {
        setTimer(null)
      }
    }).catch((err) => console.warn('[TIMER] Failed to check active timer:', err))
      .finally(() => { checkingRef.current = false })
  }, [])

  useEffect(() => {
    checkTimer()
    const onTimerStarted = () => checkTimer()
    const onVisibility = () => { if (document.visibilityState === 'visible') checkTimer() }
    window.addEventListener('timer-started', onTimerStarted)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('timer-started', onTimerStarted)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [checkTimer])

  // Tick elapsed every second when timer is active
  useEffect(() => {
    if (!timer) return

    const tick = () => {
      setElapsed(Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000))
    }
    tick() // immediate
    intervalRef.current = setInterval(tick, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [timer])

  const handleStop = async () => {
    setStopping(true)
    // Eagerly clear interval to prevent stale ticks during async stop
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    const result = await stopTimer()
    if ('error' in result) {
      toast.error(typeof result.error === 'string' ? result.error : 'Failed to stop timer')
      setStopping(false)
      return
    }
    setTimer(null)
    setStopping(false)
    invalidateWeeklyTimeCache()
    // Show how much time was logged
    if ('duration_minutes' in result) {
      const dur = formatDuration(result.duration_minutes ?? 0)
      toast.success(`Timer stopped — ${dur} logged`)
    }
    if ('wasCapped' in result && result.wasCapped) {
      toast.warning('Timer ran 24+ hours — duration capped at 24h. Adjust the entry if needed.')
    }
  }

  if (!timer) return null

  const elapsedMinutes = Math.floor(elapsed / 60)
  const elapsedSeconds = elapsed % 60
  const label = timer.taskTitle || timer.description || 'Timer running'

  return (
    <div className="bg-international-orange/10 border-b border-international-orange/30 px-4 py-2 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <div className="relative flex items-center">
          <Clock className="h-4 w-4 text-international-orange" />
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-international-orange animate-pulse" />
        </div>
        <span className="text-sm font-medium text-foreground tabular-nums">
          {formatDuration(elapsedMinutes)}
          <span className="text-muted-foreground text-xs ml-0.5">
            {String(elapsedSeconds).padStart(2, '0')}s
          </span>
        </span>
        <span className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-[400px]">
          {label}
        </span>
      </div>
      <Button
        variant="destructive"
        size="sm"
        className="gap-1.5 min-h-[44px] sm:min-h-0 shrink-0"
        onClick={handleStop}
        disabled={stopping}
      >
        <Square className="h-3 w-3" />
        {stopping ? 'Stopping…' : 'Stop'}
      </Button>
    </div>
  )
}
