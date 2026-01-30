'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RFQSummary } from '@/types/rfq'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'

interface UseRFQFeedOptions {
  /** Called when a new RFQ is received */
  onNewRFQ?: (rfq: RFQSummary) => void
  /** Called when an RFQ is updated */
  onRFQUpdate?: (rfq: Partial<RFQSummary> & { id: string }) => void
  /** Called when race status changes */
  onRaceStatusChange?: (rfqId: string, status: string) => void
  /** Enable/disable real-time updates */
  enabled?: boolean
}

interface UseRFQFeedReturn {
  /** Number of new RFQs since last clear */
  newRFQCount: number
  /** Clear the new RFQ count */
  clearNewCount: () => void
  /** Subscribe to a specific RFQ */
  subscribeToRFQ: (rfqId: string) => void
  /** Unsubscribe from a specific RFQ */
  unsubscribeFromRFQ: (rfqId: string) => void
  /** Whether currently connected to real-time */
  isConnected: boolean
}

/**
 * Hook for real-time RFQ feed updates
 */
export function useRFQFeed(options: UseRFQFeedOptions = {}): UseRFQFeedReturn {
  const {
    onNewRFQ,
    onRFQUpdate,
    onRaceStatusChange,
    enabled = true,
  } = options

  const [newRFQCount, setNewRFQCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const rfqChannelsRef = useRef<Map<string, ReturnType<ReturnType<typeof createClient>['channel']>>>(new Map())

  const clearNewCount = useCallback(() => {
    setNewRFQCount(0)
  }, [])

  const subscribeToRFQ = useCallback((rfqId: string) => {
    if (rfqChannelsRef.current.has(rfqId)) return

    const supabase = createClient()
    const channel = supabase
      .channel(`rfq-${rfqId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rfqs',
          filter: `id=eq.${rfqId}`,
        },
        (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
          const newData = payload.new as unknown as Partial<RFQSummary> & { id: string }
          if (onRFQUpdate) {
            onRFQUpdate(newData)
          }
          if (onRaceStatusChange && newData.status) {
            onRaceStatusChange(rfqId, newData.status as string)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rfq_responses',
          filter: `rfq_id=eq.${rfqId}`,
        },
        () => {
          // New response received, might want to refresh response count
          if (onRFQUpdate) {
            onRFQUpdate({ id: rfqId })
          }
        }
      )
      .subscribe()

    rfqChannelsRef.current.set(rfqId, channel)
  }, [onRFQUpdate, onRaceStatusChange])

  const unsubscribeFromRFQ = useCallback((rfqId: string) => {
    const channel = rfqChannelsRef.current.get(rfqId)
    if (channel) {
      const supabase = createClient()
      supabase.removeChannel(channel)
      rfqChannelsRef.current.delete(rfqId)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const supabase = createClient()

    // Get user's provider profile for filtering broadcasts
    const setupChannel = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: providerProfile } = await supabase
        .from('provider_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single()

      // Main channel for new RFQ broadcasts
      const channel = supabase
        .channel('rfq-feed')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'rfq_broadcasts',
            ...(providerProfile?.id 
              ? { filter: `provider_id=eq.${providerProfile.id}` } 
              : {}),
          },
          async (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
            const broadcast = payload.new as { rfq_id: string }
            if (broadcast?.rfq_id) {
              // Fetch the RFQ details
              const { data: rfq } = await supabase
                .from('rfqs')
                .select(`
                  id,
                  title,
                  rfq_type,
                  status,
                  budget_min,
                  budget_max,
                  deadline,
                  category,
                  urgency,
                  created_at,
                  buyer:profiles!rfqs_buyer_id_fkey (
                    full_name
                  )
                `)
                .eq('id', broadcast.rfq_id)
                .single()

              if (rfq && onNewRFQ) {
                setNewRFQCount((prev) => prev + 1)
                onNewRFQ(rfq as unknown as RFQSummary)
              }
            }
          }
        )
        .subscribe((status) => {
          setIsConnected(status === 'SUBSCRIBED')
        })

      channelRef.current = channel
    }

    setupChannel()

    // Capture current ref value for cleanup
    const currentChannel = channelRef.current
    const currentRfqChannels = rfqChannelsRef.current

    return () => {
      if (currentChannel) {
        supabase.removeChannel(currentChannel)
        channelRef.current = null
      }
      // Clean up any specific RFQ subscriptions
      currentRfqChannels.forEach((channel) => {
        supabase.removeChannel(channel)
      })
      currentRfqChannels.clear()
    }
  }, [enabled, onNewRFQ])

  return {
    newRFQCount,
    clearNewCount,
    subscribeToRFQ,
    unsubscribeFromRFQ,
    isConnected,
  }
}

/**
 * Hook for subscribing to a specific RFQ's updates
 */
export function useRFQSubscription(
  rfqId: string | null,
  options: {
    onUpdate?: (data: unknown) => void
    onNewResponse?: () => void
  } = {}
) {
  const { onUpdate, onNewResponse } = options
  const [isSubscribed, setIsSubscribed] = useState(false)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  useEffect(() => {
    if (!rfqId) return

    const supabase = createClient()

    const channel = supabase
      .channel(`rfq-detail-${rfqId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rfqs',
          filter: `id=eq.${rfqId}`,
        },
        (payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>) => {
          if (onUpdate) {
            onUpdate(payload.new)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'rfq_responses',
          filter: `rfq_id=eq.${rfqId}`,
        },
        () => {
          if (onNewResponse) {
            onNewResponse()
          }
        }
      )
      .subscribe((status) => {
        setIsSubscribed(status === 'SUBSCRIBED')
      })

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [rfqId, onUpdate, onNewResponse])

  return { isSubscribed }
}

/**
 * Hook for race countdown with auto-refresh
 */
export function useRaceCountdown(raceOpensAt: string | null) {
  const [state, setState] = useState(() => {
    // Initial state calculation (runs only once)
    if (!raceOpensAt) {
      return { timeLeft: null as number | null, isOpen: true }
    }
    const openTime = new Date(raceOpensAt).getTime()
    const diff = openTime - Date.now()
    if (diff <= 0) {
      return { timeLeft: null as number | null, isOpen: true }
    }
    return { timeLeft: diff, isOpen: false }
  })

  useEffect(() => {
    if (!raceOpensAt) {
      return
    }

    const updateTime = () => {
      const openTime = new Date(raceOpensAt).getTime()
      const now = Date.now()
      const diff = openTime - now

      setState(prev => {
        const newIsOpen = diff <= 0
        const newTimeLeft = newIsOpen ? null : diff
        // Only update if values changed
        if (prev.isOpen !== newIsOpen || prev.timeLeft !== newTimeLeft) {
          return { timeLeft: newTimeLeft, isOpen: newIsOpen }
        }
        return prev
      })
    }

    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [raceOpensAt])

  return state
}
