"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type RealtimeTable = 
    | 'tasks' 
    | 'objectives' 
    | 'profiles' 
    | 'teams' 
    | 'task_comments' 
    | 'task_files' 
    | 'presence'
    | 'standups'
    | 'standup_summaries'
    | 'approval_delegations'
    | 'notifications'
    | 'advisory_questions'
    | 'advisory_answers'

interface UseAutoRefreshOptions {
    tables: RealtimeTable[]
    enabled?: boolean
}

/**
 * Custom hook to enable real-time auto-refresh using Supabase Realtime.
 * Subscribes to database changes and triggers Next.js router refresh.
 * 
 * @param tables - Array of table names to subscribe to
 * @param enabled - Whether the subscription is active (default: true)
 * 
 * @example
 * ```tsx
 * useAutoRefresh({ tables: ['tasks', 'objectives'] })
 * ```
 */
export function useAutoRefresh({ tables, enabled = true }: UseAutoRefreshOptions) {
    const router = useRouter()

    useEffect(() => {
        if (!enabled) return

        const supabase = createClient()

        // Create a unique channel name based on subscribed tables
        const channelName = `auto-refresh-${tables.join('-')}`

        let channel = supabase.channel(channelName)

        // Subscribe to changes for each table
        tables.forEach((table: RealtimeTable) => {
            channel = channel.on(
                'postgres_changes',
                { event: '*', schema: 'public', table },
                () => {
                    router.refresh()
                }
            )
        })

        // Subscribe to the channel
        channel.subscribe()

        // Cleanup subscription on unmount
        return () => {
            supabase.removeChannel(channel)
        }
        // Tables array is intentionally not in deps to avoid re-subscribing on every render
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, router])
}
