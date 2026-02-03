'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/ui/user-avatar'
import { Check, CheckCheck, FileIcon, AlertCircle, MessageSquare, Download, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MessageWithSender } from '@/lib/messaging/service'
import { sanitizeHref } from '@/lib/security/url-validation'
import { ReactionDisplay } from './ReactionDisplay'
import { QuickReactionBar } from './ReactionPicker'
import { StarredIndicator } from './StarredIndicator'
import { PinnedIndicator } from './PinnedIndicator'
import type { ReactionGroup } from '@/actions/reactions'
import { formatDistanceToNow } from 'date-fns'
import { isImageFile, getFileIcon } from '@/lib/file-upload'
import Image from 'next/image'

interface MessageBubbleProps {
  message: MessageWithSender
  isOwn: boolean
  showAvatar?: boolean
  showTimestamp?: boolean
  // Reaction props
  reactions?: ReactionGroup[]
  onToggleReaction?: (emoji: string) => void
  onAddReaction?: (emoji: string) => void
  showReactions?: boolean
  // Thread props
  replyCount?: number
  lastReplyAt?: string | null
  onOpenThread?: (messageId: string) => void
  // Message status props
  isStarred?: boolean
  isPinned?: boolean
}

function formatTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  
  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  })
  
  if (diffDays === 0) {
    return timeStr
  } else if (diffDays === 1) {
    return `Yesterday ${timeStr}`
  } else if (diffDays < 7) {
    return `${date.toLocaleDateString('en-US', { weekday: 'short' })} ${timeStr}`
  } else {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }
  return email.slice(0, 2).toUpperCase()
}

/**
 * File attachment display component
 */
function FileAttachment({ 
  fileUrl, 
  fileName, 
  isOwn 
}: { 
  fileUrl: string
  fileName: string
  isOwn: boolean
}) {
  const safeUrl = sanitizeHref(fileUrl)
  if (safeUrl === '#') {
    return <span className="text-sm">Invalid file</span>
  }
  
  // Detect file type from URL or name
  const extension = fileName.split('.').pop()?.toLowerCase() || ''
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp']
  const isImage = imageExtensions.includes(extension)
  
  // Determine file type icon
  const fileIcon = getFileIcon(isImage ? 'image/jpeg' : `application/${extension}`)
  
  if (isImage) {
    return (
      <div className="flex flex-col gap-2">
        <a 
          href={safeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-lg overflow-hidden border-2 border-white/20 hover:border-white/40 transition-colors"
        >
          <div className="relative w-full max-w-sm h-48 bg-black/10">
            <Image
              src={safeUrl}
              alt={fileName}
              fill
              className="object-contain"
              unoptimized
            />
          </div>
        </a>
        <a
          href={safeUrl}
          download={fileName}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'flex items-center gap-2 text-xs hover:underline',
            isOwn ? 'text-white/90' : 'text-muted-foreground'
          )}
        >
          <Download className="w-3 h-3" />
          <span className="truncate">{fileName}</span>
        </a>
      </div>
    )
  }
  
  // Non-image file
  return (
    <a
      href={safeUrl}
      download={fileName}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-3 p-3 rounded-lg border-2 hover:bg-white/5 transition-colors',
        isOwn ? 'border-white/20 hover:border-white/30' : 'border-border'
      )}
    >
      <div className="text-2xl flex-shrink-0">{fileIcon}</div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-medium truncate',
          isOwn ? 'text-white' : 'text-foreground'
        )}>
          {fileName}
        </p>
        <p className={cn(
          'text-xs',
          isOwn ? 'text-white/70' : 'text-muted-foreground'
        )}>
          Click to download
        </p>
      </div>
      <Download className={cn(
        'w-4 h-4 flex-shrink-0',
        isOwn ? 'text-white/70' : 'text-muted-foreground'
      )} />
    </a>
  )
}

