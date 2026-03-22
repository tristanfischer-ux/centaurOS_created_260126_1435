'use client'

import { useState, useRef, useEffect, useCallback, useMemo, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/ui/user-avatar'
import { MessageBubble, DateSeparator } from './MessageBubble'
import { CommandInput } from './CommandInput'
import { ThreadPanel } from './ThreadPanel'
import { useConversation } from '@/hooks/useConversation'
import { useMessagingShortcuts } from '@/hooks/useMessagingShortcuts'
import type { MessageWithSender } from '@/lib/messaging/service'
import { 
  Send, 
  Paperclip, 
  MoreVertical, 
  Archive, 
  ArrowLeft,
  Loader2,
  WifiOff,
  ChevronUp,
  ExternalLink,
  CheckSquare,
  Target
} from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { archiveConversation, unarchiveConversation, editMessage, deleteMessage } from '@/actions/messaging'
import { getBatchReplyCounts } from '@/actions/threads'
import { toggleStarMessage, togglePinMessage, markConversationUnread } from '@/actions/message-actions'
import { toast } from 'sonner'

interface TeamMember {
  id: string
  full_name: string
  email: string
}

interface Task {
  id: string
  title: string
  status: string | null
  task_number?: number
  objective_id?: string | null
}

interface Objective {
  id: string
  title: string
}

interface ConversationThreadProps {
  conversationId: string | null
  currentUserId: string
  onBack?: () => void
  showHeader?: boolean
  className?: string
  // New props for enhanced input with slash commands
  foundryId?: string
  members?: TeamMember[]
  enableCommands?: boolean
  // Context linking props
  tasks?: Task[]
  objectives?: Objective[]
}


// Extended message type with context
interface MessageWithContext extends MessageWithSender {
  task_id?: string | null
  objective_id?: string | null
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
  taskId?: string | null
  objectiveId?: string | null
  tasks: Task[]
  objectives: Objective[]
}

function MessageContextTag({ 
  taskId, 
  objectiveId, 
  tasks, 
  objectives 
}: MessageContextTagProps) {
  // Resolve task/objective from IDs
  const task = taskId ? tasks.find(t => t.id === taskId) : undefined
  const objective = objectiveId ? objectives.find(o => o.id === objectiveId) : undefined

  if (!task && !objective) return null

  return (
    <div className="mb-1 flex items-center gap-1">
      {task && (
        <Link 
          href={`/new-tasks?taskId=${task.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Badge variant="secondary" className="text-xs px-1.5 py-0 gap-1">
            <CheckSquare className="w-3 h-3" />
            #{task.task_number || '??'}: {task.title.length > 30 ? task.title.slice(0, 30) + '...' : task.title}
          </Badge>
          <ExternalLink className="w-3 h-3" />
        </Link>
      )}
      {objective && (
        <Link 
          href={`/new-objectives?objectiveId=${objective.id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Badge variant="secondary" className="text-xs px-1.5 py-0 gap-1">
            <Target className="w-3 h-3" />
            {objective.title.length > 30 ? objective.title.slice(0, 30) + '...' : objective.title}
          </Badge>
          <ExternalLink className="w-3 h-3" />
        </Link>
      )}
    </div>
  )
}

export function ConversationThread({ 
  conversationId, 
  currentUserId, 
  onBack,
  showHeader = true,
  className,
  foundryId,
  members = [],
  enableCommands = true,
  tasks = [],
  objectives = []
}: ConversationThreadProps) {
  const router = useRouter()
  const {
    messages,
    conversation,
    isLoading,
    error,
    sendMessage,
    loadMore,
    hasMore,
    isConnected
  } = useConversation(conversationId)

  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [threadPanelOpen, setThreadPanelOpen] = useState(false)
  const [replyCounts, setReplyCounts] = useState<Record<string, number>>({})
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  
  // Use enhanced input when foundryId is available
  const useEnhancedInput = enableCommands && !!foundryId
  
  // Wire up messaging shortcuts
  useMessagingShortcuts({
    onReplyInThread: () => {
      // Open thread panel for the most recent message
      if (messages.length > 0 && !threadPanelOpen) {
        const targetMessage = hoveredMessageId 
          ? messages.find(m => m.id === hoveredMessageId)
          : messages[messages.length - 1]
        if (targetMessage) {
          setSelectedMessageId(targetMessage.id)
          setThreadPanelOpen(true)
        }
      }
    },
    onStarMessage: async () => {
      // Star the hovered or last message
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
      // Pin the hovered or last message
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
      // Mark entire conversation as unread
      if (!conversationId) return
      const result = await markConversationUnread(conversationId)
      if (result.success) {
        toast.success('Conversation marked as unread')
      } else {
        toast.error(result.error || 'Failed to mark as unread')
      }
    },
    inputRef: inputRef as React.RefObject<HTMLInputElement>,
  })

  // Get other participant
  const otherParticipant = conversation
    ? conversation.buyer_id === currentUserId 
      ? conversation.seller 
      : conversation.buyer
    : null

  // Scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length])

  // Fetch reply counts for all messages
  useEffect(() => {
    if (messages.length === 0) return

    let stale = false
    const messageIds = messages.map(m => m.id)

    getBatchReplyCounts(messageIds).then(result => {
      if (stale) return
      if (result.success && result.data) {
        const counts: Record<string, number> = {}
        for (const [id, data] of Object.entries(result.data)) {
          counts[id] = data.count
        }
        setReplyCounts(counts)
      }
    })

    return () => { stale = true }
  }, [messages.length]) // Only refetch when message count changes

  // Handle send message
  const handleSend = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    
    const content = inputValue.trim()
    if (!content || isSending || !conversationId) return

    setIsSending(true)
    setInputValue('')

    try {
      const success = await sendMessage(content)
      if (!success) {
        setInputValue(content) // Restore input on failure
      }
    } catch (error) {
      console.error('[ConversationThread] Send failed:', error)
      setInputValue(content) // Restore input on failure
      toast.error('Failed to send message')
    } finally {
      setIsSending(false)
      inputRef.current?.focus()
    }
  }, [inputValue, isSending, conversationId, sendMessage])

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

  // Handle file attachment
  const [isUploadingFile, setIsUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileClick = () => {
    // Trigger file input click
    fileInputRef.current?.click()
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file size (10MB max)
    const MAX_SIZE = 10 * 1024 * 1024
    if (file.size > MAX_SIZE) {
      toast.error('File size must be less than 10MB')
      return
    }

    if (!conversationId) return
    setIsUploadingFile(true)

    try {
      // Upload file to server
      const formData = new FormData()
      formData.append('file', file)
      formData.append('conversationId', conversationId)

      const response = await fetch('/api/messages/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Upload failed')
      }

      const { path, filename } = await response.json()

      if (!path || typeof path !== 'string') {
        throw new Error('Upload response missing file path')
      }

      // Send message with file attachment using hook
      const success = await sendMessage(filename, path)
      if (!success) {
        throw new Error('Failed to send message')
      }

      toast.success('File attached successfully')

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

    } catch (error) {
      console.error('[ConversationThread] File upload failed:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to upload file')
    } finally {
      setIsUploadingFile(false)
    }
  }

  const handleEditMessage = useCallback(async (messageId: string, newContent: string) => {
    const result = await editMessage(messageId, newContent)
    if (result.success) { toast.success('Message edited') }
    else { toast.error(result.error || 'Failed to edit message') }
  }, [])

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    if (!confirm('Delete this message? This cannot be undone.')) return
    const result = await deleteMessage(messageId)
    if (result.success) { toast.success('Message deleted') }
    else { toast.error(result.error || 'Failed to delete message') }
  }, [])

  // Handle opening thread panel
  const handleOpenThread = (messageId: string) => {
    setSelectedMessageId(messageId)
    setThreadPanelOpen(true)
  }

  // Group messages by date
  const messageGroups = useMemo(() => groupMessagesByDate(messages), [messages])

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
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => router.refresh()}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      {showHeader && otherParticipant && (
        <div className="h-16 border-b border-border flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden" aria-label="Go back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <UserAvatar
              name={otherParticipant.full_name || 'Unknown'}
              avatarUrl={otherParticipant.avatar_url}
              size="md"
            />
            <div>
              <h3 className="font-medium text-sm">
                {otherParticipant.full_name || 'Unknown'}
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
      )}

      {/* Messages area - scrollable with min-h-0 for proper flexbox overflow */}
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

                  // Cast to MessageWithContext to access task_id/objective_id
                  const messageWithContext = message as MessageWithContext
                  const hasContext = messageWithContext.task_id || messageWithContext.objective_id

                  return (
                    <div key={message.id}>
                      {/* Context tag above message */}
                      {hasContext && (
                        <div className={cn(
                          'px-2',
                          message.sender_id === currentUserId ? 'text-right' : 'text-left'
                        )}>
                          <MessageContextTag
                            taskId={messageWithContext.task_id}
                            objectiveId={messageWithContext.objective_id}
                            tasks={tasks}
                            objectives={objectives}
                          />
                        </div>
                      )}
                      <MessageBubble
                        message={message}
                        isOwn={message.sender_id === currentUserId}
                        showAvatar={showAvatar}
                        replyCount={replyCounts[message.id] || 0}
                        lastReplyAt={message.last_reply_at || null}
                        onOpenThread={handleOpenThread}
                        onEditMessage={handleEditMessage}
                        onDeleteMessage={handleDeleteMessage}
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
      {useEnhancedInput ? (
        <CommandInput
          conversationId={conversationId}
          currentUserId={currentUserId}
          foundryId={foundryId!}
          members={members}
          onSend={sendMessage}
          onFileClick={handleFileClick}
          className="flex-shrink-0"
        />
      ) : (
        <form onSubmit={handleSend} className="border-t border-border p-4 flex-shrink-0">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
            style={{ display: 'none' }}
            aria-label="File upload"
          />
          
          <div className="flex items-center gap-2">
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={handleFileClick}
              disabled={isUploadingFile || isSending}
              className="flex-shrink-0"
              aria-label="Attach file"
            >
              {isUploadingFile ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Paperclip className="w-5 h-5" />
              )}
            </Button>
            
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Type a message..."
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
      )}

      {/* Thread Panel */}
      <ThreadPanel
        parentMessageId={selectedMessageId}
        open={threadPanelOpen}
        onClose={() => {
          setThreadPanelOpen(false)
          setSelectedMessageId(null)
        }}
      />
    </div>
  )
}
