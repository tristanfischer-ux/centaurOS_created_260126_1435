'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/ui/user-avatar'
import { MessageBubble, DateSeparator } from '@/components/messaging/MessageBubble'
import { ContextSelector } from './context-selector'
import { useConversation } from '@/hooks/useConversation'
import { useMessagingShortcuts } from '@/hooks/useMessagingShortcuts'
import type { MessageWithSender } from '@/lib/messaging/service'
import type { MessageWithContext } from '@/lib/messaging/service'
import { sendMessageWithContext } from '@/lib/messaging/service'
import { createClient } from '@/lib/supabase/client'
import { 
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
import { CommandInput } from '@/components/messaging/CommandInput'

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

interface Member {
  id: string
  full_name: string
  email: string
}

interface ConversationThreadEnhancedProps {
  conversationId: string
  otherPersonId: string
  otherPersonName: string
  otherPersonAvatar?: string
  tasks: Task[]
  objectives: Objective[]
  currentUserId: string
  foundryId: string
  members?: Member[]
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
  foundryId,
  members = [],
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
    isConnected,
    sendMessage: hookSendMessage  // Use the hook's send which has optimistic updates
  } = useConversation(conversationId)

  const [isSending, setIsSending] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const [replyCounts, setReplyCounts] = useState<Record<string, number>>({})
  const [currentContext, setCurrentContext] = useState<{ taskId?: string; objectiveId?: string } | null>(null)
  const [recentContexts, setRecentContexts] = useState<Array<{ taskId?: string; objectiveId?: string }>>([])
  
  const scrollRef = useRef<HTMLDivElement>(null)
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

  // Handle send message with context (for CommandInput)
  // Uses sendMessageWithContext for task context (handles bridging with real message ID)
  // Falls back to hook's sendMessage for optimistic updates on non-task messages
  const handleSend = useCallback(async (content: string): Promise<boolean> => {
    console.log('[handleSend] Called with:', { content, conversationId, isSending })
    
    if (!content.trim()) {
      console.log('[handleSend] Empty content, returning false')
      return false
    }
    
    if (isSending) {
      console.log('[handleSend] Already sending, returning false')
      return false
    }
    
    if (!conversationId) {
      console.log('[handleSend] No conversationId, returning false')
      toast.error('No conversation selected')
      return false
    }

    setIsSending(true)

    try {
      // If there's a task context, use sendMessageWithContext which:
      // 1. Creates the message with task_id field
      // 2. Returns the message with its actual ID
      // 3. Automatically bridges to task_comments with the real message ID
      if (currentContext?.taskId) {
        console.log('[handleSend] Sending with task context via sendMessageWithContext...')
        const supabase = createClient()
        
        try {
          await sendMessageWithContext(supabase, {
            conversationId,
            senderId: currentUserId,
            content: content.trim(),
            taskId: currentContext.taskId,
            objectiveId: currentContext.objectiveId,
          })
          console.log('[handleSend] sendMessageWithContext succeeded')
          return true
        } catch (contextError) {
          console.error('[handleSend] Failed to send message with context:', contextError)
          toast.error('Failed to send message')
          return false
        }
      }
      
      // For non-task messages, use the hook's sendMessage which has optimistic updates
      console.log('[handleSend] Calling hookSendMessage...')
      const success = await hookSendMessage(content.trim())
      
      console.log('[handleSend] hookSendMessage returned:', success)
      
      if (!success) {
        toast.error('Failed to send message')
        return false
      }
      
      return true
    } catch (error) {
      console.error('[handleSend] Failed to send message:', error)
      toast.error('Failed to send message')
      return false
    } finally {
      setIsSending(false)
    }
  }, [isSending, conversationId, currentUserId, currentContext, hookSendMessage])

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

  // State for file upload
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploadingFile, setIsUploadingFile] = useState(false)
  
  // Handle file attachment
  const handleFileClick = () => {
    fileInputRef.current?.click()
  }
  
  // Handle file selection and upload
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setIsUploadingFile(true)
    
    try {
      // Import upload function dynamically
      const { uploadMessageFile, validateFile } = await import('@/lib/file-upload')
      
      // Validate file
      const validation = validateFile(file)
      if (!validation.valid) {
        toast.error(validation.error || 'Invalid file')
        return
      }
      
      // Upload file
      const result = await uploadMessageFile(file, conversationId, currentUserId)
      
      // Send message with file attachment using context-aware function
      const supabase = createClient()
      const { data: message, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content: result.fileName,
          message_type: 'file',
          file_url: result.url,
          task_id: currentContext?.taskId ?? null,
          objective_id: currentContext?.objectiveId ?? null,
        })
        .select()
        .single()
      
      if (error) {
        console.error('[ConversationThreadEnhanced] Failed to send file message:', error)
        toast.error('Failed to send file')
      } else {
        toast.success('File uploaded successfully')
      }
    } catch (error) {
      console.error('[ConversationThreadEnhanced] File upload error:', error)
      const message = error instanceof Error ? error.message : 'Failed to upload file'
      toast.error(message)
    } finally {
      setIsUploadingFile(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
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

      {/* Messages area - scrollable with flex-1 and min-h-0 for proper overflow */}
      <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
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

      {/* Hidden file input for file uploads */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
      />

      {/* Message input with @ mentions, slash commands, and # task references */}
      <CommandInput
        conversationId={conversationId}
        currentUserId={currentUserId}
        foundryId={foundryId}
        members={members}
        tasks={tasks}
        onSend={handleSend}
        onFileClick={handleFileClick}
        placeholder={
          currentContext?.taskId 
            ? `Message about task... (/ for commands, @ to mention, # to link task)` 
            : currentContext?.objectiveId 
            ? `Message about objective... (/ for commands, @ to mention, # to link task)` 
            : 'Type a message... (/ for commands, @ to mention, # to link task)'
        }
        disabled={isSending || isUploadingFile}
      />
    </div>
  )
}
