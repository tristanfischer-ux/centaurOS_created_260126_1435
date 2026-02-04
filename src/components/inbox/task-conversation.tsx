'use client'

import { useState, useEffect, useRef, FormEvent, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { UserAvatar } from '@/components/ui/user-avatar'
import { MentionInput } from '@/components/ui/mention-input'
import { createClient } from '@/lib/supabase/client'
import { getTaskThread, sendMessageWithContext } from '@/lib/messaging/service'
import { acceptTask, rejectTask, completeTask, forwardTask } from '@/actions/tasks'
import { startTaskDiscussion } from '@/actions/messaging'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import {
  X,
  Check,
  Forward,
  Send,
  Loader2,
  MessageSquare,
  FileText,
  Target,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getStatusBadgeClass } from '@/lib/status-colors'
import type { TaskThreadItem } from '@/types/tasks'
import type { Database } from '@/types/database.types'

// Profile type from task thread
type Profile = {
  id: string
  full_name: string | null
  avatar_url: string | null
  email: string
  role: Database['public']['Enums']['member_role']
  foundry_id?: string | null
}

// Task type with relations
type Task = {
  id: string
  task_number: number
  title: string
  description: string | null
  status: string
  objective_id?: string | null
  assigned_to?: string | null
  objective?: {
    id: string
    title: string
  } | null
  assignee?: Profile | null
}

interface TaskConversationProps {
  taskId: string
  task: Task
  currentUserId: string
  members?: Profile[]
  onClose?: () => void
  showHeader?: boolean
  className?: string
}

// Thread item component for displaying messages and comments
function ThreadItem({ 
  item, 
  isCurrentUser 
}: { 
  item: TaskThreadItem
  isCurrentUser: boolean 
}) {
  const isMessage = item.source === 'message'
  const isComment = item.source === 'comment'
  const author = item.author

  return (
    <div className="flex gap-3 group">
      {/* Avatar */}
      <UserAvatar
        name={author.full_name || author.email}
        avatarUrl={author.avatar_url}
        size="md"
        className="flex-shrink-0"
      />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header with name, badge, and timestamp */}
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-medium text-sm text-foreground">
            {author.full_name || author.email}
          </span>
          
          {/* Source badge */}
          {isMessage && (
            <Badge 
              variant="outline" 
              className="h-5 px-1.5 text-[10px] gap-1 border-electric-blue/30 text-electric-blue"
            >
              <MessageSquare className="h-2.5 w-2.5" />
              Message
            </Badge>
          )}
          {isComment && (
            <Badge 
              variant="outline" 
              className="h-5 px-1.5 text-[10px] gap-1 border-muted-foreground/30 text-muted-foreground"
            >
              <FileText className="h-2.5 w-2.5" />
              Note
            </Badge>
          )}
          
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
          </span>
        </div>

        {/* Message content */}
        <div className={cn(
          'rounded-lg px-3 py-2 text-sm break-words',
          isMessage 
            ? 'bg-electric-blue/5 border border-electric-blue/20' 
            : 'bg-muted/50 border border-border'
        )}>
          <p className="whitespace-pre-wrap">{item.content}</p>
        </div>
      </div>
    </div>
  )
}

