'use client'

/**
 * UnreadIndicator - Shows unread message count with link to inbox
 * 
 * @description Fetches and displays the user's unread message count.
 * Appears in the Today page header when there are unread messages.
 * 
 * @component
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { getUnreadCount } from '@/actions/messaging'
import { cn } from '@/lib/utils'

interface UnreadIndicatorProps {
    /** Additional CSS classes */
    className?: string
}

export function UnreadIndicator({ className }: UnreadIndicatorProps) {
    const [unreadCount, setUnreadCount] = useState<number>(0)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        let mounted = true
        
        async function fetchUnreadCount() {
            try {
                const result = await getUnreadCount()
                if (mounted && result.success) {
                    setUnreadCount(result.count || 0)
                }
            } catch (error) {
                console.error('[UnreadIndicator] Failed to fetch unread count:', error)
            } finally {
                if (mounted) {
                    setIsLoading(false)
                }
            }
        }
        
        fetchUnreadCount()
        
        // Refresh every 60 seconds
        const interval = setInterval(fetchUnreadCount, 60000)
        
        return () => {
            mounted = false
            clearInterval(interval)
        }
    }, [])

    // Don't show anything while loading or if no unread messages
    if (isLoading || unreadCount === 0) {
        return null
    }

    return (
        <Link
            href="/updates"
            className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full transition-colors",
                "bg-status-info-light border border-status-info",
                "hover:bg-status-info/20",
                className
            )}
        >
            <MessageCircle className="h-4 w-4 text-status-info" />
            <span className="text-sm font-medium text-status-info-dark">
                {unreadCount} unread message{unreadCount !== 1 ? 's' : ''}
            </span>
        </Link>
    )
}
