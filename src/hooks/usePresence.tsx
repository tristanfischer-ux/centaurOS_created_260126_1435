'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

/** DB-compatible presence statuses */
export type PresenceStatus = 'online' | 'away' | 'focus' | 'offline'
/** Extended statuses for UI display (includes non-DB values) */
export type DisplayPresenceStatus = PresenceStatus | 'busy'

export interface UserPresence {
  id: string
  user_id: string
  status: PresenceStatus
  current_task_id: string | null
  last_seen: string
  timezone: string | null
  availability_start: string | null
  availability_end: string | null
  focus_until: string | null
  status_message: string | null
  typing_in_conversation_id: string | null
  typing_since: string | null
  updated_at: string
}

interface UsePresenceOptions {
  heartbeatInterval?: number // in ms, default 30s
  awayTimeout?: number // in ms, default 5min
}

export function usePresence(options: UsePresenceOptions = {}) {
  const { heartbeatInterval = 30000, awayTimeout = 300000 } = options
  const [myPresence, setMyPresence] = useState<UserPresence | null>(null)
  const [teamPresence, setTeamPresence] = useState<UserPresence[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null)
  const awayTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  // GOTCHA: Ref mirror of myPresence avoids stale closures in intervals/timeouts
  // registered inside the mount-only useEffect (which captures initial null).
  const myPresenceRef = useRef<UserPresence | null>(null)

  const supabase = useMemo(() => createClient(), [])

  // Update presence via RPC function (bypasses RLS for reliable updates)
  const updatePresence = useCallback(async (
    status: PresenceStatus,
    currentTaskId?: string | null,
    statusMessage?: string | null
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.debug('Cannot update presence: No authenticated user')
        return null
      }
      
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      
      // Use RPC function for reliable upsert with SECURITY DEFINER
      const { data, error } = await supabase
        .rpc('upsert_presence', {
          p_status: status,
          p_current_task_id: currentTaskId ?? undefined,
          p_timezone: timezone,
          p_status_message: statusMessage ?? undefined
        })
      
      if (error) {
        // Properly log the error with all details
        console.error('Error updating presence:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return null
      }
      
      const presence = data as UserPresence
      setMyPresence(presence)
      myPresenceRef.current = presence
      return presence
    } catch (err) {
      // Properly log caught errors
      console.error('Failed to update presence:', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      })
      return null
    }
  }, [supabase])

  // Set status to online
  const goOnline = useCallback((currentTaskId?: string) => {
    return updatePresence('online', currentTaskId)
  }, [updatePresence])

  // Set status to away
  const goAway = useCallback(() => {
    return updatePresence('away')
  }, [updatePresence])

  // Set status to focus mode
  const goFocus = useCallback((message?: string) => {
    return updatePresence('focus', null, message || 'In focus mode')
  }, [updatePresence])

  // Set status to offline
  const goOffline = useCallback(() => {
    return updatePresence('offline')
  }, [updatePresence])

  // Set typing status for a conversation
  const setTyping = useCallback(async (conversationId: string | null) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase
        .from('presence')
        .update({
          typing_in_conversation_id: conversationId,
          typing_since: conversationId ? new Date().toISOString() : null
        })
        .eq('user_id', user.id)
    } catch (err) {
      console.debug('Failed to set typing status:', err instanceof Error ? err.message : String(err))
    }
  }, [supabase])

  // Set current working task
  const setWorkingOn = useCallback((taskId: string | null) => {
    return updatePresence(myPresenceRef.current?.status || 'online', taskId)
  }, [updatePresence])

  // Record user activity (resets away timer)
  // GOTCHA: Uses myPresenceRef to avoid stale closures in event listeners
  // registered in the mount-only useEffect.
  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now()

    // If we were away, go back online
    const current = myPresenceRef.current
    if (current?.status === 'away') {
      goOnline(current.current_task_id || undefined)
    }

    // Reset away timeout
    if (awayTimeoutRef.current) {
      clearTimeout(awayTimeoutRef.current)
    }
    awayTimeoutRef.current = setTimeout(() => {
      // Only go away if we're currently online (not focus mode)
      if (myPresenceRef.current?.status === 'online') {
        goAway()
      }
    }, awayTimeout)
  }, [goOnline, goAway, awayTimeout])

  // Fetch team presence
  const fetchTeamPresence = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('presence')
        .select('*')
        .order('last_seen', { ascending: false })
      
      if (error) {
        console.debug('Presence fetch error:', {
          message: error.message,
          code: error.code
        })
        return
      }
      
      if (data) {
        setTeamPresence(data as UserPresence[])
      }
    } catch (err) {
      console.debug('Presence fetch failed:', err instanceof Error ? err.message : String(err))
    }
  }, [supabase])

  // Get presence for a specific user
  const getPresenceForUser = useCallback((userId: string): UserPresence | undefined => {
    return teamPresence.find(p => p.user_id === userId)
  }, [teamPresence])

  // Initialize presence and subscriptions
  useEffect(() => {
    let mounted = true
    let initialized = false

    const init = async () => {
      try {
        // Check if user is authenticated
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !mounted) return

        // Verify user has a profile before setting up presence
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .single()

        if (profileError || !profile) {
          console.debug('Presence: User profile not ready yet')
          return
        }

        // Set initial online status
        const initialPresence = await updatePresence('online')
        if (!initialPresence || !mounted) return

        initialized = true
        
        // Fetch current team presence
        await fetchTeamPresence()

        // Subscribe to presence changes
        channelRef.current = supabase
          .channel('presence-changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'presence'
            },
            (payload) => {
              if (!mounted) return
              
              if (payload.eventType === 'DELETE') {
                setTeamPresence(prev => 
                  prev.filter(p => p.id !== (payload.old as UserPresence).id)
                )
              } else {
                const newPresence = payload.new as UserPresence
                setTeamPresence(prev => {
                  const existing = prev.findIndex(p => p.user_id === newPresence.user_id)
                  if (existing >= 0) {
                    const updated = [...prev]
                    updated[existing] = newPresence
                    return updated
                  }
                  return [...prev, newPresence]
                })
                
                // Update my presence if it's mine
                if (newPresence.user_id === user.id) {
                  setMyPresence(newPresence)
                  myPresenceRef.current = newPresence
                }
              }
            }
          )
          .subscribe((status) => {
            setIsConnected(status === 'SUBSCRIBED')
          })

        // Start heartbeat only if initialized successfully
        // GOTCHA: Uses myPresenceRef to avoid stale closure over initial null state
        heartbeatRef.current = setInterval(async () => {
          if (!mounted || !initialized) return

          const current = myPresenceRef.current
          if (current?.status && current.status !== 'offline') {
            await updatePresence(current.status, current.current_task_id)
          }
        }, heartbeatInterval)

        // Set up activity listeners
        const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll']
        activityEvents.forEach(event => {
          window.addEventListener(event, recordActivity, { passive: true })
        })

        // Initial away timeout
        awayTimeoutRef.current = setTimeout(() => {
          if (mounted && myPresenceRef.current?.status === 'online') {
            goAway()
          }
        }, awayTimeout)
      } catch (err) {
        console.debug('Presence initialization failed:', err instanceof Error ? err.message : String(err))
      }
    }

    init()

    // Cleanup
    return () => {
      mounted = false
      
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
      
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
      }
      
      if (awayTimeoutRef.current) {
        clearTimeout(awayTimeoutRef.current)
      }

      // Set offline on unmount only if we were initialized
      if (initialized) {
        goOffline()
      }

      const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll']
      activityEvents.forEach(event => {
        window.removeEventListener(event, recordActivity)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount - deps intentionally omitted to prevent reconnection loops

  // Handle visibility change (tab switching)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recordActivity()
      } else {
        // Could optionally go away when tab is hidden
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [recordActivity])

  // Handle beforeunload to go offline
  // DECISION: Removed broken sendBeacon (no auth headers possible).
  // Offline transition relies on: (1) useEffect cleanup calling goOffline(),
  // (2) server-side heartbeat timeout detecting stale last_seen.
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Use fetch with keepalive for reliable offline status on page close
      if (myPresenceRef.current?.user_id) {
        updatePresence('offline')
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [updatePresence])

  return {
    myPresence,
    teamPresence,
    isConnected,
    goOnline,
    goAway,
    goFocus,
    goOffline,
    setTyping,
    setWorkingOn,
    recordActivity,
    getPresenceForUser,
    refreshTeamPresence: fetchTeamPresence
  }
}

// Helper to get status color
export function getPresenceColor(status: DisplayPresenceStatus): string {
  switch (status) {
    case 'online':
      return 'bg-status-success'
    case 'away':
      return 'bg-status-warning'
    case 'busy':
      return 'bg-status-error'
    case 'focus':
      return 'bg-chart-5'
    case 'offline':
    default:
      return 'bg-muted-foreground'
  }
}

// Helper to get status label
export function getPresenceLabel(status: DisplayPresenceStatus): string {
  switch (status) {
    case 'online':
      return 'Online'
    case 'away':
      return 'Away'
    case 'busy':
      return 'Busy'
    case 'focus':
      return 'Focus Mode'
    case 'offline':
    default:
      return 'Offline'
  }
}

// Helper to format last seen
export function formatLastSeen(lastSeen: string): string {
  const diff = Date.now() - new Date(lastSeen).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}