export function TaskConversation({
  taskId,
  task,
  currentUserId,
  members = [],
  onClose,
  showHeader = true,
  className,
}: TaskConversationProps) {
  const supabase = useMemo(() => createClient(), [])
  const [thread, setThread] = useState<TaskThreadItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isActionLoading, setIsActionLoading] = useState(false)
  
  // Action dialogs
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showForwardDialog, setShowForwardDialog] = useState(false)
  const [forwardToId, setForwardToId] = useState('')
  const [forwardReason, setForwardReason] = useState('')

  const bottomRef = useRef<HTMLDivElement>(null)

  // Check if current user is assignee
  const isAssignee = task.assignee?.id === currentUserId || task.assigned_to === currentUserId

  // Get unique participants from thread
  const participants = useMemo(() => {
    const participantMap = new Map<string, Profile>()
    
    thread.forEach(item => {
      if (!participantMap.has(item.author.id)) {
        participantMap.set(item.author.id, item.author)
      }
    })
    
    return Array.from(participantMap.values())
  }, [thread])

  // Fetch thread on mount and set up real-time subscription
  useEffect(() => {
    let mounted = true

    const fetchThread = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const items = await getTaskThread(supabase, taskId)
        if (mounted) {
          setThread(items)
        }
      } catch (err) {
        console.error('Failed to fetch task thread:', err)
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load thread')
        }
      } finally {
        if (mounted) {
          setIsLoading(false)
        }
      }
    }

    fetchThread()

    // Set up real-time subscriptions for messages and comments
    const messagesChannel = supabase
      .channel(`task-messages-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `task_id=eq.${taskId}`,
        },
        () => {
          fetchThread()
        }
      )
      .subscribe()

    const commentsChannel = supabase
      .channel(`task-comments-${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_comments',
          filter: `task_id=eq.${taskId}`,
        },
        () => {
          fetchThread()
        }
      )
      .subscribe()

    return () => {
      mounted = false
      messagesChannel.unsubscribe()
      commentsChannel.unsubscribe()
    }
  }, [taskId, supabase])

  // Scroll to bottom when thread updates
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [thread.length])

  // Handle send message
  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    
    const content = inputValue.trim()
    if (!content || isSending) return

    setIsSending(true)
    setInputValue('')

    try {
      // Get or create a conversation for this task
      // For now, we'll use a direct approach by finding existing conversation or creating one
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id')
        .eq('task_id', taskId)
        .eq('conversation_type', 'task')
        .eq('status', 'active')
        .maybeSingle()

      const conversationId = conversations?.id

      // If no conversation exists, create one via the server action
      if (!conversationId) {
        // Create conversation and send message via server action
        // This ensures the message goes through the proper messaging system
        // and the message-to-note sync happens automatically
        const result = await startTaskDiscussion(taskId, content)
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to create task discussion')
        }
        
        toast.success('Message sent')
      } else {
        // Send message with task context (creates both message and comment)
        await sendMessageWithContext(supabase, {
          conversationId,
          senderId: currentUserId,
          content,
          taskId,
          objectiveId: task.objective_id || undefined,
        })
        
        toast.success('Message sent')
      }

      // Thread will update via real-time subscription
    } catch (err) {
      console.error('Failed to send message:', err)
      setInputValue(content) // Restore input
      toast.error('Failed to send message')
    } finally {
      setIsSending(false)
    }
  }

  // Handle accept task
  const handleAccept = async () => {
    setIsActionLoading(true)
    try {
      const result = await acceptTask(taskId)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success('Task accepted')
        // Refresh page or update parent
        window.location.reload()
      }
    } catch (err) {
      toast.error('Failed to accept task')
    } finally {
      setIsActionLoading(false)
    }
  }

  // Handle reject task
  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error('Please provide a reason for rejection')
      return
    }

    setIsActionLoading(true)
    try {
      const result = await rejectTask(taskId, rejectReason)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success('Task rejected')
        setShowRejectDialog(false)
        setRejectReason('')
        window.location.reload()
      }
    } catch (err) {
      toast.error('Failed to reject task')
    } finally {
      setIsActionLoading(false)
    }
  }

  // Handle complete task
  const handleComplete = async () => {
    setIsActionLoading(true)
    try {
      const result = await completeTask(taskId)
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success('Task completed')
        window.location.reload()
      }
    } catch (err) {
      toast.error('Failed to complete task')
    } finally {
      setIsActionLoading(false)
    }
  }

  // Handle forward task
  const handleForward = async () => {
    if (!forwardToId) {
      toast.error('Please select someone to forward to')
      return
    }

    setIsActionLoading(true)
    try {
      const result = await forwardTask(
        taskId,
        forwardToId,
        forwardReason || 'Reassigned via inbox'
      )
      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success('Task forwarded')
        setShowForwardDialog(false)
        setForwardToId('')
        setForwardReason('')
        window.location.reload()
      }
    } catch (err) {
      toast.error('Failed to forward task')
    } finally {
      setIsActionLoading(false)
    }
  }

  // Loading state
  if (isLoading && thread.length === 0) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        {showHeader && (
          <div className="p-4 border-b border-border">
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
        )}
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full p-4', className)}>
        <div className="text-center">
          <p className="text-sm text-destructive mb-4">{error}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.location.reload()}
          >
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
        <div className="p-4 border-b border-border space-y-3 flex-shrink-0">
          {/* Close button (mobile) */}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute top-4 right-4 md:hidden"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Button>
          )}

          {/* Task title and number */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground font-mono">
                #{task.task_number}
              </span>
              <Badge className={getStatusBadgeClass(task.status)}>
                {task.status?.replace(/_/g, ' ')}
              </Badge>
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              {task.title}
            </h2>
          </div>

          {/* Objective badge/link */}
          {task.objective && (
            <div className="flex items-center gap-2 text-sm">
              <Target className="h-4 w-4 text-international-orange" />
              <span className="text-muted-foreground">Objective:</span>
              <Button
                variant="link"
                className="h-auto p-0 text-international-orange hover:text-international-orange/80"
                onClick={() => {
                  // Navigate to objective
                  window.location.href = `/objectives/${task.objective?.id}`
                }}
              >
                {task.objective.title}
                <ChevronRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          )}

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            {/* Status-based actions */}
            {isAssignee && task.status === 'Pending' && (
              <>
                <Button
                  size="sm"
                  onClick={handleAccept}
                  disabled={isActionLoading}
                  className="bg-status-success hover:bg-status-success/90 text-white"
                >
                  <Check className="h-4 w-4 mr-1" /> Accept
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setShowRejectDialog(true)}
                  disabled={isActionLoading}
                >
                  <X className="h-4 w-4 mr-1" /> Reject
                </Button>
              </>
            )}

            {isAssignee && task.status === 'Accepted' && (
              <Button
                size="sm"
                onClick={handleComplete}
                disabled={isActionLoading}
                className="bg-status-success hover:bg-status-success/90 text-white"
              >
                <Check className="h-4 w-4 mr-1" /> Complete
              </Button>
            )}

            {/* Forward button (always available) */}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setShowForwardDialog(true)}
              disabled={isActionLoading}
            >
              <Forward className="h-4 w-4 mr-1" /> Forward
            </Button>
          </div>
        </div>
      )}

      {/* Thread area - scrollable with flex-1 and min-h-0 for proper overflow */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-4">
          {/* Empty state */}
          {thread.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                No messages or notes yet. Start the conversation!
              </p>
            </div>
          )}

          {/* Thread items */}
          {thread.map(item => (
            <ThreadItem
              key={item.id}
              item={item}
              isCurrentUser={item.author.id === currentUserId}
            />
          ))}

          {/* Scroll anchor */}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Participants section - fixed at bottom above input */}
      {participants.length > 0 && (
        <div className="px-4 py-3 border-t border-border flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-muted-foreground">Participants:</span>
          <div className="flex -space-x-2">
            {participants.slice(0, 5).map(participant => (
              <UserAvatar
                key={participant.id}
                name={participant.full_name || participant.email}
                avatarUrl={participant.avatar_url}
                size="sm"
                className="ring-2 ring-background"
              />
            ))}
            {participants.length > 5 && (
              <div className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                <span className="text-xs text-muted-foreground">
                  +{participants.length - 5}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Message input */}
      <form onSubmit={handleSend} className="p-4 border-t border-border flex-shrink-0">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <MentionInput
              value={inputValue}
              onChange={setInputValue}
              members={members.map(m => ({
                id: m.id,
                full_name: m.full_name || '',
                email: m.email,
              }))}
              placeholder="Type a message or note... Use @ to mention"
              onSubmit={() => {
                // Trigger form submission on Enter
                const submitEvent = new Event('submit', { bubbles: true, cancelable: true })
                document.querySelector('form')?.dispatchEvent(submitEvent)
              }}
              className="bg-background"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            disabled={!inputValue.trim() || isSending}
            aria-label={isSending ? 'Sending' : 'Send message'}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </form>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Task</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this task
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Enter rejection reason..."
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowRejectDialog(false)
                setRejectReason('')
              }}
              disabled={isActionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isActionLoading || !rejectReason.trim()}
            >
              {isActionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Reject Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Forward Dialog */}
      <Dialog open={showForwardDialog} onOpenChange={setShowForwardDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forward Task</DialogTitle>
            <DialogDescription>
              Reassign this task to another team member
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Forward to:
              </label>
              <Select value={forwardToId} onValueChange={setForwardToId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team member..." />
                </SelectTrigger>
                <SelectContent>
                  {members
                    .filter(m => m.id !== task.assigned_to && m.id !== task.assignee?.id)
                    .map(member => (
                      <SelectItem key={member.id} value={member.id}>
                        <div className="flex items-center gap-2">
                          <UserAvatar
                            name={member.full_name}
                            avatarUrl={member.avatar_url}
                            size="xs"
                            className="border border-border"
                          />
                          <span>
                            {member.full_name || member.email}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">
                Reason (optional):
              </label>
              <Textarea
                value={forwardReason}
                onChange={(e) => setForwardReason(e.target.value)}
                placeholder="Provide a reason for forwarding..."
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowForwardDialog(false)
                setForwardToId('')
                setForwardReason('')
              }}
              disabled={isActionLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleForward}
              disabled={isActionLoading || !forwardToId}
            >
              {isActionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Forward className="h-4 w-4 mr-2" />
              Forward
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
