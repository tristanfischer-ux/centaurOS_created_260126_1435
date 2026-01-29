'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  getConversationMessages, 
  sendNewMessage, 
  markConversationRead 
} from '@/actions/messaging'
import type { 
  ConversationWithParticipants, 
  MessageWithSender 
} from '@/lib/messaging/service'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface UseConversationOptions {
  autoMarkRead?: boolean
}

interface UseConversationReturn {
  messages: MessageWithSender[]
  conversation: ConversationWithParticipants | null
  isLoading: boolean
  error: string | null
  sendMessage: (content: string, fileUrl?: string) => Promise<boolean>
  loadMore: () => Promise<void>
  hasMore: boolean
  isConnected: boolean
  markAsRead: () => Promise<void>
}

export function useConversation(
  conversationId: string | null,
  options: UseConversationOptions = {}
): UseConversationReturn {
  const { autoMarkRead = true } = options
  
  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [conversation, setConversation] = useState<ConversationWithParticipants | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [isConnected, setIsConnected] = useState(false)
  
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabase = createClient()
  const currentUserRef = useRef<string | null>(null)

  // Fetch initial messages
  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([])
      setConversation(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await getConversationMessages(conversationId)
      
      if (!result.success) {
        setError(result.error || 'Failed to load messages')
        return
      }

      setMessages(result.data?.messages || [])
      setConversation(result.data?.conversation || null)
      setHasMore((result.data?.messages?.length || 0) >= 50)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages')
    } finally {
      setIsLoading(false)
    }
  }, [conversationId])

  // Load more messages (pagination)
  const loadMore = useCallback(async () => {
    if (!conversationId || !hasMore || isLoading || messages.length === 0) return

    try {
      const oldestMessage = messages[0]
      const result = await getConversationMessages(
        conversationId, 
        50, 
        oldestMessage.created_at
      )
      
      if (result.success && result.data?.messages) {
        const newMessages = result.data.messages
        setMessages(prev => [...newMessages, ...prev])
        setHasMore(newMessages.length >= 50)
      }
    } catch (err) {
      console.error('Failed to load more messages:', err)
    }
  }, [conversationId, hasMore, isLoading, messages])

  // Send a new message
  const sendMessage = useCallback(async (content: string, fileUrl?: string): Promise<boolean> => {
    if (!conversationId) return false

    try {
      const result = await sendNewMessage(conversationId, content, fileUrl)
      
      if (!result.success) {
        setError(result.error || 'Failed to send message')
        return false
      }

      // Optimistically add the message (will be replaced by realtime update)
      if (result.data) {
        setMessages(prev => {
          // Check if message already exists (from realtime)
          if (prev.some(m => m.id === result.data!.id)) {
            return prev
          }
          return [...prev, result.data!]
        })
      }

      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
      return false
    }
  }, [conversationId])

  // Mark conversation as read
  const markAsRead = useCallback(async () => {
    if (!conversationId) return

    try {
      await markConversationRead(conversationId)
    } catch (err) {
      console.error('Failed to mark as read:', err)
    }
  }, [conversationId])

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      currentUserRef.current = user?.id || null
    }
    getUser()
  }, [supabase])

  // Initial fetch and realtime subscription
  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      setConversation(null)
      setIsLoading(false)
      return
    }

    let mounted = true

    const init = async () => {
      await fetchMessages()

      // Subscribe to new messages
      channelRef.current = supabase
        .channel(`messages:${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`
          },
          async (payload) => {
            if (!mounted) return

            // Fetch the full message with sender info
            const { data: newMessage } = await supabase
              .from('messages')
              .select(`
                *,
                sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url, email)
              `)
              .eq('id', payload.new.id)
              .single()

            if (newMessage) {
              setMessages(prev => {
                // Check if message already exists
                if (prev.some(m => m.id === newMessage.id)) {
                  return prev
                }
                return [...prev, newMessage as unknown as MessageWithSender]
              })

              // Auto-mark as read if from other user and option enabled
              if (autoMarkRead && 
                  currentUserRef.current && 
                  newMessage.sender_id !== currentUserRef.current) {
                markConversationRead(conversationId)
              }
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`
          },
          (payload) => {
            if (!mounted) return
            
            setMessages(prev => 
              prev.map(m => 
                m.id === payload.new.id 
                  ? { ...m, ...payload.new } as MessageWithSender
                  : m
              )
            )
          }
        )
        .subscribe((status) => {
          setIsConnected(status === 'SUBSCRIBED')
        })

      // Auto-mark as read on initial load
      if (autoMarkRead && mounted) {
        markConversationRead(conversationId)
      }
    }

    init()

    return () => {
      mounted = false
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [conversationId, autoMarkRead, fetchMessages, supabase])

  return {
    messages,
    conversation,
    isLoading,
    error,
    sendMessage,
    loadMore,
    hasMore,
    isConnected,
    markAsRead
  }
}

// Hook for conversation list with realtime updates
export function useConversationList() {
  const [conversations, setConversations] = useState<ConversationWithParticipants[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabase = createClient()

  const fetchConversations = useCallback(async (status?: 'active' | 'archived') => {
    setIsLoading(true)
    setError(null)

    try {
      const { getConversations } = await import('@/actions/messaging')
      const result = await getConversations(status)
      
      if (!result.success) {
        setError(result.error || 'Failed to load conversations')
        return
      }

      setConversations(result.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversations')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await fetchConversations()

      // Subscribe to conversation updates
      channelRef.current = supabase
        .channel('conversation-list')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversations'
          },
          async () => {
            if (mounted) {
              await fetchConversations()
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
          },
          async () => {
            // Refresh to update last message and unread counts
            if (mounted) {
              await fetchConversations()
            }
          }
        )
        .subscribe((status) => {
          setIsConnected(status === 'SUBSCRIBED')
        })
    }

    init()

    return () => {
      mounted = false
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [fetchConversations, supabase])

  return {
    conversations,
    isLoading,
    error,
    isConnected,
    refresh: fetchConversations
  }
}
