'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Send, Loader2, MessageSquare } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar } from '@/components/ui/user-avatar'
import { format } from 'date-fns'
import { getThreadReplies, sendThreadReply, getThreadParent, type ThreadReply, type ThreadMessage } from '@/actions/threads'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface ThreadPanelProps {
  /** The parent message ID to show thread for */
  parentMessageId: string | null
  /** Called when the panel should close */
  onClose: () => void
  /** Whether the panel is open */
  open: boolean
}

/**
 * ThreadPanel - Slack-style thread reply panel
 * 
 * Shows thread replies in a slide-in panel on the right side.
 * Users can view replies and add new ones.
 */
export function ThreadPanel({ parentMessageId, onClose, open }: ThreadPanelProps) {
  const [parentMessage, setParentMessage] = useState<ThreadMessage | null>(null)
  const [replies, setReplies] = useState<ThreadReply[]>([])
  const [replyContent, setReplyContent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const repliesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const loadThread = useCallback(async () => {
    if (!parentMessageId) return

    setIsLoading(true)
    setError(null)

    try {
      // Load parent message and replies in parallel
      const [parentResult, repliesResult] = await Promise.all([
        getThreadParent(parentMessageId),
        getThreadReplies(parentMessageId),
      ])

      if (!parentResult.success) {
        setError(parentResult.error || 'Failed to load thread')
        return
      }

      if (!repliesResult.success) {
        setError(repliesResult.error || 'Failed to load replies')
        return
      }

      setParentMessage(parentResult.data || null)
      setReplies(repliesResult.data || [])
    } catch (err) {
      setError('Failed to load thread')
      console.error('Error loading thread:', err)
    } finally {
      setIsLoading(false)
    }
  }, [parentMessageId])

  // Load thread data when panel opens
  useEffect(() => {
    if (open && parentMessageId) {
      loadThread()
    } else {
      // Reset state when closed
      setParentMessage(null)
      setReplies([])
      setReplyContent('')
      setError(null)
    }
  }, [open, parentMessageId, loadThread])

  // Supabase Realtime subscription for new thread replies
  useEffect(() => {
    if (!open || !parentMessageId) return

    channelRef.current = supabase
      .channel(`thread-replies:${parentMessageId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `parent_id=eq.${parentMessageId}`
        },
        async (payload) => {
          // Fetch the full reply with sender info
          const { data: newReply } = await supabase
            .from('messages')
            .select(`
              *,
              sender:profiles!messages_sender_id_fkey(id, full_name, avatar_url, email, role)
            `)
            .eq('id', payload.new.id)
            .single()

          if (newReply) {
            setReplies(prev => {
              if (prev.some(r => r.id === newReply.id)) return prev
              return [...prev, newReply as unknown as ThreadReply]
            })
            setParentMessage(prev =>
              prev ? { ...prev, reply_count: prev.reply_count + 1 } : prev
            )
          }
        }
      )
      .subscribe()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [open, parentMessageId, supabase])

  // Auto-scroll to bottom when new replies arrive
  useEffect(() => {
    if (replies.length > 0) {
      repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [replies.length])

  // Focus textarea when panel opens
  useEffect(() => {
    if (open && !isLoading) {
      textareaRef.current?.focus()
    }
  }, [open, isLoading])

  async function handleSendReply() {
    if (!parentMessageId || !replyContent.trim() || isSending) return

    setIsSending(true)
    setError(null)

    try {
      const result = await sendThreadReply(parentMessageId, replyContent.trim())

      if (!result.success) {
        setError(result.error || 'Failed to send reply')
        return
      }

      // Add reply to list
      if (result.data) {
        setReplies(prev => [...prev, result.data!])
        setReplyContent('')
        
        // Update parent message reply count
        if (parentMessage) {
          setParentMessage({
            ...parentMessage,
            reply_count: parentMessage.reply_count + 1,
          })
        }
      }
    } catch (err) {
      setError('Failed to send reply')
      console.error('Error sending reply:', err)
    } finally {
      setIsSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd+Enter or Ctrl+Enter to send
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSendReply()
    }
  }


  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="lg"
        className="flex h-[85dvh] sm:h-auto sm:max-h-[90dvh] flex-col gap-0 p-0 overflow-hidden"
      >
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between gap-2 px-6 py-4 pr-12 border-b shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="h-5 w-5 shrink-0 text-muted-foreground" />
            <DialogTitle className="text-base">Thread</DialogTitle>
            {parentMessage && (
              <span className="text-sm text-muted-foreground shrink-0">
                {parentMessage.reply_count} {parentMessage.reply_count === 1 ? 'reply' : 'replies'}
              </span>
            )}
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
              <p className="text-destructive text-center">{error}</p>
              <Button variant="outline" onClick={loadThread}>
                Retry
              </Button>
            </div>
          ) : (
            <div className="space-y-6 px-6 py-4">
              {/* Parent Message */}
              {parentMessage && (
                <div className="pb-6 border-b">
                  <div className="flex gap-3">
                    <UserAvatar
                      name={parentMessage.sender?.full_name}
                      avatarUrl={parentMessage.sender?.avatar_url}
                      role={parentMessage.sender?.role}
                      size="md"
                      className="flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-semibold text-foreground">
                          {parentMessage.sender?.full_name || 'Unknown User'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(parentMessage.created_at), 'MMM d, h:mm a')}
                        </span>
                      </div>
                      <div className="text-foreground whitespace-pre-wrap break-words">
                        {parentMessage.content}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Thread Replies */}
              {replies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No replies yet</p>
                  <p className="text-sm mt-1">Be the first to reply!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {replies.map((reply) => (
                    <div key={reply.id} className="flex gap-3">
                      <UserAvatar
                        name={reply.sender?.full_name}
                        avatarUrl={reply.sender?.avatar_url}
                        role={reply.sender?.role}
                        size="sm"
                        className="flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="font-medium text-sm text-foreground">
                            {reply.sender?.full_name || 'Unknown User'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(reply.created_at), 'h:mm a')}
                          </span>
                        </div>
                        <div className="text-sm text-foreground whitespace-pre-wrap break-words">
                          {reply.content}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={repliesEndRef} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Reply Input */}
        {!isLoading && !error && (
          <div className="border-t p-4">
            <div className="space-y-2">
              <Textarea
                ref={textareaRef}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Reply to ${parentMessage?.sender?.full_name || 'thread'}...`}
                className="min-h-[80px] resize-none"
                disabled={isSending}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {isSending ? 'Sending...' : (
                    <>
                      <span className="sm:hidden">Tap Send to reply</span>
                      <span className="hidden sm:inline">Cmd+Enter to send</span>
                    </>
                  )}
                </span>
                <Button
                  onClick={handleSendReply}
                  disabled={!replyContent.trim() || isSending}
                  size="sm"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
