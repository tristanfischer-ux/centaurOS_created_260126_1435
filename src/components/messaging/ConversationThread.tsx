'use client'

import { useState, useRef, useEffect, useCallback, FormEvent } from 'react'
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
  ChevronUp
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

interface TeamMember {
  id: string
  full_name: string
  email: string
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

export function ConversationThread({ 
  conversationId, 
  currentUserId, 
  onBack,
  showHeader = true,
  className,
  foundryId,
  members = [],
  enableCommands = true
}: ConversationThreadProps) {
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
    inputRef,
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

    const messageIds = messages.map(m => m.id)
    
    getBatchReplyCounts(messageIds).then(result => {
      if (result.success && result.data) {
        // Extract just the count from each entry
        const counts: Record<string, number> = {}
        for (const [id, data] of Object.entries(result.data)) {
          counts[id] = data.count
        }
        setReplyCounts(counts)
      }
    })
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

  // Handle file attachment (structure only)
  const handleFileClick = () => {
    // TODO: Implement file upload
    console.log('File attachment clicked - implement upload')
  }

  // Handle opening thread panel
  const handleOpenThread = (messageId: string) => {
    setSelectedMessageId(messageId)
    setThreadPanelOpen(true)
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
      {showHeader && otherParticipant && (
        <div className="h-16 border-b border-border flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            {onBack && (
              <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden" aria-label="Go back">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <UserAvatar
              name={otherParticipant.full_name || otherParticipant.email}
              avatarUrl={otherParticipant.avatar_url}
              size="md"
            />
            <div>
              <h3 className="font-medium text-sm">
                {otherParticipant.full_name || otherParticipant.email}
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

                  return (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isOwn={message.sender_id === currentUserId}
                      showAvatar={showAvatar}
                      replyCount={replyCounts[message.id] || 0}
                      lastReplyAt={message.last_reply_at || null}
                      onOpenThread={handleOpenThread}
                    />
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
