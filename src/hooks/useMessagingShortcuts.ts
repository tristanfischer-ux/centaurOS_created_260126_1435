'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export interface MessagingShortcutHandlers {
  // Navigation
  onNavigatePrev?: () => void
  onNavigateNext?: () => void
  onSearch?: () => void
  onGoToMessages?: () => void
  
  // Unread navigation
  onJumpToUnread?: () => void
  onJumpToNextUnread?: () => void
  
  // Message actions
  onEditLastMessage?: () => void
  onReplyInThread?: () => void
  onAddReaction?: () => void
  onPinMessage?: () => void
  onStarMessage?: () => void
  onMarkUnread?: () => void
  onCopyLink?: () => void
  onDeleteMessage?: () => void
  
  // Composition
  onFocusInput?: () => void
  onUploadFile?: () => void
  onToggleCodeBlock?: () => void
  onBold?: () => void
  onItalic?: () => void
  
  // Input ref for context checking
  inputRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement>
}

/**
 * Hook for messaging-specific keyboard shortcuts
 * Handles global navigation and context-aware message actions
 */
export function useMessagingShortcuts(handlers: MessagingShortcutHandlers = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const handlersRef = useRef(handlers)
  
  // Keep handlers ref updated
  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  const isOnMessagesPage = useCallback(() => {
    return pathname?.includes('/messages')
  }, [pathname])

  const isInputFocused = useCallback(() => {
    const activeElement = document.activeElement
    if (!activeElement) return false
    
    return (
      activeElement.tagName === 'INPUT' ||
      activeElement.tagName === 'TEXTAREA' ||
      (activeElement as HTMLElement).isContentEditable
    )
  }, [])

  const isOwnInputFocused = useCallback(() => {
    const { inputRef } = handlersRef.current
    if (!inputRef?.current) return false
    return document.activeElement === inputRef.current
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const h = handlersRef.current
      const isMod = e.metaKey || e.ctrlKey
      const isShift = e.shiftKey
      
      // ===== GLOBAL SHORTCUTS (work anywhere) =====
      
      // Cmd+Shift+M - Go to Messages
      if (isMod && isShift && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        if (h.onGoToMessages) {
          h.onGoToMessages()
        } else {
          router.push('/messages')
        }
        return
      }

      // ===== MESSAGES PAGE SHORTCUTS =====
      if (!isOnMessagesPage()) return

      // Cmd+Shift+K - Search conversations (messages page)
      if (isMod && isShift && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        h.onSearch?.()
        return
      }

      // Cmd+[ - Previous conversation
      if (isMod && e.key === '[') {
        e.preventDefault()
        h.onNavigatePrev?.()
        return
      }

      // Cmd+] - Next conversation
      if (isMod && e.key === ']') {
        e.preventDefault()
        h.onNavigateNext?.()
        return
      }

      // Alt+Up - Navigate up in conversation list
      if (e.altKey && e.key === 'ArrowUp' && !isInputFocused()) {
        e.preventDefault()
        h.onNavigatePrev?.()
        return
      }

      // Alt+Down - Navigate down in conversation list
      if (e.altKey && e.key === 'ArrowDown' && !isInputFocused()) {
        e.preventDefault()
        h.onNavigateNext?.()
        return
      }

      // ===== INPUT-FOCUSED SHORTCUTS =====
      if (isOwnInputFocused()) {
        // Cmd+U - Upload file
        if (isMod && e.key.toLowerCase() === 'u') {
          e.preventDefault()
          h.onUploadFile?.()
          return
        }

        // Cmd+Shift+\ - Toggle code block
        if (isMod && isShift && e.key === '\\') {
          e.preventDefault()
          h.onToggleCodeBlock?.()
          return
        }

        // Cmd+B - Bold
        if (isMod && e.key.toLowerCase() === 'b') {
          e.preventDefault()
          h.onBold?.()
          return
        }

        // Cmd+I - Italic
        if (isMod && e.key.toLowerCase() === 'i') {
          e.preventDefault()
          h.onItalic?.()
          return
        }
      }

      // ===== NON-INPUT SHORTCUTS (when not typing) =====
      if (!isInputFocused()) {
        // E - Edit last message
        if (e.key.toLowerCase() === 'e' && !isMod && !isShift) {
          e.preventDefault()
          h.onEditLastMessage?.()
          return
        }

        // R - Reply in thread
        if (e.key.toLowerCase() === 'r' && !isMod && !isShift) {
          e.preventDefault()
          h.onReplyInThread?.()
          return
        }

        // + - Add reaction
        if (e.key === '+' || (isShift && e.key === '=')) {
          e.preventDefault()
          h.onAddReaction?.()
          return
        }

        // P - Pin message
        if (e.key.toLowerCase() === 'p' && !isMod && !isShift) {
          e.preventDefault()
          h.onPinMessage?.()
          return
        }

        // S - Star message
        if (e.key.toLowerCase() === 's' && !isMod && !isShift) {
          e.preventDefault()
          h.onStarMessage?.()
          return
        }

        // U - Jump to first unread message (or mark unread if no jump handler)
        if (e.key.toLowerCase() === 'u' && !isMod && !isShift) {
          e.preventDefault()
          if (h.onJumpToUnread) {
            h.onJumpToUnread()
          } else {
            h.onMarkUnread?.()
          }
          return
        }

        // N - Jump to next unread message
        if (e.key.toLowerCase() === 'n' && !isMod && !isShift) {
          e.preventDefault()
          h.onJumpToNextUnread?.()
          return
        }

        // Cmd+Shift+C - Copy message link
        if (isMod && isShift && e.key.toLowerCase() === 'c') {
          e.preventDefault()
          h.onCopyLink?.()
          return
        }

        // Delete/Backspace - Delete message (own)
        if (e.key === 'Delete' || e.key === 'Backspace') {
          // Don't prevent default, let handler decide
          h.onDeleteMessage?.()
          return
        }

        // / - Focus input for slash command (when not already focused)
        if (e.key === '/') {
          e.preventDefault()
          h.onFocusInput?.()
          return
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOnMessagesPage, isInputFocused, isOwnInputFocused, router])
}

/**
 * Helper to check if we're in the messaging context
 */
export function useIsMessagingContext() {
  const pathname = usePathname()
  return pathname?.includes('/messages') || false
}
