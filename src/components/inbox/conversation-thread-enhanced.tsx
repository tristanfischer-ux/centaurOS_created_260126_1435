'use client'

import { useState, useRef, useEffect, useCallback, FormEvent } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/ui/user-avatar'
import { MessageBubble, DateSeparator } from '@/components/messaging/MessageBubble'
import { ContextSelector } from './context-selector'
import { useConversation } from '@/hooks/useConversation'
import { useMessagingShortcuts } from '@/hooks/useMessagingShortcuts'
import type { MessageWithSender } from '@/lib/messaging/service'
import type { MessageWithContext } from '@/types/messaging'
import { sendMessageWithContext } from '@/lib/messaging/service'
import { createClient } from '@/lib/supabase/client'
import { 
  Send, 
  Paperclip, 
  MoreVertical, 
  Archive, 
  ArrowLeft,
  Loader2,
  WifiOff,
  ChevronUp,
  ExternalLink
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { archiveConversation, unarchiveConversation } from '@/actions/messaging'
import { getBatchReplyCounts } from '@/actions/threads'
import { toggleStarMessage, togglePinMessage, markConversationUnread } from '@/actions/message-actions'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

interface Task {
  id: string
  title: string
  status: string | null
  task_number?: number
  objective_id?: string | null
  objective?: Objective | null
}

interface Objective {
  id: string
  title: string
}

interface ConversationThreadEnhancedProps {
  conversationId: string
  otherPersonId: string
  otherPersonName: string
  otherPersonAvatar?: string
  tasks: Task[]
  objectives: Objective[]
  currentUserId: string
  onClose?: () => void
  showHeader?: boolean
  className?: string
}

// Group messages by date
function groupMessagesByDate(messages: MessageWithSender[]): Map<string, MessageWithSender[]> {
  const groups = new Map<string, MessageWithSender[]>()
  
  for (const message of messages) {
    const dateKey = new Date(message.created_at).toLocaleDateString('en-US')
    const existing = groups.get(dateKey) || []
    existing.push(message)
    groups.set(dateKey, existing)
  }
  
  return groups
}

// Context tag component for messages
interface MessageContextTagProps {
  taskId?: string
  objectiveId?: string
  task?: { id: string; title: string; task_number: number }
  objective?: { id: string; title: string }
  tasks: Task[]
  objectives: Objective[]
}

function MessageContextTag({ 
  taskId, 
  objectiveId, 
  task, 
  objective, 
  tasks, 
  objectives 
}: MessageContextTagProps) {
  // Resolve task/objective if we only have IDs
  const resolvedTask = task || (taskId ? tasks.find(t => t.id === taskId) : undefined)
  const resolvedObjective = objective || (objectiveId ? objectives.find(o => o.id === objectiveId) : undefined)

  if (!resolvedTask && !resolvedObjective) return null

  return (
    <div className="mb-1">
      {resolvedTask && (
        <Link 
          href={`/tasks?taskId=${resolvedTask.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            Task #{resolvedTask.task_number || '??'}: {resolvedTask.title}
          </Badge>
          <ExternalLink className="w-3 h-3" />
        </Link>
      )}
      {resolvedObjective && (
        <Link 
          href={`/objectives?objectiveId=${resolvedObjective.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            Objective: {resolvedObjective.title}
          </Badge>
          <ExternalLink className="w-3 h-3" />
        </Link>
      )}
    </div>
  )
}

export function ConversationThreadEnhanced({ 
  conversationId, 
  otherPersonId,
  otherPersonName,
  otherPersonAvatar,
  tasks,
  objectives,
  currentUserId, 
  onClose,
  showHeader = true,
  className,
}: ConversationThreadEnhancedProps) {
  const {
    messages,
    conversation,
    isLoading,
    error,
    loadMore,
    hasMore,
    isConnected
  } = useConversation(conversationId)

  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [replyCounts, setReplyCounts] = useState<Record<string, number>>({})
  const [currentContext, setCurrentContext] = useState<{ taskId?: string; objectiveId?: string } | null>(null)
  const [recentContexts, setRecentContexts] = useState<Array<{ taskId?: string; objectiveId?: string }>>([])
  
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  
  // Wire up messaging shortcuts
  useMessagingShortcuts({
    onReplyInThread: () => {
      // Thread reply functionality - could be enhanced
      if (messages.length > 0) {
        const targetMessage = hoveredMessageId 
          ? messages.find(m => m.id === hoveredMessageId)
          : messages[messages.length - 1]
        if (targetMessage) {
          toast.info('Thread reply: Feature coming soon')
        }
      }
    },
    onStarMessage: async () => {
      const targetMessage = hoveredMessageId
        ? messages.find(m => m.id === hoveredMessageId)
        : messages[messages.length - 1]
      if (targetMessage) {
        const result = await toggleStarMessage(targetMessage.id)
        if (result.success) {
          toast.success(result.starred ? 'Message starred' : 'Message unstarred')
        } else {
          toast.error(result.error || 'Failed to toggle star')
        }
      }
    },
    onPinMessage: async () => {
      if (!conversationId) return
      const targetMessage = hoveredMessageId
        ? messages.find(m => m.id === hoveredMessageId)
        : messages[messages.length - 1]
      if (targetMessage) {
        const result = await togglePinMessage(targetMessage.id, conversationId)
        if (result.success) {
          toast.success(result.pinned ? 'Message pinned' : 'Message unpinned')
        } else {
          toast.error(result.error || 'Failed to toggle pin')
        }
      }
    },
    onMarkUnread: async () => {
      if (!conversationId) return
      const result = await markConversationUnread(conversationId)
      if (result.success) {
        toast.success('Conversation marked as unread')
      } else {
        toast.error(result.error || 'Failed to mark as unread')
      }
    },
    inputRef,
  })

  // Scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  // Fetch reply counts for all messages
  useEffect(() => {
    if (messages.length === 0) return

    const messageIds = messages.map(m => m.id)
    
    getBatchReplyCounts(messageIds).then(result => {
      if (result.success && result.data) {
        const counts: Record<string, number> = {}
        for (const [id, data] of Object.entries(result.data)) {
          counts[id] = data.count
        }
        setReplyCounts(counts)
      }
    })
  }, [messages.length])

  // Handle context change
  const handleContextChange = useCallback((context: { taskId?: string; objectiveId?: string } | null) => {
    setCurrentContext(context)
    
    // Track recent contexts (max 5)
    if (context) {
      setRecentContexts(prev => {
        const filtered = prev.filter(c => 
          c.taskId !== context.taskId || c.objectiveId !== context.objectiveId
        )
        return [context, ...filtered].slice(0, 5)
      })
    }
  }, [])

  // Handle send message with context
  const handleSend = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    
    const content = inputValue.trim()
    if (!content || isSending || !conversationId) return

    setIsSending(true)
    setInputValue('')

    try {
      const supabase = createClient()
      
      await sendMessageWithContext(supabase, {
        conversationId,
        senderId: currentUserId,
        content,
        taskId: currentContext?.taskId,
        objectiveId: currentContext?.objectiveId,
        messageType: 'text'
      })
      
      // Success - message will appear via real-time subscription
    } catch (error) {
      console.error('Failed to send message:', error)
      setInputValue(content) // Restore input on failure
      toast.error('Failed to send message')
    } finally {
      setIsSending(false)
      inputRef.current?.focus()
    }
  }, [inputValue, isSending, conversationId, currentUserId, currentContext])

  // Handle archive/unarchive
  const handleArchive = async () => {
    if (!conversationId || isArchiving) return
    
    setIsArchiving(true)
    try {
      if (conversation?.status === 'archived') {
        await unarchiveConversation(conversationId)
      } else {
        await archiveConversation(conversationId)
      }
    } finally {
      setIsArchiving(false)
    }
  }

  // Handle file attachment (structure only)
  const handleFileClick = () => {
    // TODO: Implement file upload
    toast.info('File attachment: Coming soon')
  }

  // Group messages by date
  const messageGroups = groupMessagesByDate(messages)

  // No conversation selected
  if (!conversationId) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full', className)}>
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium">No conversation selected</p>
          <p className="text-sm mt-1">Select a conversation to start messaging</p>
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading && messages.length === 0) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        {showHeader && (
          <div className="h-16 border-b border-border flex items-center px-4 gap-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <Skeleton className="h-5 w-32" />
          </div>
        )}
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className={cn('flex gap-2', i % 2 === 0 && 'flex-row-reverse')}>
              <Skeleton className="w-8 h-8 rounded-full" />
              <Skeleton className={cn('h-12 rounded-2xl', i % 2 === 0 ? 'w-1/3' : 'w-1/2')} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full', className)}>
        <div className="text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      {showHeader && (
        <div className="border-b border-border flex-shrink-0">
          <div className="h-16 flex items-center justify-between px-4">
            <div className="flex items-center gap-3">
              {onClose && (
                <Button variant="ghost" size="icon" onClick={onClose} className="md:hidden" aria-label="Go back">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              )}
              <UserAvatar
                name={otherPersonName}
                avatarUrl={otherPersonAvatar}
                size="md"
              />
              <div>
                <h3 className="font-medium text-sm">
                  {otherPersonName}
                </h3>
                {!isConnected && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <WifiOff className="w-3 h-3" />
                    <span>Reconnecting...</span>
                  </div>
                )}
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleArchive} disabled={isArchiving}>
                  <Archive className="w-4 h-4 mr-2" />
                  {conversation?.status === 'archived' ? 'Unarchive' : 'Archive'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Context Selector */}
          <div className="px-4 pb-3">
            <ContextSelector
              tasks={tasks}
              objectives={objectives}
              currentContext={currentContext}
              onContextChange={handleContextChange}
              recentContexts={recentContexts}
            />
          </div>
        </div>
      )}

      {/* Messages area */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-1">
          {/* Load more button */}
          {hasMore && (
            <div className="flex justify-center pb-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={loadMore}
                className="text-xs"
              >
                <ChevronUp className="w-4 h-4 mr-1" />
                Load older messages
              </Button>
            </div>
          )}

          {/* Messages grouped by date */}
          {Array.from(messageGroups.entries()).map(([dateKey, dayMessages]) => (
            <div key={dateKey}>
              <DateSeparator date={dayMessages[0].created_at} />
              <div className="space-y-2">
                {dayMessages.map((message, idx) => {
                  const prevMessage = dayMessages[idx - 1]
                  const showAvatar = !prevMessage || 
                    prevMessage.sender_id !== message.sender_id ||
                    message.message_type === 'system'

                  const messageWithContext = message as MessageWithContext

                  return (
                    <div key={message.id} onMouseEnter={() => setHoveredMessageId(message.id)} onMouseLeave={() => setHoveredMessageId(null)}>
                      {/* Context tag above message */}
                      {(messageWithContext.task_id || messageWithContext.objective_id) && (
                        <MessageContextTag
                          taskId={messageWithContext.task_id || undefined}
                          objectiveId={messageWithContext.objective_id || undefined}
                          task={messageWithContext.task}
                          objective={messageWithContext.objective}
                          tasks={tasks}
                          objectives={objectives}
                        />
                      )}
                      
                      <MessageBubble
                        message={message}
                        isOwn={message.sender_id === currentUserId}
                        showAvatar={showAvatar}
                        replyCount={replyCounts[message.id] || 0}
                        lastReplyAt={message.last_reply_at || null}
                        onOpenThread={() => toast.info('Thread panel: Coming soon')}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No messages yet. Start the conversation!
              </p>
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <form onSubmit={handleSend} className="border-t border-border p-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button 
            type="button" 
            variant="ghost" 
            size="icon" 
            onClick={handleFileClick}
            className="flex-shrink-0"
            aria-label="Attach file"
          >
            <Paperclip className="w-5 h-5" />
          </Button>
          
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={
              currentContext?.taskId 
                ? `Message about task...` 
                : currentContext?.objectiveId 
                ? `Message about objective...` 
                : 'Type a message...'
            }
            disabled={isSending}
            className="flex-1"
            autoComplete="off"
          />
          
          <Button 
            type="submit" 
            size="icon" 
            disabled={!inputValue.trim() || isSending}
            className="flex-shrink-0"
            aria-label={isSending ? "Sending message" : "Send message"}
          >
            {isSending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
