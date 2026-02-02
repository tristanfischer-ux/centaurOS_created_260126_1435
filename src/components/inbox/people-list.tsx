'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Users } from 'lucide-react'

interface PersonMember {
  id: string
  full_name: string
  avatar_url?: string
  role: string
  online_status?: 'online' | 'away' | 'offline'
  last_message?: string
  last_message_at?: string
  unread_count?: number
}

export interface PeopleListProps {
  members: PersonMember[]
  selectedPersonId?: string
  onSelectPerson: (personId: string) => void
  className?: string
}

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

function getPresenceColor(status: 'online' | 'away' | 'offline' | undefined): string {
  switch (status) {
    case 'online':
      return 'bg-status-success'
    case 'away':
      return 'bg-status-warning'
    case 'offline':
    default:
      return 'bg-muted-foreground/30'
  }
}

export function PeopleList({
  members,
  selectedPersonId,
  onSelectPerson,
  className
}: PeopleListProps) {
  const [searchQuery, setSearchQuery] = useState('')

  // Filter and group members
  const { online, offline, filtered } = useMemo(() => {
    // First filter by search query
    const filtered = members.filter(member => {
      if (!searchQuery) return true
      
      const searchLower = searchQuery.toLowerCase()
      const nameMatch = member.full_name.toLowerCase().includes(searchLower)
      const roleMatch = member.role.toLowerCase().includes(searchLower)
      const messageMatch = member.last_message?.toLowerCase().includes(searchLower)
      
      return nameMatch || roleMatch || messageMatch
    })

    // Group by online status
    const online = filtered.filter(m => m.online_status === 'online' || m.online_status === 'away')
    const offline = filtered.filter(m => !m.online_status || m.online_status === 'offline')

    // Sort each group
    const sortByName = (a: PersonMember, b: PersonMember) => 
      a.full_name.localeCompare(b.full_name)
    
    return {
      online: online.sort(sortByName),
      offline: offline.sort(sortByName),
      filtered
    }
  }, [members, searchQuery])

  const renderPerson = (member: PersonMember) => {
    const isSelected = selectedPersonId === member.id
    const hasUnread = (member.unread_count || 0) > 0
    const isOnline = member.online_status === 'online' || member.online_status === 'away'

    return (
      <button
        key={member.id}
        onClick={() => onSelectPerson(member.id)}
        className={cn(
          'w-full min-h-[44px] px-4 py-3 flex items-start gap-3 text-left transition-colors touch-action-manipulation',
          isSelected 
            ? 'bg-muted' 
            : 'hover:bg-muted/50',
          hasUnread && !isSelected && 'bg-orange-50/50'
        )}
      >
        {/* Avatar with presence indicator */}
        <div className="relative flex-shrink-0">
          <UserAvatar
            name={member.full_name}
            role={member.role}
            avatarUrl={member.avatar_url}
            size="md"
          />
          {/* Presence indicator */}
          <span
            className={cn(
              'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white',
              getPresenceColor(member.online_status)
            )}
            aria-label={member.online_status || 'offline'}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={cn(
              'text-sm truncate',
              hasUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground'
            )}>
              {member.full_name}
            </span>
            {member.last_message_at && (
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {formatLastMessageTime(member.last_message_at)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground truncate flex-1">
              {member.role}
            </span>
            {hasUnread && (
              <Badge 
                variant="default" 
                className="rounded-full min-w-[20px] h-5 flex items-center justify-center text-[10px] px-1.5"
              >
                {member.unread_count}
              </Badge>
            )}
          </div>

          {/* Last message preview */}
          {member.last_message && (
            <p className={cn(
              'text-xs truncate mt-1',
              hasUnread ? 'text-foreground' : 'text-muted-foreground'
            )}>
              {member.last_message}
            </p>
          )}
        </div>
      </button>
    )
  }

  return (
    <div className={cn(
      'flex flex-col h-full',
      'w-full md:w-[300px]',
      className
    )}>
      {/* Search bar */}
      <div className="p-4 border-b border-border flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search people..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            inputMode="search"
            enterKeyHint="search"
          />
        </div>
      </div>

      {/* People list */}
      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <Users className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchQuery 
                ? 'No people match your search' 
                : 'No people in your foundry yet'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Online section */}
            {online.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Online ({online.length})
                </div>
                <div>
                  {online.map(renderPerson)}
                </div>
              </div>
            )}

            {/* Offline section */}
            {offline.length > 0 && (
              <div>
                <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Offline ({offline.length})
                </div>
                <div>
                  {offline.map(renderPerson)}
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
