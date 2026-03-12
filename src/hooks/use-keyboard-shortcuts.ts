'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Global keyboard shortcuts hook for ForgeOS platform.
 *
 * Registers vim-style two-key navigation sequences (G then X),
 * single-key actions, and modifier combos. All shortcuts are
 * suppressed when the user is typing in an input, textarea,
 * or contentEditable element.
 *
 * @description Mount once in the platform layout — not per-page.
 */
export function useKeyboardShortcuts() {
  const router = useRouter()
  const pendingKeyRef = useRef<string | null>(null)
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPending = useCallback(() => {
    pendingKeyRef.current = null
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current)
      pendingTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    const isInputElement = (target: EventTarget | null): boolean => {
      if (!target) return false
      const el = target as HTMLElement
      return (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.isContentEditable ||
        // Also ignore when inside cmdk dialog (command palette)
        !!el.closest('[cmdk-input]')
      )
    }

    const isDialogOpen = (): boolean => {
      // Check for any open Radix dialog overlay or cmdk dialog
      return !!(
        document.querySelector('[data-state="open"][role="dialog"]') ||
        document.querySelector('[cmdk-dialog]')
      )
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Never intercept when modifier keys are held (let CommandPalette handle those)
      if (e.metaKey || e.ctrlKey || e.altKey) return

      // Never intercept when typing in an input
      if (isInputElement(e.target)) return

      // Never intercept when a dialog/modal is open (command palette, etc.)
      if (isDialogOpen()) return

      const key = e.key

      // ── Two-key sequences (G then X) ──────────────────────────────
      if (pendingKeyRef.current === 'g') {
        clearPending()
        const navMap: Record<string, string> = {
          d: '/today',       // G D → Dashboard (Today)
          t: '/new-tasks',   // G T → Tasks
          s: '/strategy',    // G S → Strategy
          m: '/updates',     // G M → Messages (Comms)
          f: '/cash-burn',   // G F → Finance (Cash Burn)
          p: '/team',        // G P → People (Team)
          o: '/new-objectives', // G O → Objectives
          k: '/knowledge',   // G K → Knowledge
          w: '/the-forge',   // G W → Workshop (The Forge)
        }
        const route = navMap[key.toLowerCase()]
        if (route) {
          e.preventDefault()
          router.push(route)
        }
        return
      }

      // ── Start two-key sequence ────────────────────────────────────
      if (key === 'g') {
        pendingKeyRef.current = 'g'
        pendingTimerRef.current = setTimeout(clearPending, 1000)
        return
      }

      // ── Single-key shortcuts ──────────────────────────────────────

      // N → Create new task
      if (key === 'n') {
        e.preventDefault()
        router.push('/new-tasks?create=true')
        return
      }

      // ? (Shift+/) → Show keyboard shortcuts dialog
      if (key === '?') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('open-keyboard-shortcuts'))
        return
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      clearPending()
    }
  }, [router, clearPending])
}
