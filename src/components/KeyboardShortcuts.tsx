'use client'

import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'

/**
 * Thin client wrapper that mounts the global keyboard shortcuts hook.
 * Renders nothing — exists only to call the hook from the server layout.
 */
export function KeyboardShortcuts() {
  useKeyboardShortcuts()
  return null
}