export function MessageBubble({ 
  message, 
  isOwn, 
  showAvatar = true,
  showTimestamp = true,
  reactions = [],
  onToggleReaction,
  onAddReaction,
  showReactions = true,
  replyCount = 0,
  lastReplyAt,
  onOpenThread,
  isStarred = false,
  isPinned = false
}: MessageBubbleProps) {
  const [showQuickReactions, setShowQuickReactions] = useState(false)
  const sender = message.sender
  const isSystem = message.message_type === 'system'
  const isFile = message.message_type === 'file'
  const hasReplies = replyCount > 0
  
  const handleToggleReaction = (emoji: string) => {
    onToggleReaction?.(emoji)
  }
  
  const handleAddReaction = (emoji: string) => {
    onAddReaction?.(emoji)
    setShowQuickReactions(false)
  }
  
  const handleOpenThread = () => {
    if (onOpenThread) {
      onOpenThread(message.id)
    }
  }

  // System messages are centered and styled differently
  if (isSystem) {
    return (
      <div className="flex justify-center my-4">
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-full text-xs text-muted-foreground">
          <AlertCircle className="w-3 h-3" />
          <span>{message.content}</span>
          {showTimestamp && (
            <span className="text-muted-foreground/70">
              {formatTime(message.created_at)}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex gap-2 max-w-[85%] group relative',
        isOwn ? 'ml-auto flex-row-reverse' : 'mr-auto'
      )}
      onMouseEnter={() => setShowQuickReactions(true)}
      onMouseLeave={() => setShowQuickReactions(false)}
    >
      {/* Avatar */}
      {showAvatar && !isOwn && (
        <UserAvatar
          name={sender.full_name || sender.email}
          avatarUrl={sender.avatar_url}
          size="sm"
          className="flex-shrink-0"
        />
      )}

      {/* Message content */}
      <div className={cn('flex flex-col gap-1', isOwn ? 'items-end' : 'items-start')}>
        {/* Sender name (only for received messages) */}
        {!isOwn && showAvatar && (
          <span className="text-xs text-muted-foreground px-1">
            {sender.full_name || sender.email}
          </span>
        )}

        {/* Message bubble with hover actions */}
        <div className="relative">
          {/* Quick reaction bar (appears on hover) */}
          {showReactions && showQuickReactions && onAddReaction && (
            <div className={cn(
              'absolute -top-8 z-10',
              isOwn ? 'right-0' : 'left-0'
            )}>
              <QuickReactionBar onSelect={handleAddReaction} />
            </div>
          )}
          
          <div
            className={cn(
              'px-4 py-2 rounded-2xl max-w-full break-words relative',
              isOwn 
                ? 'bg-international-orange text-white rounded-br-md' 
                : 'bg-muted text-foreground rounded-bl-md'
            )}
          >
            {/* Starred and Pinned indicators */}
            <StarredIndicator isStarred={isStarred} />
            <PinnedIndicator isPinned={isPinned} />
            {isFile && message.file_url && sanitizeHref(message.file_url) !== '#' ? (
              <FileAttachment 
                fileUrl={message.file_url}
                fileName={message.content || 'Attachment'}
                isOwn={isOwn}
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            )}
          </div>
        </div>

        {/* Reactions display */}
        {showReactions && (reactions.length > 0 || onAddReaction) && (
          <ReactionDisplay
            reactions={reactions}
            onToggle={handleToggleReaction}
            onAddNew={handleAddReaction}
            showAddButton={!showQuickReactions && !!onAddReaction}
            className={isOwn ? 'justify-end' : 'justify-start'}
          />
        )}

        {/* Thread indicator - shows reply count when message has replies */}
        {replyCount > 0 && onOpenThread && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenThread}
            className={cn(
              'h-auto py-1 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5',
              isOwn ? 'ml-auto' : 'mr-auto'
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>
              {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
            </span>
            {lastReplyAt && (
              <>
                <span>•</span>
                <span className="text-[10px]">
                  Last reply {formatDistanceToNow(new Date(lastReplyAt), { addSuffix: true })}
                </span>
              </>
            )}
          </Button>
        )}

        {/* Timestamp and read status */}
        {showTimestamp && (
          <div className={cn(
            'flex items-center gap-1 px-1',
            isOwn ? 'flex-row-reverse' : 'flex-row'
          )}>
            <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
              {formatTime(message.created_at)}
            </span>
            {isOwn && (
              <span className="text-muted-foreground">
                {message.is_read ? (
                  <CheckCheck className="w-3 h-3 text-electric-blue" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Spacer for own messages without avatar */}
      {showAvatar && isOwn && <div className="w-8 flex-shrink-0" />}
    </div>
  )
}

// Date separator component
export function DateSeparator({ date }: { date: string }) {
  const d = new Date(date)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  
  let label: string
  if (diffDays === 0) {
    label = 'Today'
  } else if (diffDays === 1) {
    label = 'Yesterday'
  } else if (diffDays < 7) {
    label = d.toLocaleDateString('en-US', { weekday: 'long' })
  } else {
    label = d.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric',
      year: now.getFullYear() !== d.getFullYear() ? 'numeric' : undefined
    })
  }

  return (
    <div className="flex items-center justify-center my-4">
      <div className="h-px bg-border flex-1" />
      <span className="px-3 text-xs text-muted-foreground font-medium">
        {label}
      </span>
      <div className="h-px bg-border flex-1" />
    </div>
  )
}
