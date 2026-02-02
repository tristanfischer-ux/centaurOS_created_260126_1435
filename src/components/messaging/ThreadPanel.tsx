'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Send, MessageSquare } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { formatDistanceToNow } from 'date-fns'
import { getThread, sendThreadReply, type ThreadMessage, type ThreadSummary } from '@/actions/threads'
import { cn } from '@/lib/utils'

interface ThreadPanelProps {
  /** ID of the parent message to show thread for */
  parentMessageId: string | null
  /** Whether the panel is open */
  open: boolean
  /** Callback when panel should close */
  onClose: () => void
  /** Optional className */
  className?: string
}

/**
 * ThreadPanel - Slack-style thread replies side panel
 * 
 * @description Displays a parent message and all its replies in a side panel.
 * Allows sending new replies with optimistic updates.
 * 
 * @example
 * <ThreadPanel
 *   parentMessageId={selectedMessageId}
 *   open={threadOpen}
 *   onClose={() => setThreadOpen(false)}
 * />
 */
export function ThreadPanel({
  parentMessageId,
  open,
  onClose,
  className,
}: ThreadPanelProps) {
  const [thread, setThread] = useState<ThreadSummary | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const repliesEndRef = useRef<HTMLDivElement>(null)

  // Load thread when panel opens or parent message changes
  useEffect(() => {
    if (open && parentMessageId) {
      loadThread()
    }
  }, [open, parentMessageId])

  // Scroll to bottom when replies change
  useEffect(() => {
    if (repliesEndRef.current) {
      repliesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [thread?.replies.length])

  async function loadThread() {
    if (!parentMessageId) return

    setIsLoading(true)
    setError(null)

    const result = await getThread(parentMessageId)

    if (result.success && result.data) {
      setThread(result.data)
    } else {
      setError(result.error || 'Failed to load thread')
    }

    setIsLoading(false)
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault()

    if (!parentMessageId || !replyContent.trim() || isSending) return

    setIsSending(true)
    setError(null)

    const result = await sendThreadReply(parentMessageId, replyContent)

    if (result.success && result.data) {
      // Optimistic update: add reply to local state
      setThread((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          replies: [...prev.replies, result.data!],
          reply_count: prev.reply_count + 1,
        }
      })
      setReplyContent('')
    } else {
      setError(result.error || 'Failed to send reply')
    }

    setIsSending(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Send on Enter (not Shift+Enter)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendReply(e as any)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="right" className={cn('w-[480px] flex flex-col', className)}>
        <SheetHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Thread
            </SheetTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        {isLoading && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Loading thread...
          </div>
        )}

        {error && !isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-destructive mb-2">{error}</p>
              <Button variant="outline" onClick={loadThread}>
                Try Again
              </Button>
            </div>
          </div>
        )}

        {thread && !isLoading && (
          <>
            {/* Scrollable messages area */}
            <div className="flex-1 overflow-y-auto space-y-4 py-4">
              {/* Parent message */}
              <div className="bg-muted rounded-lg p-4">
                <MessageItem message={thread.parent_message} isParent />
              </div>

              {/* Replies */}
              {thread.replies.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="flex-1 border-t" />
                    <span>{thread.reply_count} {thread.reply_count === 1 ? 'reply' : 'replies'}</span>
                    <div className="flex-1 border-t" />
                  </div>

                  {thread.replies.map((reply) => (
                    <MessageItem key={reply.id} message={reply} />
                  ))}
                </div>
              )}

              {thread.replies.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No replies yet. Be the first to reply!</p>
                </div>
              )}

              <div ref={repliesEndRef} />
            </div>

            {/* Reply input */}
            <div className="border-t pt-4 mt-auto">
              <form onSubmit={handleSendReply} className="flex gap-2">
                <Input
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Reply to thread..."
                  disabled={isSending}
                  className="flex-1"
                />
                <Button
                  type="submit"
                  disabled={!replyContent.trim() || isSending}
                  size="icon"
                >
                  {isSending ? (
                    <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
              {error && (
                <p className="text-sm text-destructive mt-2">{error}</p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/**
 * MessageItem - Individual message display in thread
 */
function MessageItem({
  message,
  isParent = false,
}: {
  message: ThreadMessage
  isParent?: boolean
}) {
  const initials = message.sender?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || '?'

  return (
    <div className="flex gap-3">
      <Avatar className="h-8 w-8 flex-shrink-0">
        {message.sender?.avatar_url && (
          <AvatarImage src={message.sender.avatar_url} alt={message.sender.full_name || ''} />
        )}
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 mb-1">
          <span className={cn(
            'font-medium text-sm',
            isParent && 'text-foreground',
            !isParent && 'text-muted-foreground'
          )}>
            {message.sender?.full_name || 'Unknown User'}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
          </span>
          {isParent && (
            <span className="text-xs text-muted-foreground">(Original message)</span>
          )}
        </div>

        <p className="text-sm text-foreground whitespace-pre-wrap break-words">
          {message.content}
        </p>
      </div>
    </div>
  )
}
