'use client'

/**
 * useSavedTechniques — Persists saved/favourite technique IDs in localStorage.
 *
 * @description Provides a Set of saved technique IDs with add/remove/toggle
 * helpers. State is synced to localStorage so it persists across page reloads.
 *
 * @returns Saved IDs set, toggle function, isSaved checker, and count
 */

import { useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'forgeos-saved-techniques'

/**
 * Read saved technique IDs from localStorage.
 * Returns empty set if storage is unavailable or corrupt.
 */
function readFromStorage(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((v): v is string => typeof v === 'string'))
    }
    return new Set()
  } catch {
    return new Set()
  }
}

/**
 * Write saved technique IDs to localStorage.
 */
function writeToStorage(ids: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch (error) {
    console.warn('[useSavedTechniques] Failed to write to localStorage:', error)
  }
}

export function useSavedTechniques() {
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())

  // Hydrate from localStorage on mount
  useEffect(() => {
    setSavedIds(readFromStorage())
  }, [])

  /** Toggle a technique's saved state. */
  const toggleSaved = useCallback((techniqueId: string) => {
    setSavedIds(prev => {
      const next = new Set(prev)
      if (next.has(techniqueId)) {
        next.delete(techniqueId)
      } else {
        next.add(techniqueId)
      }
      writeToStorage(next)
      return next
    })
  }, [])

  /** Check if a technique is saved. */
  const isSaved = useCallback(
    (techniqueId: string): boolean => savedIds.has(techniqueId),
    [savedIds],
  )

  return {
    savedIds,
    savedCount: savedIds.size,
    toggleSaved,
    isSaved,
  }
}
