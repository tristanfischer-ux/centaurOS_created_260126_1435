'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { 
  CheckSquare, 
  Target, 
  MessageSquare, 
  Send, 
  ChevronRight,
  Loader2
} from 'lucide-react'
import { replyToActivity, markActivityRead } from '@/actions/activity'
import type { ActivityItem as ActivityItemType, ActivitySourceType } from '@/types/activity'

interface ActivityItemProps {
  item: ActivityItemType
  onReply?: () => void
}

export function ActivityItem({ item, onReply }: ActivityItemProps) {
  const [isReplying, setIsReplying] = useState(false)
  const [replyContent, setReplyContent] = useState('')
  const [isPending, startTransition] = useTransition()
  const [isRead, setIsRead] = useState(!item.is_unread)

  const getSourceIcon = () => {
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
        return `/tasks?task=${item.source.id}`
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
        onReply?.()
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
        !isRead && "bg-orange-50/30 border-orange-200/50"
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
          <UserAvatar 
            name={item.author.full_name || 'Unknown'} 
            role={item.author.role || undefined}
            size="sm"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm text-foreground truncate">
                {item.author.full_name || 'Unknown'}
              </span>
              <span className="text-muted-foreground text-xs">on</span>
              <Link 
                href={getSourceLink()}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {getSourceIcon()}
                <span className="font-medium">{getSourceLabel()}</span>
                <ChevronRight className="h-3 w-3" />
              </Link>
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
        <p className="text-sm text-foreground whitespace-pre-wrap line-clamp-4">
          {item.content}
        </p>

        {/* Reply Section */}
        {isReplying ? (
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
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground -ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={() => setIsReplying(true)}
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            Reply
          </Button>
        )}
      </div>
    </div>
  )
}
