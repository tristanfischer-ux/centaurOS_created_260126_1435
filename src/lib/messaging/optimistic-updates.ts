/**
 * Optimistic Updates with Retry Logic
 * 
 * Features:
 * - Show message immediately with "sending" state
 * - Retry failed messages automatically (up to 3 times)
 * - Show "failed" state with manual retry option
 * - Queue messages sent while offline
 */

import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/database.types'

type Message = Database['public']['Tables']['messages']['Row']

export type OptimisticMessage = Message & {
  optimistic?: boolean
  status?: 'sending' | 'sent' | 'failed'
  retryCount?: number
  localId?: string
  updated_at?: string
  is_edited?: boolean
  edited_at: null
  is_deleted: false
}

const MAX_RETRIES = 3
const RETRY_DELAY = 1000 // 1 second

/**
 * Send message with optimistic update
 */
export async function sendMessageOptimistic(
  conversationId: string,
  senderId: string,
  content: string,
  onOptimisticUpdate?: (message: OptimisticMessage) => void,
  onSuccess?: (message: Message) => void,
  onError?: (error: Error) => void
): Promise<boolean> {
  const supabase = createClient()
  
  // Create optimistic message
  const localId = `local-${Date.now()}-${Math.random()}`
  const optimisticMessage: OptimisticMessage = {
    id: localId,
    conversation_id: conversationId,
    sender_id: senderId,
    content,
    message_type: 'text',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    parent_message_id: null,
    file_url: null,
    task_id: null,
    objective_id: null,
    is_edited: false,
    edited_at: null,
    is_deleted: false,
    optimistic: true,
    status: 'sending',
    retryCount: 0,
    localId,
    is_read: true,
    last_reply_at: null,
    read_at: null,
    reply_count: 0
  }
  
  // Show optimistic message immediately
  onOptimisticUpdate?.(optimisticMessage)
  
  // Attempt to send
  let retries = 0
  while (retries <= MAX_RETRIES) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: senderId,
          content,
          message_type: 'text'
        })
        .select()
        .single()
      
      if (error) throw error
      
      // Success!
      onSuccess?.(data)
      return true
      
    } catch (error) {
      retries++
      
      if (retries > MAX_RETRIES) {
        // All retries exhausted
        const failedMessage: OptimisticMessage = {
          ...optimisticMessage,
          status: 'failed',
          retryCount: retries
        }
        onOptimisticUpdate?.(failedMessage)
        onError?.(error as Error)
        return false
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * retries))
    }
  }
  
  return false
}

/**
 * Retry a failed message
 */
export async function retryFailedMessage(
  message: OptimisticMessage,
  onOptimisticUpdate?: (message: OptimisticMessage) => void,
  onSuccess?: (message: Message) => void,
  onError?: (error: Error) => void
): Promise<boolean> {
  if (!message.localId) return false
  
  const supabase = createClient()
  
  // Update status to sending
  const retryingMessage: OptimisticMessage = {
    ...message,
    status: 'sending'
  }
  onOptimisticUpdate?.(retryingMessage)
  
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: message.conversation_id,
        sender_id: message.sender_id,
        content: message.content,
        message_type: message.message_type || 'text'
      })
      .select()
      .single()
    
    if (error) throw error
    
    // Success!
    onSuccess?.(data)
    return true
    
  } catch (error) {
    // Failed again
    const failedMessage: OptimisticMessage = {
      ...message,
      status: 'failed',
      retryCount: (message.retryCount || 0) + 1
    }
    onOptimisticUpdate?.(failedMessage)
    onError?.(error as Error)
    return false
  }
}

/**
 * Queue management for offline messages
 */
const QUEUE_KEY = 'message_queue'

interface QueuedMessage {
  conversationId: string
  senderId: string
  content: string
  timestamp: number
  localId: string
}

export function queueOfflineMessage(
  conversationId: string,
  senderId: string,
  content: string
): string {
  try {
    const localId = `local-${Date.now()}-${Math.random()}`
    const stored = localStorage.getItem(QUEUE_KEY)
    const queue: QueuedMessage[] = stored ? JSON.parse(stored) : []
    
    queue.push({
      conversationId,
      senderId,
      content,
      timestamp: Date.now(),
      localId
    })
    
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
    return localId
  } catch (error) {
    console.error('[queueOfflineMessage] Failed to queue:', error)
    return ''
  }
}

export function getQueuedMessages(): QueuedMessage[] {
  try {
    const stored = localStorage.getItem(QUEUE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('[getQueuedMessages] Failed to get queue:', error)
    return []
  }
}

export function clearQueuedMessage(localId: string): void {
  try {
    const stored = localStorage.getItem(QUEUE_KEY)
    if (stored) {
      const queue: QueuedMessage[] = JSON.parse(stored)
      const filtered = queue.filter(msg => msg.localId !== localId)
      localStorage.setItem(QUEUE_KEY, JSON.stringify(filtered))
    }
  } catch (error) {
    console.error('[clearQueuedMessage] Failed to clear:', error)
  }
}

/**
 * Process queued messages when back online
 */
export async function processQueuedMessages(
  onSuccess?: (localId: string, message: Message) => void,
  onError?: (localId: string, error: Error) => void
): Promise<void> {
  const queue = getQueuedMessages()
  if (queue.length === 0) return
  
  const supabase = createClient()
  
  for (const queued of queue) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: queued.conversationId,
          sender_id: queued.senderId,
          content: queued.content,
          message_type: 'text'
        })
        .select()
        .single()
      
      if (error) throw error
      
      clearQueuedMessage(queued.localId)
      onSuccess?.(queued.localId, data)
    } catch (error) {
      onError?.(queued.localId, error as Error)
    }
  }
}
