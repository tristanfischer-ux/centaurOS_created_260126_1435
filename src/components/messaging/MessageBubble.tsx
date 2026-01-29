'use client'

import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Check, CheckCheck, FileIcon, AlertCircle } from 'lucide-react'
import type { MessageWithSender } from '@/lib/messaging/service'

interface MessageBubbleProps {
  message: MessageWithSender
  isOwn: boolean
  showAvatar?: boolean
  showTimestamp?: boolean
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

export function MessageBubble({ 
  message, 
  isOwn, 
  showAvatar = true,
  showTimestamp = true 
}: MessageBubbleProps) {
  const sender = message.sender
  const isSystem = message.message_type === 'system'
  const isFile = message.message_type === 'file'

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
        'flex gap-2 max-w-[85%] group',
        isOwn ? 'ml-auto flex-row-reverse' : 'mr-auto'
      )}
    >
      {/* Avatar */}
      {showAvatar && !isOwn && (
        <Avatar className="w-8 h-8 flex-shrink-0">
          <AvatarImage src={sender.avatar_url || undefined} alt={sender.full_name || sender.email} />
          <AvatarFallback className="text-xs bg-muted">
            {getInitials(sender.full_name, sender.email)}
          </AvatarFallback>
        </Avatar>
      )}

      {/* Message content */}
      <div className={cn('flex flex-col gap-1', isOwn ? 'items-end' : 'items-start')}>
        {/* Sender name (only for received messages) */}
        {!isOwn && showAvatar && (
          <span className="text-xs text-muted-foreground px-1">
            {sender.full_name || sender.email}
          </span>
        )}

        {/* Message bubble */}
        <div
          className={cn(
            'px-4 py-2 rounded-2xl max-w-full break-words',
            isOwn 
              ? 'bg-international-orange text-white rounded-br-md' 
              : 'bg-muted text-foreground rounded-bl-md'
          )}
        >
          {isFile && message.file_url ? (
            <a 
              href={message.file_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-2 hover:underline',
                isOwn ? 'text-white' : 'text-foreground'
              )}
            >
              <FileIcon className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm truncate">
                {message.content || 'Attachment'}
              </span>
            </a>
          ) : (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          )}
        </div>

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
