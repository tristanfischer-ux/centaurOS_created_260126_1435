'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { 
  CheckSquare, 
  Target, 
  MessageSquare, 
  Send, 
  ChevronRight,
  Loader2,
  GitCommit,
  History,
  Bot,
  ArrowRight,
  User,
  Info
} from 'lucide-react'
import { replyToActivity, markActivityRead } from '@/actions/activity'
import type { ActivityItem as ActivityItemType, ActivitySourceType, TaskHistoryActionType, TaskHistoryChanges } from '@/types/activity'

interface ActivityItemProps {
  item: ActivityItemType
  onReply?: () => void
  onTaskClick?: (taskId: string) => void
}

// Helper to get a human-readable label for history action types
function getActionTypeLabel(actionType: TaskHistoryActionType | string): string {
  const labels: Record<string, string> = {
    CREATED: 'Created',
    UPDATED: 'Updated',
    STATUS_CHANGE: 'Status Change',
    ASSIGNED: 'Assigned',
    COMPLETED: 'Completed',
    FORWARDED: 'Forwarded',
  }
  return labels[actionType] || actionType
}

// Helper to get badge variant based on action type
function getActionTypeBadgeVariant(actionType: TaskHistoryActionType | string): 'default' | 'secondary' | 'outline' {
  switch (actionType) {
    case 'CREATED':
      return 'default'
    case 'COMPLETED':
      return 'default'
    case 'STATUS_CHANGE':
      return 'secondary'
    default:
      return 'outline'
  }
}

// Helper to format change details for display in hover popover
function formatChangeDetails(changes: TaskHistoryChanges | undefined): Array<{ field: string; before?: string; after?: string }> {
  if (!changes) return []
  
  const details: Array<{ field: string; before?: string; after?: string }> = []
  
  // Status change
  if (changes.status) {
    details.push({
      field: 'Status',
      before: String(changes.status.old || ''),
      after: String(changes.status.new || '')
    })
  }
  
  // Assignee change
  if (changes.assignee) {
    details.push({
      field: 'Assignee',
      before: String(changes.assignee.old || 'Unassigned'),
      after: String(changes.assignee.new || 'Unassigned')
    })
  }
  
  // New assignee (for ASSIGNED action)
  if (changes.new_assignee && !changes.assignee) {
    details.push({
      field: 'Assigned to',
      after: String(changes.new_assignee)
    })
  }
  
  // Previous assignee (for reassignment)
  if (changes.previous_assignee && !changes.assignee) {
    details.push({
      field: 'Previous assignee',
      before: String(changes.previous_assignee)
    })
  }
  
  // Reason (for forwarding, etc.)
  if (changes.reason) {
    details.push({
      field: 'Reason',
      after: String(changes.reason)
    })
  }
  
  // Handle any other fields in the changes object
  const handledKeys = ['status', 'assignee', 'new_assignee', 'previous_assignee', 'reason']
  for (const [key, value] of Object.entries(changes)) {
    if (handledKeys.includes(key)) continue
    if (value === null || value === undefined) continue
    
    // Handle object values with old/new
    if (typeof value === 'object' && value !== null && 'old' in value && 'new' in value) {
      const typedValue = value as { old?: unknown; new?: unknown }
      details.push({
        field: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        before: String(typedValue.old ?? ''),
        after: String(typedValue.new ?? '')
      })
    } else if (typeof value === 'string' || typeof value === 'number') {
      details.push({
        field: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        after: String(value)
      })
    }
  }
  
  return details
}

