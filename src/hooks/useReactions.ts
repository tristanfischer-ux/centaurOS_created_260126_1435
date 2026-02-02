'use client'

import { useState, useCallback, useEffect } from 'react'
import { 
  toggleReaction, 
  getBatchMessageReactions,
  type ReactionGroup 
} from '@/actions/reactions'

interface UseReactionsOptions {
  messageIds: string[]
  enabled?: boolean
}

/**
 * Hook for managing message reactions
 */
export function useReactions({ messageIds, enabled = true }: UseReactionsOptions) {
  const [reactions, setReactions] = useState<Record<string, ReactionGroup[]>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch reactions for all messages
  const fetchReactions = useCallback(async () => {
    if (!enabled || messageIds.length === 0) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await getBatchMessageReactions(messageIds)
      if (result.success && result.data) {
        setReactions(result.data)
      } else {
        setError(result.error || 'Failed to load reactions')
      }
    } catch (err) {
      setError('Failed to load reactions')
    } finally {
      setIsLoading(false)
    }
  }, [messageIds, enabled])

  // Initial fetch
  useEffect(() => {
    fetchReactions()
  }, [fetchReactions])

  // Toggle a reaction (optimistic update)
  const toggle = useCallback(async (messageId: string, emoji: string) => {
    // Optimistic update
    setReactions(prev => {
      const messageReactions = [...(prev[messageId] || [])]
      const existingIndex = messageReactions.findIndex(r => r.emoji === emoji)
      
      if (existingIndex >= 0) {
        const existing = messageReactions[existingIndex]
        if (existing.hasReacted) {
          // Remove user's reaction
          if (existing.count === 1) {
            messageReactions.splice(existingIndex, 1)
          } else {
            messageReactions[existingIndex] = {
              ...existing,
              count: existing.count - 1,
              hasReacted: false
            }
          }
        } else {
          // Add user's reaction
          messageReactions[existingIndex] = {
            ...existing,
            count: existing.count + 1,
            hasReacted: true
          }
        }
      } else {
        // New reaction
        messageReactions.push({
          emoji,
          count: 1,
          users: [],
          hasReacted: true
        })
      }
      
      return { ...prev, [messageId]: messageReactions }
    })

    // Actual update
    try {
      const result = await toggleReaction(messageId, emoji)
      if (!result.success) {
        // Revert on failure
        await fetchReactions()
      }
    } catch (err) {
      // Revert on error
      await fetchReactions()
    }
  }, [fetchReactions])

  // Get reactions for a specific message
  const getReactionsForMessage = useCallback((messageId: string): ReactionGroup[] => {
    return reactions[messageId] || []
  }, [reactions])

  return {
    reactions,
    isLoading,
    error,
    toggle,
    refresh: fetchReactions,
    getReactionsForMessage
  }
}

/**
 * Common emoji reactions for quick access
 */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '✅', '👀']

/**
 * Emoji shortcodes mapping
 */
export const EMOJI_SHORTCODES: Record<string, string> = {
  'thumbsup': '👍',
  'thumbs_up': '👍',
  '+1': '👍',
  'thumbsdown': '👎',
  'thumbs_down': '👎',
  '-1': '👎',
  'heart': '❤️',
  'smile': '😊',
  'laugh': '😂',
  'joy': '😂',
  'lol': '😂',
  'surprised': '😮',
  'wow': '😮',
  'sad': '😢',
  'cry': '😢',
  'party': '🎉',
  'tada': '🎉',
  'check': '✅',
  'checkmark': '✅',
  'white_check_mark': '✅',
  'eyes': '👀',
  'thinking': '🤔',
  'fire': '🔥',
  'rocket': '🚀',
  'clap': '👏',
  'pray': '🙏',
  'raised_hands': '🙌',
  'ok': '👌',
  'wave': '👋',
  'muscle': '💪',
  'star': '⭐',
  'sparkles': '✨',
  'warning': '⚠️',
  'x': '❌',
  'no': '❌',
}

/**
 * Parse emoji shortcode to actual emoji
 */
export function parseEmojiShortcode(shortcode: string): string | null {
  const clean = shortcode.replace(/^:|:$/g, '').toLowerCase()
  return EMOJI_SHORTCODES[clean] || null
}
