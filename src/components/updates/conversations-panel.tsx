'use client'

/**
 * ConversationsPanel - Conversation list for the Comms page.
 *
 * @description Renders a searchable, grouped list of conversations (channels,
 * DMs, experts). Designed to live in the left panel of the Comms two-panel layout.
 */

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/ui/user-avatar'
import {
  Search,
  Plus,
  Hash,
  User,
  Briefcase,
  BellOff,
  CheckSquare,
  Target,
  Loader2,
  MessageSquare
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { ConversationWithParticipants, ConversationType } from '@/lib/messaging/service'
import { getConversationDisplayName } from '@/lib/messaging/display-name'

interface ConversationsPanelProps {
  conversations: ConversationWithParticipants[]
  isLoading: boolean
  currentUserId: string
  selectedConversationId: string | null
  onSelectConversation: (id: string) => void
  onNewMessage: () => void
}

function getConversationIcon(type: ConversationType | undefined) {
  switch (type) {
    case 'task': return CheckSquare
    case 'objective': return Target
    case 'expert':
    case 'marketplace': return Briefcase
    case 'direct':
    default: return User
  }
}

export function ConversationsPanel({
  conversations,
  isLoading,
  currentUserId,
  selectedConversationId,
  onSelectConversation,
  onNewMessage,
}: ConversationsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const filtered = searchQuery
    ? conversations.filter(c =>
        getConversationDisplayName(c, currentUserId)
          .toLowerCase()
          .includes(searchQuery.toLowerCase())
      )
    : conversations

  const channels = filtered.filter(c =>
    c.conversation_type === 'task' || c.conversation_type === 'objective'
  )
  const dms = filtered.filter(c => c.conversation_type === 'direct')
  const experts = filtered.filter(c =>
    c.conversation_type === 'expert' || c.conversation_type === 'marketplace'
  )

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0)

  return (
    <div className="flex flex-col h-full">
      {/* Search + new message */}
      <div className="p-3 space-y-2 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
          <Button
            size="sm"
            onClick={onNewMessage}
            className="h-8 bg-international-orange hover:bg-international-orange-hover"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        {totalUnread > 0 && (
          <p className="text-xs text-muted-foreground">
            {totalUnread} unread message{totalUnread !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No conversations yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Start a conversation with a team member or expert.
            </p>
            <Button
              size="sm"
              onClick={onNewMessage}
              className="bg-international-orange hover:bg-international-orange-hover"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Message
            </Button>
          </div>
        ) : (
          <div className="py-2">
            {/* Channels (task/objective threads) */}
            {channels.length > 0 && (
              <ConversationGroup
                label="Channels"
                icon={Hash}
                conversations={channels}
                currentUserId={currentUserId}
                selectedId={selectedConversationId}
                onSelect={onSelectConversation}
              />
            )}

            {/* Direct Messages */}
            {dms.length > 0 && (
              <ConversationGroup
                label="Direct Messages"
                icon={User}
                conversations={dms}
                currentUserId={currentUserId}
                selectedId={selectedConversationId}
                onSelect={onSelectConversation}
              />
            )}

            {/* Experts */}
            {experts.length > 0 && (
              <ConversationGroup
                label="Experts"
                icon={Briefcase}
                conversations={experts}
                currentUserId={currentUserId}
                selectedId={selectedConversationId}
                onSelect={onSelectConversation}
              />
            )}

            {searchQuery && filtered.length === 0 && (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">
                  No conversations match &ldquo;{searchQuery}&rdquo;
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ConversationGroup({
  label,
  icon: GroupIcon,
  conversations,
  currentUserId,
  selectedId,
  onSelect,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  conversations: ConversationWithParticipants[]
  currentUserId: string
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="mb-2">
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        <GroupIcon className="h-3 w-3" />
        {label}
      </div>
      {conversations.map(conv => (
        <ConversationRow
          key={conv.id}
          conversation={conv}
          currentUserId={currentUserId}
          isSelected={conv.id === selectedId}
          onClick={() => onSelect(conv.id)}
        />
      ))}
    </div>
  )
}

function ConversationRow({
  conversation,
  currentUserId,
  isSelected,
  onClick,
}: {
  conversation: ConversationWithParticipants
  currentUserId: string
  isSelected: boolean
  onClick: () => void
}) {
  const displayName = getConversationDisplayName(conversation, currentUserId)
  const Icon = getConversationIcon(conversation.conversation_type)
  const isChannel = conversation.conversation_type === 'task' || conversation.conversation_type === 'objective'
  const otherParticipant = conversation.buyer?.id === currentUserId ? conversation.seller : conversation.buyer
  const hasUnread = (conversation.unread_count || 0) > 0

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
        isSelected
          ? 'bg-muted'
          : 'hover:bg-muted/50',
        hasUnread && 'font-medium'
      )}
    >
      {isChannel ? (
        <div className={cn(
          'h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0',
          conversation.conversation_type === 'task'
            ? 'bg-status-info-light'
            : 'bg-status-success-light'
        )}>
          <Icon className={cn(
            'h-4 w-4',
            conversation.conversation_type === 'task'
              ? 'text-status-info'
              : 'text-status-success'
          )} />
        </div>
      ) : (
        <UserAvatar
          name={otherParticipant?.full_name}
          avatarUrl={otherParticipant?.avatar_url}
          size="sm"
        />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={cn(
            'text-sm truncate',
            hasUnread ? 'font-semibold text-foreground' : 'text-foreground'
          )}>
            {displayName}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {!!(conversation as unknown as Record<string, unknown>).is_muted && (
              <BellOff className="h-3 w-3 text-muted-foreground" />
            )}
            {conversation.last_message && (
              <span className="text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(conversation.last_message.created_at), { addSuffix: false })}
              </span>
            )}
            {hasUnread && (
              <Badge variant="default" className="h-4 min-w-[16px] px-1 text-[10px] bg-international-orange">
                {(conversation.unread_count || 0) > 99 ? '99+' : conversation.unread_count}
              </Badge>
            )}
          </div>
        </div>
        {conversation.last_message && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {conversation.last_message.content || 'File attachment'}
          </p>
        )}
      </div>
    </button>
  )
}
