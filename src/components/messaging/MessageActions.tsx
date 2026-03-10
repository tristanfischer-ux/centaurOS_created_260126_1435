'use client'

/**
 * MessageActions - Floating action menu that appears on message hover
 * 
 * Provides quick actions:
 * - Reply in thread
 * - Star message
 * - Copy message
 * - Forward to another conversation
 */

import { Copy, Forward, MessageSquare, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface MessageActionsProps {
  messageId: string
  messageContent: string
  isOwn: boolean
  isStarred: boolean
  onReplyInThread?: () => void
  onToggleStar?: () => void
  onForward?: () => void
  className?: string
}

export function MessageActions({
  messageId,
  messageContent,
  isOwn,
  isStarred,
  onReplyInThread,
  onToggleStar,
  onForward,
  className
}: MessageActionsProps) {
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageContent)
      toast.success('Message copied to clipboard')
    } catch (error) {
      toast.error('Failed to copy message')
    }
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1 bg-background border border-border rounded-lg shadow-lg p-1',
        className
      )}
    >
      {/* Reply in thread */}
      {onReplyInThread && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:bg-muted"
          onClick={onReplyInThread}
          title="Reply in thread"
          aria-label="Reply in thread"
        >
          <MessageSquare className="h-3.5 w-3.5" />
        </Button>
      )}
      
      {/* Star/Unstar */}
      {onToggleStar && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-7 hover:bg-muted',
            isStarred && 'text-status-warning'
          )}
          onClick={onToggleStar}
          title={isStarred ? 'Remove star' : 'Star message'}
          aria-label={isStarred ? 'Remove star' : 'Star message'}
        >
          <Star className={cn('h-3.5 w-3.5', isStarred && 'fill-current')} />
        </Button>
      )}
      
      {/* Copy */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 hover:bg-muted"
        onClick={handleCopy}
        title="Copy message"
        aria-label="Copy message"
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
      
      {/* Forward */}
      {onForward && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 hover:bg-muted"
          onClick={onForward}
          title="Forward message"
          aria-label="Forward message"
        >
          <Forward className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
