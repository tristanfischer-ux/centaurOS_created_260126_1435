/**
 * Hook for auto-saving message drafts per conversation
 * 
 * Features:
 * - Auto-saves draft every 2 seconds (debounced)
 * - Persists to localStorage
 * - Restores draft when returning to conversation
 * - Clears draft after successful send
 */

import { useState, useEffect, useCallback, useRef } from 'react'

const DRAFT_STORAGE_KEY = 'message_drafts'
const AUTOSAVE_DELAY = 2000 // 2 seconds

interface DraftStorage {
  [conversationId: string]: {
    content: string
    timestamp: number
  }
}

export function useDraftMessage(conversationId: string | null) {
  const [draft, setDraft] = useState('')
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isInitializedRef = useRef(false)

  // Load draft from storage when conversation changes
  useEffect(() => {
    if (!conversationId) {
      setDraft('')
      isInitializedRef.current = false
      return
    }

    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (stored) {
        const drafts: DraftStorage = JSON.parse(stored)
        const conversationDraft = drafts[conversationId]
        
        if (conversationDraft) {
          // Only restore drafts from last 24 hours
          const hoursSinceLastEdit = (Date.now() - conversationDraft.timestamp) / (1000 * 60 * 60)
          if (hoursSinceLastEdit < 24) {
            setDraft(conversationDraft.content)
          } else {
            // Clear old draft
            delete drafts[conversationId]
            localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts))
          }
        }
      }
    } catch (error) {
      console.error('[useDraftMessage] Failed to load draft:', error)
    }
    
    isInitializedRef.current = true
  }, [conversationId])

  // Auto-save draft (debounced)
  const saveDraft = useCallback((content: string) => {
    if (!conversationId) return

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Set new timeout
    saveTimeoutRef.current = setTimeout(() => {
      try {
        const stored = localStorage.getItem(DRAFT_STORAGE_KEY)
        const drafts: DraftStorage = stored ? JSON.parse(stored) : {}

        if (content.trim()) {
          // Save draft
          drafts[conversationId] = {
            content,
            timestamp: Date.now()
          }
        } else {
          // Clear draft if empty
          delete drafts[conversationId]
        }

        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts))
      } catch (error) {
        console.error('[useDraftMessage] Failed to save draft:', error)
      }
    }, AUTOSAVE_DELAY)
  }, [conversationId])

  // Update draft and trigger save
  const updateDraft = useCallback((content: string) => {
    setDraft(content)
    saveDraft(content)
  }, [saveDraft])

  // Clear draft (e.g., after successful send)
  const clearDraft = useCallback(() => {
    setDraft('')
    
    if (!conversationId) return

    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (stored) {
        const drafts: DraftStorage = JSON.parse(stored)
        delete drafts[conversationId]
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts))
      }
    } catch (error) {
      console.error('[useDraftMessage] Failed to clear draft:', error)
    }
  }, [conversationId])

  // Get all drafts (for showing indicators in conversation list)
  const getAllDrafts = useCallback((): Record<string, string> => {
    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (stored) {
        const drafts: DraftStorage = JSON.parse(stored)
        const result: Record<string, string> = {}
        
        for (const [id, data] of Object.entries(drafts)) {
          result[id] = data.content
        }
        
        return result
      }
    } catch (error) {
      console.error('[useDraftMessage] Failed to get all drafts:', error)
    }
    
    return {}
  }, [])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  return {
    draft,
    updateDraft,
    clearDraft,
    getAllDrafts,
    hasDraft: draft.trim().length > 0
  }
}

/**
 * Utility hook to check if a conversation has a draft
 */
export function useHasDraft(conversationId: string): boolean {
  const [hasDraft, setHasDraft] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (stored) {
        const drafts: DraftStorage = JSON.parse(stored)
        const draft = drafts[conversationId]
        setHasDraft(!!draft && draft.content.trim().length > 0)
      }
    } catch (error) {
      console.error('[useHasDraft] Failed to check draft:', error)
    }
  }, [conversationId])

  return hasDraft
}
