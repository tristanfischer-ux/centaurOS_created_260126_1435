'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { useConversationList } from '@/hooks/useConversation'
import type { ConversationWithParticipants } from '@/lib/messaging/service'
import { 
  MessageSquare, 
  Archive, 
  Search, 
  Package, 
  FileQuestion,
  Store,
  Inbox
} from 'lucide-react'

interface ConversationListProps {
  selectedId?: string | null
  onSelect: (conversation: ConversationWithParticipants) => void
  currentUserId: string
  className?: string
}

type FilterStatus = 'active' | 'archived'

function formatLastMessageTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffMins < 1) return 'Now'
  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}d`
  
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}


function getContextIcon(conversation: ConversationWithParticipants) {
  if (conversation.order_id) return <Package className="w-3 h-3" />
  if (conversation.rfq_id) return <FileQuestion className="w-3 h-3" />
  if (conversation.listing_id) return <Store className="w-3 h-3" />
  return <MessageSquare className="w-3 h-3" />
}

function getContextLabel(conversation: ConversationWithParticipants): string | null {
  if (conversation.order_id) return 'Order'
  if (conversation.rfq_id) return 'RFQ'
  if (conversation.listing_id) return 'Listing'
  return null
}

export function ConversationList({ 
  selectedId, 
  onSelect, 
  currentUserId,
  className 
}: ConversationListProps) {
  const { conversations, isLoading, error, refresh } = useConversationList()
  const [filter, setFilter] = useState<FilterStatus>('active')
  const [searchQuery, setSearchQuery] = useState('')

  // Filter conversations by status and search
  const filteredConversations = conversations.filter(conv => {
    // Status filter
    if (filter === 'active' && conv.status !== 'active') return false
    if (filter === 'archived' && conv.status !== 'archived') return false
    
    // Search filter
    if (searchQuery) {
      const otherParticipant = conv.buyer_id === currentUserId ? conv.seller : conv.buyer
      const searchLower = searchQuery.toLowerCase()
      const nameMatch = otherParticipant.full_name?.toLowerCase().includes(searchLower)
      const emailMatch = otherParticipant.email.toLowerCase().includes(searchLower)
      const contentMatch = conv.last_message?.content?.toLowerCase().includes(searchLower)
      
      if (!nameMatch && !emailMatch && !contentMatch) return false
    }
    
    return true
  })

  // Reload when filter changes
  useEffect(() => {
    refresh(filter)
  }, [filter, refresh])

  if (isLoading) {
    return (
      <div className={cn('flex flex-col', className)}>
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center p-8 text-center', className)}>
        <MessageSquare className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => refresh()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Search */}
      <div className="p-4 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setFilter('active')}
          className={cn(
            'flex-1 px-4 py-2 text-sm font-medium transition-colors',
            filter === 'active' 
              ? 'text-foreground border-b-2 border-international-orange' 
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <div className="flex items-center justify-center gap-2">
            <Inbox className="w-4 h-4" />
            Active
          </div>
        </button>
        <button
          onClick={() => setFilter('archived')}
          className={cn(
            'flex-1 px-4 py-2 text-sm font-medium transition-colors',
            filter === 'archived' 
              ? 'text-foreground border-b-2 border-international-orange' 
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <div className="flex items-center justify-center gap-2">
            <Archive className="w-4 h-4" />
            Archived
          </div>
        </button>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        {filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchQuery 
                ? 'No conversations match your search' 
                : filter === 'archived' 
                  ? 'No archived conversations' 
                  : 'No conversations yet'}
            </p>
          </div>
        ) : (
          <div className="py-2">
            {filteredConversations.map(conversation => {
              const otherParticipant = conversation.buyer_id === currentUserId 
                ? conversation.seller 
                : conversation.buyer
              const isSelected = selectedId === conversation.id
              const hasUnread = (conversation.unread_count || 0) > 0
              const contextLabel = getContextLabel(conversation)

              return (
                <button
                  key={conversation.id}
                  onClick={() => onSelect(conversation)}
                  className={cn(
                    'w-full px-4 py-3 flex items-start gap-3 text-left transition-colors',
                    isSelected 
                      ? 'bg-muted' 
                      : 'hover:bg-muted/50',
                    hasUnread && !isSelected && 'bg-orange-50/50 dark:bg-orange-950/20'
                  )}
                >
                  {/* Avatar */}
                  <UserAvatar
                    name={otherParticipant.full_name || otherParticipant.email}
                    avatarUrl={otherParticipant.avatar_url}
                    size="md"
                    className="flex-shrink-0"
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn(
                          'text-sm truncate',
                          hasUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground'
                        )}>
                          {otherParticipant.full_name || otherParticipant.email}
                        </span>
                        {contextLabel && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 flex items-center gap-1">
                            {getContextIcon(conversation)}
                            {contextLabel}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {conversation.last_message 
                          ? formatLastMessageTime(conversation.last_message.created_at)
                          : formatLastMessageTime(conversation.updated_at)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className={cn(
                        'text-xs truncate',
                        hasUnread ? 'text-foreground' : 'text-muted-foreground'
                      )}>
                        {conversation.last_message?.message_type === 'system' && '🔔 '}
                        {conversation.last_message?.message_type === 'file' && '📎 '}
                        {conversation.last_message?.content || 'No messages yet'}
                      </p>
                      {hasUnread && (
                        <Badge 
                          variant="default" 
                          className="rounded-full min-w-[20px] h-5 flex items-center justify-center text-[10px]"
                        >
                          {conversation.unread_count}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
