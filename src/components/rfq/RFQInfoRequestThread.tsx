'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Loader2,
  Send,
  MessageSquare,
} from 'lucide-react'
import { startConversation, sendNewMessage, getConversationMessages } from '@/actions/messaging'
import { useEffect } from 'react'

interface Message {
  id: string
  content: string
  sender_id: string
  created_at: string
}

interface RFQInfoRequestThreadProps {
  rfqId: string
  sellerId: string
  initialQuestion: string
  className?: string
}

export function RFQInfoRequestThread({
  rfqId,
  sellerId,
  initialQuestion,
  className,
}: RFQInfoRequestThreadProps) {
  const [isPending, startTransition] = useTransition()
  const [reply, setReply] = useState('')
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function init() {
      setIsLoading(true)
      try {
        const result = await startConversation({
          sellerId,
          rfqId,
          initialMessage: undefined,
        })
        if (cancelled) return
        if (result && 'data' in result && result.data?.id) {
          setConversationId(result.data.id)
          const msgResult = await getConversationMessages(result.data.id)
          if (cancelled) return
          if (msgResult && 'data' in msgResult && Array.isArray(msgResult.data)) {
            setMessages(msgResult.data as Message[])
          }
        }
      } catch (error) {
        if (!cancelled) console.error('Failed to init conversation:', error)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [rfqId, sellerId])

  const handleSendReply = () => {
    if (!reply.trim() || !conversationId) return

    startTransition(async () => {
      try {
        await sendNewMessage(conversationId, reply.trim())
        setReply('')
        // Reload messages
        const msgResult = await getConversationMessages(conversationId)
        if (msgResult && 'data' in msgResult && Array.isArray(msgResult.data)) {
          setMessages(msgResult.data as Message[])
        }
      } catch (error) {
        console.error('Failed to send reply:', error)
      }
    })
  }

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 p-3 text-sm text-muted-foreground', className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading thread...
      </div>
    )
  }

  return (
    <div className={cn('space-y-3 border-t pt-3 mt-3', className)}>
      {/* Original question */}
      <div className="p-3 rounded-lg bg-status-info-light text-sm">
        <div className="flex items-center gap-1.5 text-xs text-status-info font-medium mb-1">
          <MessageSquare className="w-3 h-3" />
          Original Question
        </div>
        <p className="whitespace-pre-wrap">{initialQuestion}</p>
      </div>

      {/* Thread messages */}
      {messages
        .filter((m) => m.content !== initialQuestion) // Skip duplicated initial message
        .map((msg) => (
          <div
            key={msg.id}
            className="p-3 rounded-lg bg-muted/50 text-sm"
          >
            <p className="whitespace-pre-wrap">{msg.content}</p>
            <span className="text-xs text-muted-foreground mt-1 block">
              {new Date(msg.created_at).toLocaleString()}
            </span>
          </div>
        ))}

      {/* Reply form */}
      <div className="flex gap-2">
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Type your reply..."
          rows={2}
          className="flex-1 text-sm"
          disabled={isPending || !conversationId}
        />
        <Button
          size="sm"
          onClick={handleSendReply}
          disabled={isPending || !reply.trim() || !conversationId}
          className="self-end"
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
