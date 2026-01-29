'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { ConversationList } from './ConversationList'
import { ConversationThread } from './ConversationThread'
import { startConversation } from '@/actions/messaging'
import type { ConversationWithParticipants } from '@/lib/messaging/service'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, MessageSquare, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MessageDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Optional: Pre-select a conversation context
  sellerId?: string
  orderId?: string
  rfqId?: string
  listingId?: string
  initialMessage?: string
}

type ViewMode = 'list' | 'conversation'

export function MessageDrawer({
  open,
  onOpenChange,
  sellerId,
  orderId,
  rfqId,
  listingId,
  initialMessage
}: MessageDrawerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedConversation, setSelectedConversation] = useState<ConversationWithParticipants | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isStartingConversation, setIsStartingConversation] = useState(false)

  // Get current user on mount
  useEffect(() => {
    const getUser = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)
    }
    getUser()
  }, [])

  // Handle starting a new conversation when drawer opens with seller context
  useEffect(() => {
    if (open && sellerId && currentUserId && !selectedConversation) {
      const initConversation = async () => {
        setIsStartingConversation(true)
        try {
          const result = await startConversation({
            sellerId,
            orderId,
            rfqId,
            listingId,
            initialMessage
          })

          if (result.success && result.data) {
            setSelectedConversation(result.data)
            setViewMode('conversation')
          }
        } finally {
          setIsStartingConversation(false)
        }
      }
      initConversation()
    }
  }, [open, sellerId, orderId, rfqId, listingId, initialMessage, currentUserId, selectedConversation])

  // Reset state when drawer closes
  useEffect(() => {
    if (!open) {
      // Small delay to allow animation to complete
      const timer = setTimeout(() => {
        if (!sellerId) {
          setSelectedConversation(null)
          setViewMode('list')
        }
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [open, sellerId])

  // Handle conversation selection from list
  const handleSelectConversation = useCallback((conversation: ConversationWithParticipants) => {
    setSelectedConversation(conversation)
    setViewMode('conversation')
  }, [])

  // Handle back to list
  const handleBackToList = useCallback(() => {
    setSelectedConversation(null)
    setViewMode('list')
  }, [])

  if (!currentUserId) {
    return null
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent 
        side="right" 
        className="w-full sm:w-[480px] sm:max-w-[480px] p-0 flex flex-col"
      >
        {/* Header */}
        <SheetHeader className="p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3">
            {viewMode === 'conversation' && !sellerId && (
              <Button variant="ghost" size="icon" onClick={handleBackToList}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <MessageSquare className="w-5 h-5 text-muted-foreground" />
            <SheetTitle className="text-lg font-semibold">
              {viewMode === 'list' ? 'Messages' : 'Conversation'}
            </SheetTitle>
          </div>
        </SheetHeader>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {isStartingConversation ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Starting conversation...</p>
              </div>
            </div>
          ) : viewMode === 'list' ? (
            <ConversationList
              selectedId={selectedConversation?.id}
              onSelect={handleSelectConversation}
              currentUserId={currentUserId}
              className="h-full"
            />
          ) : (
            <ConversationThread
              conversationId={selectedConversation?.id || null}
              currentUserId={currentUserId}
              onBack={sellerId ? undefined : handleBackToList}
              showHeader={true}
              className="h-full"
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Simplified trigger button component
interface MessageDrawerTriggerProps {
  sellerId: string
  orderId?: string
  rfqId?: string
  listingId?: string
  initialMessage?: string
  children?: React.ReactNode
  className?: string
}

export function MessageDrawerTrigger({
  sellerId,
  orderId,
  rfqId,
  listingId,
  initialMessage,
  children,
  className
}: MessageDrawerTriggerProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        className={cn('gap-2', className)}
      >
        {children || (
          <>
            <MessageSquare className="w-4 h-4" />
            Message
          </>
        )}
      </Button>
      <MessageDrawer
        open={open}
        onOpenChange={setOpen}
        sellerId={sellerId}
        orderId={orderId}
        rfqId={rfqId}
        listingId={listingId}
        initialMessage={initialMessage}
      />
    </>
  )
}
