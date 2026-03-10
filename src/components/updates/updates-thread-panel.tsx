'use client'

/**
 * UpdatesThreadPanel Component
 *
 * @description The right panel of the Updates page. Shows the full
 * conversation thread for a selected task or objective, including
 * source metadata, all notes chronologically, and an inline reply input.
 *
 * @component
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/ui/user-avatar'
import {
  Send,
  Loader2,
  CheckSquare,
  Target,
  MessageSquare,
  Calendar,
  Users,
  ExternalLink,
  ChevronRight,
  Link2
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { getThreadForSource, replyToActivity, markMultipleActivityRead } from '@/actions/activity'
import type { ThreadData, ThreadItem } from '@/actions/activity'
import type { ActivitySourceType } from '@/types/activity'

interface UpdatesThreadPanelProps {
  /** Source type (task, objective, or conversation) */
  sourceType: 'task' | 'objective' | 'conversation'
  /** Source ID */
  sourceId: string
  /** Current user ID (to identify own messages) */
  currentUserId: string
  /** Callback when items are marked as read */
  onItemsRead?: () => void
}

/**
 * Displays the full thread for a task or objective with metadata and inline reply.
 */
export function UpdatesThreadPanel({
  sourceType,
  sourceId,
  currentUserId,
  onItemsRead
}: UpdatesThreadPanelProps) {
  const [threadData, setThreadData] = useState<ThreadData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [replyContent, setReplyContent] = useState('')
  const [isSending, setIsSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const onItemsReadRef = useRef(onItemsRead)
  onItemsReadRef.current = onItemsRead
  const activeSourceRef = useRef(sourceId)
  activeSourceRef.current = sourceId

  // Fetch thread data
  const fetchThread = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getThreadForSource(sourceType, sourceId)
      // Guard: if user switched sources while fetch was in-flight, discard
      if (activeSourceRef.current !== sourceId) return

      if (result.success && result.data) {
        setThreadData(result.data)

        // Mark unread items as read (conversations don't have per-message read tracking)
        if (sourceType !== 'conversation') {
          const unreadItems = result.data.items
            .filter(item => item.is_unread)
            .map(item => ({
              type: (sourceType === 'task' ? 'task_comment' : 'objective_comment') as 'task_comment' | 'objective_comment',
              commentId: item.id
            }))

          if (unreadItems.length > 0) {
            await markMultipleActivityRead(unreadItems)
            onItemsReadRef.current?.()
          }
        } else {
          // For conversations, just notify parent that we've viewed them
          onItemsReadRef.current?.()
        }
      }
    } catch (error) {
      console.error('[UpdatesThreadPanel] Failed to fetch thread:', error)
      toast.error('Failed to load thread')
    } finally {
      setIsLoading(false)
    }
  }, [sourceType, sourceId])

  useEffect(() => {
    fetchThread()
  }, [fetchThread])

  // Scroll to bottom when thread loads
  useEffect(() => {
    if (threadData && scrollRef.current) {
      const el = scrollRef.current
      // Slight delay to allow render
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    }
  }, [threadData])

  // Realtime subscription for new comments (task/objective only — conversations use useConversation)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    if (sourceType === 'conversation') return

    const table = sourceType === 'task' ? 'task_comments' : 'objective_comments'
    const filterCol = sourceType === 'task' ? 'task_id' : 'objective_id'

    const channel = supabase
      .channel(`thread-${sourceType}-${sourceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table,
          filter: `${filterCol}=eq.${sourceId}`
        },
        async (payload: { new: { id: string; user_id: string; content: string; created_at: string; is_system_log: boolean } }) => {
          const row = payload.new
          if (row.user_id === currentUserId) return

          const { data: author } = await supabase
            .from('profiles')
            .select('id, full_name, avatar_url, role')
            .eq('id', row.user_id)
            .single()

          if (!author) return

          const newItem: ThreadItem = {
            id: row.id,
            content: row.content,
            created_at: row.created_at,
            is_system_log: row.is_system_log,
            is_unread: true,
            author: {
              id: author.id,
              full_name: author.full_name,
              avatar_url: author.avatar_url,
              role: author.role
            }
          }

          setThreadData(prev => {
            if (!prev) return prev
            if (prev.items.some(i => i.id === newItem.id)) return prev
            return { ...prev, items: [...prev.items, newItem] }
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [sourceType, sourceId, currentUserId, supabase])

  // Handle reply
  const handleReply = async () => {
    if (!replyContent.trim() || isSending) return

    setIsSending(true)
    try {
      const result = await replyToActivity(sourceType as ActivitySourceType, sourceId, replyContent.trim())
      if (result.success) {
        setReplyContent('')
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto'
        }
        // Optimistically append the returned ThreadItem
        if (result.data && threadData) {
          setThreadData(prev => {
            if (!prev) return prev
            if (prev.items.some(i => i.id === result.data!.id)) return prev
            return { ...prev, items: [...prev.items, result.data!] }
          })
        }
        toast.success('Reply sent')
      } else {
        toast.error(result.error || 'Failed to send reply')
      }
    } catch (error) {
      console.error('[UpdatesThreadPanel] Failed to send reply:', error)
      toast.error('Failed to send reply')
    } finally {
      setIsSending(false)
    }
  }

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(
      () => toast.success('Link copied to clipboard'),
      () => toast.error('Failed to copy link')
    )
  }

  // Auto-resize textarea
  const handleTextareaInput = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  // Handle Ctrl+Enter to send
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleReply()
    }
  }

  if (isLoading) {
    return <ThreadSkeleton />
  }

  if (!threadData) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">Failed to load thread</p>
      </div>
    )
  }

  const { source, items } = threadData
  const isTask = source.type === 'task'
  const isConversation = source.type === 'conversation'
  const linkHref = isTask
    ? `/new-tasks?taskId=${source.id}`
    : `/new-objectives`

  // Choose icon and color based on source type
  const sourceIcon = isTask
    ? { Icon: CheckSquare, colorClass: 'bg-electric-blue/10', iconColor: 'text-electric-blue' }
    : isConversation
      ? { Icon: MessageSquare, colorClass: 'bg-status-info-light', iconColor: 'text-status-info' }
      : { Icon: Target, colorClass: 'bg-international-orange/10', iconColor: 'text-international-orange' }

  return (
    <div className="flex flex-col h-full">
      {/* Source metadata bar */}
      <div className="border-b border-border p-4 space-y-3 flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={cn(
              'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
              sourceIcon.colorClass
            )}>
              <sourceIcon.Icon className={cn('h-4 w-4', sourceIcon.iconColor)} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">
                {source.title}
              </h3>
              {source.task_number && (
                <span className="text-xs text-muted-foreground">Task #{source.task_number}</span>
              )}
              {source.objective && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Target className="h-3 w-3" />
                  {source.objective.title}
                </p>
              )}
              {isConversation && source.participants && source.participants.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {source.participants.map(p => p.full_name || 'Unknown').join(', ')}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleCopyLink}
              className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Copy link"
            >
              <Link2 className="h-4 w-4" />
            </button>
            {!isConversation && (
              <Link
                href={linkHref}
                className="text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                title={`Open in ${isTask ? 'Tasks' : 'Objectives'}`}
              >
                <ExternalLink className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>

        {/* Metadata chips */}
        <div className="flex flex-wrap items-center gap-2">
          {source.status && (
            <Badge variant="outline" className="text-xs">
              {source.status}
            </Badge>
          )}
          {source.progress !== undefined && source.progress !== null && (
            <Badge variant="outline" className="text-xs">
              {source.progress}% complete
            </Badge>
          )}
          {source.end_date && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              Due {format(new Date(source.end_date), 'MMM d, yyyy')}
            </div>
          )}
          {source.assignees && source.assignees.length > 0 && (
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3 text-muted-foreground" />
              <div className="flex -space-x-1">
                {source.assignees.slice(0, 3).map((assignee) => (
                  <UserAvatar
                    key={assignee.id}
                    name={assignee.full_name || '?'}
                    role={assignee.role}
                    avatarUrl={assignee.avatar_url}
                    size="xs"
                  />
                ))}
              </div>
              {source.assignees.length > 3 && (
                <span className="text-xs text-muted-foreground ml-1">
                  +{source.assignees.length - 3}
                </span>
              )}
            </div>
          )}
          {source.participants && source.participants.length > 0 && (
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3 text-muted-foreground" />
              <div className="flex -space-x-1">
                {source.participants.slice(0, 3).map((participant) => (
                  <UserAvatar
                    key={participant.id}
                    name={participant.full_name || '?'}
                    role={participant.role}
                    avatarUrl={participant.avatar_url}
                    size="xs"
                  />
                ))}
              </div>
              {source.participants.length > 3 && (
                <span className="text-xs text-muted-foreground ml-1">
                  +{source.participants.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Thread messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {items.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">No notes yet. Be the first to add one.</p>
          </div>
        ) : (
          items.map((item) => (
            <ThreadMessage
              key={item.id}
              item={item}
              isOwnMessage={item.author.id === currentUserId}
            />
          ))
        )}
      </div>

      {/* Inline reply */}
      <div className="border-t border-border p-3 flex-shrink-0">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            placeholder="Add a note..."
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            onInput={handleTextareaInput}
            onKeyDown={handleKeyDown}
            className="min-h-[40px] max-h-[120px] resize-none text-sm"
            rows={1}
          />
          <Button
            size="sm"
            onClick={handleReply}
            disabled={!replyContent.trim() || isSending}
            className="bg-international-orange hover:bg-international-orange-hover flex-shrink-0 min-h-[44px] min-w-[44px]"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1 pl-1">
          <span className="sm:hidden">Tap Send to reply</span>
          <span className="hidden sm:inline">Press Cmd+Enter to send</span>
        </p>
      </div>
    </div>
  )
}

/**
 * Single message in the thread.
 */
function ThreadMessage({ item, isOwnMessage }: { item: ThreadItem; isOwnMessage: boolean }) {
  if (item.is_system_log) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[10px] text-muted-foreground bg-muted px-3 py-1 rounded-full uppercase tracking-wider">
          {item.content}
        </span>
      </div>
    )
  }

  return (
    <div className={cn('flex gap-3', isOwnMessage && 'flex-row-reverse')}>
      <UserAvatar
        name={item.author.full_name || '?'}
        role={item.author.role}
        avatarUrl={item.author.avatar_url}
        size="sm"
      />
      <div className={cn('flex flex-col max-w-[80%]', isOwnMessage ? 'items-end' : 'items-start')}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-foreground">
            {isOwnMessage ? 'You' : (item.author.full_name || 'Unknown')}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatTimeDetailed(item.created_at)}
          </span>
        </div>
        <div className={cn(
          'rounded-lg px-3 py-2 text-sm leading-relaxed break-words',
          isOwnMessage
            ? 'bg-international-orange/10 text-foreground'
            : 'bg-muted text-foreground'
        )}>
          {item.content}
        </div>
      </div>
    </div>
  )
}

/**
 * Formats a date for display in the thread (relative for recent, absolute for older).
 */
function formatTimeDetailed(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = diffMs / (1000 * 60 * 60)

    if (diffHours < 24) {
      return formatDistanceToNow(date, { addSuffix: true })
    }
    return format(date, 'MMM d, h:mm a')
  } catch {
    return ''
  }
}

/**
 * Loading skeleton for the thread panel.
 */
function ThreadSkeleton() {
  return (
    <div className="flex flex-col h-full">
      {/* Metadata skeleton */}
      <div className="border-b border-border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>

      {/* Messages skeleton */}
      <div className="flex-1 p-4 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={cn('flex gap-3', i % 2 === 1 && 'flex-row-reverse')}>
            <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
            <div className={cn('space-y-1.5', i % 2 === 1 ? 'items-end' : 'items-start')}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-16 w-56 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Reply skeleton */}
      <div className="border-t border-border p-3">
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    </div>
  )
}
