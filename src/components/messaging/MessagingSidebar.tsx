'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/ui/user-avatar'
import { ConversationThread } from './ConversationThread'
import { QuickComposeDialog } from './QuickComposeDialog'
import { useConversationList } from '@/hooks/useConversation'
import type { ConversationWithParticipants } from '@/lib/messaging/service'
import {
  MessageSquare,
  Search,
  Plus,
  ArrowLeft,
  PanelRightClose,
  PanelRight
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface MessagingSidebarProps {
  userId: string
  className?: string
  defaultCollapsed?: boolean
}

function getConversationDisplayName(
  conv: ConversationWithParticipants,
  currentUserId: string
): string {
  // For channels (task/objective), use the title
  if (conv.title) {
    return conv.title
  }

  // For direct/expert, show the other participant's name
  const otherParticipant = conv.buyer?.id === currentUserId ? conv.seller : conv.buyer
  return otherParticipant?.full_name || otherParticipant?.email || 'Unknown'
}

function ConversationListItem({
  conversation,
  currentUserId,
  isSelected,
  onClick
}: {
  conversation: ConversationWithParticipants
  currentUserId: string
  isSelected: boolean
  onClick: () => void
}) {
  const displayName = getConversationDisplayName(conversation, currentUserId)
  const otherParticipant = conversation.buyer?.id === currentUserId ? conversation.seller : conversation.buyer

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors overflow-hidden',
        'hover:bg-muted border border-transparent',
        isSelected && 'bg-muted border-border'
      )}
    >
      <UserAvatar
        name={otherParticipant?.full_name}
        avatarUrl={otherParticipant?.avatar_url}
        size="sm"
        className="flex-shrink-0"
      />
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-sm truncate min-w-0',
            conversation.unread_count && conversation.unread_count > 0 
              ? 'font-semibold text-foreground' 
              : 'text-foreground'
          )}>
            {displayName}
          </span>
          {conversation.last_message && (
            <span className="text-xs text-muted-foreground flex-shrink-0 ml-auto whitespace-nowrap">
              {formatDistanceToNow(new Date(conversation.last_message.created_at), { addSuffix: false })}
            </span>
          )}
        </div>
        {conversation.last_message && (
          <p className={cn(
            'text-xs truncate mt-0.5 max-w-full',
            conversation.unread_count && conversation.unread_count > 0 
              ? 'text-foreground' 
              : 'text-muted-foreground'
          )}>
            {conversation.last_message.content || 'File attachment'}
          </p>
        )}
      </div>
    </button>
  )
}

export function MessagingSidebar({ 
  userId, 
  className,
  defaultCollapsed = false 
}: MessagingSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCompose, setShowCompose] = useState(false)

  const { conversations, isLoading, refresh } = useConversationList(userId)

  // Filter to direct messages only (combine all types into one list)
  const directMessages = conversations.filter(c => 
    c.conversation_type === 'direct' || 
    c.conversation_type === 'expert' || 
    c.conversation_type === 'marketplace'
  )

  // Filter by search
  const filteredMessages = searchQuery
    ? directMessages.filter(c => {
        const displayName = getConversationDisplayName(c, userId).toLowerCase()
        return displayName.includes(searchQuery.toLowerCase())
      })
    : directMessages

  // Total unread count
  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)

  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConversationId(id)
  }, [])

  const handleCloseThread = useCallback(() => {
    setSelectedConversationId(null)
    refresh()
  }, [refresh])

  // Collapsed state - show just an icon button
  if (isCollapsed) {
    return (
      <div className={cn('flex flex-col border-l bg-card', className)}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="m-2 relative"
          aria-label="Open messages"
        >
          <PanelRight className="h-5 w-5" />
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-international-orange text-[10px] text-white flex items-center justify-center">
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </Button>
      </div>
    )
  }

  return (
    <div className={cn(
      'flex flex-col border-l bg-card w-80 lg:w-96',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-international-orange" />
          <h2 className="font-semibold text-foreground">Messages</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowCompose(true)}
            aria-label="New message"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(true)}
            aria-label="Collapse messages"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Selected conversation thread or list */}
      {selectedConversationId ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-2 border-b">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCloseThread}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to messages
            </Button>
          </div>
          <ConversationThread
            conversationId={selectedConversationId}
            currentUserId={userId}
            showHeader={true}
            className="flex-1"
          />
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Conversation list */}
          <ScrollArea className="flex-1">
            <div className="py-2">
              {isLoading ? (
                <div className="space-y-2 px-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredMessages.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <MessageSquare className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground mb-1">
                    {searchQuery ? `No conversations match "${searchQuery}"` : 'No conversations yet'}
                  </p>
                  {!searchQuery && (
                    <>
                      <p className="text-xs text-muted-foreground mb-4">
                        Start messaging team members or contact experts
                      </p>
                      <Button
                        size="sm"
                        onClick={() => setShowCompose(true)}
                        className="bg-international-orange hover:bg-international-orange-hover"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        New Message
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-1 px-2">
                  {filteredMessages.map((conv) => (
                    <ConversationListItem
                      key={conv.id}
                      conversation={conv}
                      currentUserId={userId}
                      isSelected={selectedConversationId === conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </>
      )}

      {/* Quick compose dialog */}
      <QuickComposeDialog
        open={showCompose}
        onOpenChange={setShowCompose}
        onConversationCreated={(convId) => {
          setShowCompose(false)
          setSelectedConversationId(convId)
          refresh()
        }}
      />
    </div>
  )
}