export function ActivityItem({ item, onReply, onTaskClick }: ActivityItemProps) {
  const [isReplying, setIsReplying] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [isPending, startTransition] = useTransition()
  const [isRead, setIsRead] = useState(!item.is_unread)

  const isHistoryItem = item.type === 'task_history'
  const isSystemLog = item.is_system_log === true

  const getSourceIcon = () => {
    // For history items, use a different icon
    if (isHistoryItem) {
      return <GitCommit className="h-3.5 w-3.5" />
    }
    switch (item.source.type) {
      case 'task':
        return <CheckSquare className="h-3.5 w-3.5" />
      case 'objective':
        return <Target className="h-3.5 w-3.5" />
      case 'conversation':
        return <MessageSquare className="h-3.5 w-3.5" />
    }
  }

  const getSourceLabel = () => {
    // For history items, show it as a change event
    if (isHistoryItem) {
      return `Task #${item.source.task_number}`
    }
    switch (item.source.type) {
      case 'task':
        return `Task #${item.source.task_number}`
      case 'objective':
        return 'Objective'
      case 'conversation':
        return 'Message'
    }
  }

  const getSourceLink = () => {
    switch (item.source.type) {
      case 'task':
        return `/new-tasks?task=${item.source.id}`
      case 'objective':
        return `/objectives/${item.source.id}`
      case 'conversation':
        return `/messages?conversation=${item.source.id}`
    }
  }

  const handleMarkRead = () => {
    if (isRead) return
    
    startTransition(async () => {
      if (item.type === 'task_comment' || item.type === 'objective_comment') {
        await markActivityRead(item.type, item.id)
        setIsRead(true)
      }
    })
  }

  const handleReply = () => {
    if (!replyContent.trim()) return

    startTransition(async () => {
      const result = await replyToActivity(
        item.source.type as ActivitySourceType,
        item.source.id,
        replyContent.trim()
      )

      if (result.success) {
        setReplyContent('')
        setIsReplying(false)
        toast.success('Reply sent')
        onReply?.()
      } else {
        toast.error(result.error || 'Failed to send reply')
      }
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleReply()
    }
  }

  return (
    <div 
      className={cn(
        "group relative rounded-lg border bg-card p-4 transition-colors",
        !isRead && "bg-status-warning-light border-status-warning",
        // History items have a subtle different styling
        isHistoryItem && "bg-muted border-muted-foreground",
        // System logs have muted styling
        isSystemLog && "bg-muted border-muted-foreground"
      )}
      onMouseEnter={handleMarkRead}
    >
      {/* Unread indicator */}
      {!isRead && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-international-orange rounded-l-lg" />
      )}

      {/* Header: Author + Source + Time */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-3 min-w-0">
          {isSystemLog ? (
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
              <Bot className="h-4 w-4 text-muted-foreground" />
            </div>
          ) : (
            <UserAvatar 
              name={item.author.full_name || 'Unknown'} 
              role={item.author.role || undefined}
              size="sm"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm text-foreground truncate">
                {isSystemLog ? 'System' : (item.author.full_name || 'Unknown')}
              </span>
              {isSystemLog && (
                <Badge 
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 text-muted-foreground"
                >
                  Automated
                </Badge>
              )}
              {isHistoryItem && item.action_type && (
                <Badge 
                  variant={getActionTypeBadgeVariant(item.action_type)}
                  className="text-[10px] px-1.5 py-0"
                >
                  {getActionTypeLabel(item.action_type)}
                </Badge>
              )}
              <span className="text-muted-foreground text-xs">on</span>
              {item.source.type === 'task' && onTaskClick ? (
                <button
                  onClick={() => onTaskClick(item.source.id)}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {getSourceIcon()}
                  <span className="font-medium">{getSourceLabel()}</span>
                  <ChevronRight className="h-3 w-3" />
                </button>
              ) : (
                <Link 
                  href={getSourceLink()}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {getSourceIcon()}
                  <span className="font-medium">{getSourceLabel()}</span>
                  <ChevronRight className="h-3 w-3" />
                </Link>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {item.source.title}
            </p>
          </div>
        </div>

        <time className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
        </time>
      </div>

      {/* Content */}
      <div className="pl-11 space-y-3">
        {/* For history items with changes, wrap in HoverCard to show details */}
        {isHistoryItem && item.changes ? (
          <HoverCard openDelay={200}>
            <HoverCardTrigger asChild>
              <div className="inline-flex items-center gap-2 cursor-help group/hover">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                  {item.content}
                </p>
                <Info className="h-3.5 w-3.5 text-muted-foreground opacity-50 group-hover/hover:opacity-100 transition-opacity flex-shrink-0" />
              </div>
            </HoverCardTrigger>
            <HoverCardContent className="w-80" align="start">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">Change Details</span>
                </div>
                
                {/* Change details */}
                {formatChangeDetails(item.changes).length > 0 ? (
                  <div className="space-y-2">
                    {formatChangeDetails(item.changes).map((change, idx) => (
                      <div key={idx} className="text-sm">
                        <span className="text-muted-foreground">{change.field}:</span>
                        {change.before && change.after ? (
                          <div className="flex items-center gap-2 mt-0.5 pl-2">
                            <span className="text-foreground bg-status-error-light px-1.5 py-0.5 rounded text-xs line-through">
                              {change.before}
                            </span>
                            <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <span className="text-foreground bg-status-success-light px-1.5 py-0.5 rounded text-xs">
                              {change.after}
                            </span>
                          </div>
                        ) : change.after ? (
                          <span className="text-foreground ml-1">{change.after}</span>
                        ) : change.before ? (
                          <span className="text-muted-foreground ml-1 line-through">{change.before}</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No detailed changes recorded.
                  </p>
                )}
                
                {/* Metadata */}
                <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-2">
                    <User className="h-3 w-3" />
                    <span>Changed by {item.author.full_name || 'Unknown'}</span>
                  </div>
                  <div>
                    {format(new Date(item.created_at), 'MMM d, yyyy \'at\' h:mm a')}
                  </div>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        ) : (
          <p className={cn(
            "text-sm whitespace-pre-wrap line-clamp-4",
            (isHistoryItem || isSystemLog) ? "text-muted-foreground" : "text-foreground"
          )}>
            {item.content}
          </p>
        )}

        {/* Reply Section - Only show for comment types, not history or system logs */}
        {!isHistoryItem && !isSystemLog && isReplying ? (
          <div className="space-y-2">
            <Textarea
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your reply..."
              className="min-h-[80px] text-sm resize-none"
              autoFocus
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Press <kbd className="px-1 py-0.5 bg-muted text-[10px] rounded">⌘</kbd>+<kbd className="px-1 py-0.5 bg-muted text-[10px] rounded">Enter</kbd> to send
              </span>
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setIsReplying(false)
                    setReplyContent('')
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  size="sm"
                  onClick={handleReply}
                  disabled={!replyContent.trim() || isPending}
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-1" />
                      Reply
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (!isHistoryItem && !isSystemLog) ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground -ml-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            onClick={() => setIsReplying(true)}
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            Reply
          </Button>
        ) : null}
      </div>
    </div>
  )
}
