'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addObjectiveComment } from '@/actions/activity'
import { startObjectiveDiscussion } from '@/actions/messaging'
import { formatDistanceToNow } from 'date-fns'
import { Send, Loader2, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar } from '@/components/ui/user-avatar'
import { MentionText } from '@/components/ui/mention-text'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Comment {
  id: string
  content: string
  is_system_log: boolean
  created_at: string
  user_id: string | null
  user?: { full_name: string; role: string }
}

interface ObjectiveCommentsProps {
  objectiveId: string
  objectiveTitle: string
}

export function ObjectiveComments({ objectiveId, objectiveTitle }: ObjectiveCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isStartingDiscussion, setIsStartingDiscussion] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const commentsEndRef = useRef<HTMLDivElement>(null)
  const supabase = useMemo(() => createClient(), [])

  // Fetch comments on mount
  useEffect(() => {
    const fetchComments = async () => {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('objective_comments')
        .select('*, user:user_id(full_name, role)')
        .eq('objective_id', objectiveId)
        .order('created_at', { ascending: true })

      if (!error && data) {
        setComments(data as Comment[])
      }
      setIsLoading(false)
    }

    fetchComments()
  }, [objectiveId, supabase])

  // Auto-scroll to bottom when new comments arrive
  useEffect(() => {
    if (!isLoading && comments.length > 0) {
      commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [comments, isLoading])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newComment.trim()) {
      setCommentError('Comment cannot be empty')
      return
    }

    setCommentError(null)
    setIsSending(true)
    
    try {
      const result = await addObjectiveComment(objectiveId, newComment)
      if (result.error) {
        setCommentError(result.error)
        toast.error(result.error)
      } else {
        setNewComment('')
        // Refresh comments
        const { data } = await supabase
          .from('objective_comments')
          .select('*, user:user_id(full_name, role)')
          .eq('objective_id', objectiveId)
          .order('created_at', { ascending: true })
        if (data) setComments(data as Comment[])
        toast.success('Comment added')
      }
    } finally {
      setIsSending(false)
    }
  }

  const handleStartDiscussion = useCallback(async () => {
    setIsStartingDiscussion(true)
    try {
      const result = await startObjectiveDiscussion(objectiveId)
      if (result.success) {
        toast.success('Discussion channel created! Check the Messages sidebar.')
      } else {
        toast.error(result.error || 'Failed to start discussion')
      }
    } catch {
      toast.error('Failed to start discussion')
    } finally {
      setIsStartingDiscussion(false)
    }
  }, [objectiveId])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-international-orange" />
          Notes & Comments
        </h3>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleStartDiscussion}
          disabled={isStartingDiscussion}
          className="border-electric-blue/30 text-electric-blue hover:bg-electric-blue/10"
        >
          <MessageSquare className="h-4 w-4 mr-1" />
          {isStartingDiscussion ? 'Starting...' : 'Start Discussion'}
        </Button>
      </div>

      {/* Comments List */}
      <div className="border border-border rounded-lg bg-muted/30 max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading comments...
          </div>
        ) : comments.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No comments yet.</p>
            <p className="text-xs">Be the first to add a note to this objective.</p>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className={cn(
                  'flex gap-3',
                  comment.is_system_log && 'opacity-70'
                )}
              >
                <UserAvatar
                  name={comment.is_system_log ? 'System' : comment.user?.full_name}
                  role={comment.is_system_log ? undefined : comment.user?.role}
                  size="sm"
                />
                <div className="flex-1 bg-background p-3 rounded-lg border border-border">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-sm text-foreground">
                      {comment.is_system_log ? 'System' : comment.user?.full_name || 'Unknown'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="text-sm text-foreground/80 leading-relaxed">
                    <MentionText content={comment.content} members={[]} />
                  </div>
                </div>
              </div>
            ))}
            <div ref={commentsEndRef} />
          </div>
        )}
      </div>

      {/* Comment Input */}
      <form onSubmit={handleSend} className="space-y-2">
        <Textarea
          value={newComment}
          onChange={(e) => {
            setNewComment(e.target.value)
            setCommentError(null)
          }}
          placeholder="Add a note or comment..."
          className={cn(
            'min-h-[80px] resize-none',
            commentError && 'border-destructive'
          )}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              handleSend(e)
            }
          }}
        />
        {commentError && (
          <p className="text-sm text-destructive" role="alert">
            {commentError}
          </p>
        )}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Press ⌘+Enter to send
          </p>
          <Button type="submit" disabled={isSending || !newComment.trim()}>
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Add Comment
          </Button>
        </div>
      </form>
    </div>
  )
}
