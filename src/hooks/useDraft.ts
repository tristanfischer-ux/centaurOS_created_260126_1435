'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

const DRAFT_PREFIX = 'messaging-draft:'
const DEBOUNCE_MS = 500

interface UseDraftOptions {
  // Debounce delay for saving (default 500ms)
  debounceMs?: number
  // Custom storage key prefix
  prefix?: string
}

interface UseDraftReturn {
  // Current draft value
  draft: string
  // Update draft (auto-saves)
  setDraft: (value: string) => void
  // Clear draft explicitly
  clearDraft: () => void
  // Check if there's a saved draft
  hasDraft: boolean
  // Force save immediately (e.g., before navigation)
  forceSave: () => void
}

/**
 * Hook for auto-saving message drafts per conversation
 * Drafts persist in localStorage and restore when returning to conversation
 */
export function useDraft(
  conversationId: string | null,
  options: UseDraftOptions = {}
): UseDraftReturn {
  const { debounceMs = DEBOUNCE_MS, prefix = DRAFT_PREFIX } = options
  
  const [draft, setDraftState] = useState('')
  const [hasDraft, setHasDraft] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastSavedRef = useRef<string>('')
  
  // Storage key for this conversation
  const getStorageKey = useCallback((id: string) => `${prefix}${id}`, [prefix])
  
  // Load draft when conversation changes
  useEffect(() => {
    if (!conversationId) {
      setDraftState('')
      setHasDraft(false)
      return
    }
    
    if (typeof window === 'undefined') return
    
    try {
      const key = getStorageKey(conversationId)
      const saved = localStorage.getItem(key)
      if (saved) {
        const parsed = JSON.parse(saved)
        setDraftState(parsed.content || '')
        setHasDraft(true)
        lastSavedRef.current = parsed.content || ''
      } else {
        setDraftState('')
        setHasDraft(false)
        lastSavedRef.current = ''
      }
    } catch (e) {
      console.warn('Failed to load draft:', e)
      setDraftState('')
      setHasDraft(false)
    }
  }, [conversationId, getStorageKey])
  
  // Save draft to localStorage
  const saveDraft = useCallback((value: string) => {
    if (!conversationId || typeof window === 'undefined') return
    
    const key = getStorageKey(conversationId)
    const trimmed = value.trim()
    
    if (trimmed === lastSavedRef.current) return // No change
    
    try {
      if (trimmed) {
        localStorage.setItem(key, JSON.stringify({
          content: value, // Keep whitespace for user
          savedAt: new Date().toISOString()
        }))
        setHasDraft(true)
      } else {
        localStorage.removeItem(key)
        setHasDraft(false)
      }
      lastSavedRef.current = trimmed
    } catch (e) {
      console.warn('Failed to save draft:', e)
    }
  }, [conversationId, getStorageKey])
  
  // Debounced save
  const setDraft = useCallback((value: string) => {
    setDraftState(value)
    
    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    // Schedule save
    timeoutRef.current = setTimeout(() => {
      saveDraft(value)
    }, debounceMs)
  }, [saveDraft, debounceMs])
  
  // Clear draft
  const clearDraft = useCallback(() => {
    if (!conversationId) return
    
    setDraftState('')
    setHasDraft(false)
    lastSavedRef.current = ''
    
    // Clear timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    // Remove from storage
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(getStorageKey(conversationId))
      } catch (e) {
        console.warn('Failed to clear draft:', e)
      }
    }
  }, [conversationId, getStorageKey])
  
  // Force immediate save
  const forceSave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    saveDraft(draft)
  }, [saveDraft, draft])
  
  // Save on unmount or conversation change
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      // Note: Can't save here reliably due to closure issues
      // The forceSave should be called by parent component on navigation
    }
  }, [])
  
  return {
    draft,
    setDraft,
    clearDraft,
    hasDraft,
    forceSave
  }
}

/**
 * Get all conversation IDs that have drafts
 * Useful for showing draft indicators in conversation list
 */
export function getConversationsWithDrafts(prefix = DRAFT_PREFIX): string[] {
  if (typeof window === 'undefined') return []
  
  const ids: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) {
        const id = key.slice(prefix.length)
        ids.push(id)
      }
    }
  } catch (e) {
    console.warn('Failed to get drafts:', e)
  }
  return ids
}

/**
 * Hook to track which conversations have drafts
 */
export function useConversationDrafts(prefix = DRAFT_PREFIX) {
  const [draftsMap, setDraftsMap] = useState<Set<string>>(new Set())
  
  // Load initial drafts
  useEffect(() => {
    const ids = getConversationsWithDrafts(prefix)
    setDraftsMap(new Set(ids))
    
    // Listen for storage changes (cross-tab sync)
    const handleStorage = (e: StorageEvent) => {
      if (e.key?.startsWith(prefix)) {
        const id = e.key.slice(prefix.length)
        setDraftsMap(prev => {
          const next = new Set(prev)
          if (e.newValue) {
            next.add(id)
          } else {
            next.delete(id)
          }
          return next
        })
      }
    }
    
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [prefix])
  
  const hasDraft = useCallback((conversationId: string) => {
    return draftsMap.has(conversationId)
  }, [draftsMap])
  
  const refreshDrafts = useCallback(() => {
    const ids = getConversationsWithDrafts(prefix)
    setDraftsMap(new Set(ids))
  }, [prefix])
  
  return {
    draftsMap,
    hasDraft,
    refreshDrafts
  }
}
