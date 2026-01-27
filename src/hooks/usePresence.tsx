'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type PresenceStatus = 'online' | 'away' | 'focus' | 'offline'

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

  const supabase = createClient()

  // Update presence via RPC
  const updatePresence = useCallback(async (
    status: PresenceStatus,
    currentTaskId?: string | null,
    statusMessage?: string | null
  ) => {
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const { data, error } = await supabase.rpc('upsert_presence', {
        p_status: status,
        p_current_task_id: currentTaskId || null,
        p_timezone: timezone,
        p_status_message: statusMessage || null
      })
      
      if (error) {
        console.error('Error updating presence:', error)
        return null
      }
      
      setMyPresence(data as UserPresence)
      return data as UserPresence
    } catch (err) {
      console.error('Failed to update presence:', err)
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

  // Set current working task
  const setWorkingOn = useCallback((taskId: string | null) => {
    return updatePresence(myPresence?.status || 'online', taskId)
  }, [updatePresence, myPresence?.status])

  // Record user activity (resets away timer)
  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    
    // If we were away, go back online
    if (myPresence?.status === 'away') {
      goOnline(myPresence.current_task_id || undefined)
    }
    
    // Reset away timeout
    if (awayTimeoutRef.current) {
      clearTimeout(awayTimeoutRef.current)
    }
    awayTimeoutRef.current = setTimeout(() => {
      // Only go away if we're currently online (not focus mode)
      if (myPresence?.status === 'online') {
        goAway()
      }
    }, awayTimeout)
  }, [myPresence, goOnline, goAway, awayTimeout])

  // Fetch team presence
  const fetchTeamPresence = useCallback(async () => {
    const { data, error } = await supabase
      .from('presence')
      .select('*')
      .order('last_seen', { ascending: false })
    
    if (!error && data) {
      setTeamPresence(data as UserPresence[])
    }
  }, [supabase])

  // Get presence for a specific user
  const getPresenceForUser = useCallback((userId: string): UserPresence | undefined => {
    return teamPresence.find(p => p.user_id === userId)
  }, [teamPresence])

  // Initialize presence and subscriptions
  useEffect(() => {
    let mounted = true

    const init = async () => {
      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !mounted) return

      // Set initial online status
      await updatePresence('online')
      
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
              }
            }
          }
        )
        .subscribe((status) => {
          setIsConnected(status === 'SUBSCRIBED')
        })

      // Start heartbeat
      heartbeatRef.current = setInterval(() => {
        if (mounted && myPresence?.status !== 'offline') {
          updatePresence(myPresence?.status || 'online', myPresence?.current_task_id)
        }
      }, heartbeatInterval)

      // Set up activity listeners
      const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll']
      activityEvents.forEach(event => {
        window.addEventListener(event, recordActivity, { passive: true })
      })

      // Initial away timeout
      awayTimeoutRef.current = setTimeout(() => {
        if (mounted && myPresence?.status === 'online') {
          goAway()
        }
      }, awayTimeout)
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

      // Set offline on unmount
      goOffline()

      const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll']
      activityEvents.forEach(event => {
        window.removeEventListener(event, recordActivity)
      })
    }
  }, []) // Only run on mount

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
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable offline status
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (supabaseUrl && myPresence?.user_id) {
        navigator.sendBeacon(
          `${supabaseUrl}/rest/v1/rpc/upsert_presence`,
          JSON.stringify({ p_status: 'offline' })
        )
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [myPresence?.user_id])

  return {
    myPresence,
    teamPresence,
    isConnected,
    goOnline,
    goAway,
    goFocus,
    goOffline,
    setWorkingOn,
    recordActivity,
    getPresenceForUser,
    refreshTeamPresence: fetchTeamPresence
  }
}

// Helper to get status color
export function getPresenceColor(status: PresenceStatus): string {
  switch (status) {
    case 'online':
      return 'bg-green-500'
    case 'away':
      return 'bg-yellow-500'
    case 'focus':
      return 'bg-purple-500'
    case 'offline':
    default:
      return 'bg-gray-400'
  }
}

// Helper to get status label
export function getPresenceLabel(status: PresenceStatus): string {
  switch (status) {
    case 'online':
      return 'Online'
    case 'away':
      return 'Away'
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
