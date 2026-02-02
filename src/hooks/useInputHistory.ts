'use client'

import { useState, useCallback, useRef } from 'react'

const MAX_HISTORY_SIZE = 50

interface UseInputHistoryOptions {
  maxSize?: number
  storageKey?: string // Optional localStorage persistence
}

interface UseInputHistoryReturn {
  // Navigate through history
  navigateUp: () => string | null
  navigateDown: () => string | null
  
  // Add to history after sending
  addToHistory: (value: string) => void
  
  // Reset navigation index (e.g., when user starts typing)
  resetNavigation: () => void
  
  // Current navigation index (-1 means not navigating)
  historyIndex: number
  
  // Check if currently navigating
  isNavigating: boolean
  
  // Get current value at history index
  getCurrentHistoryValue: () => string | null
}

/**
 * Hook for managing input history with up/down arrow navigation
 * Similar to terminal/Slack message input history
 */
export function useInputHistory(options: UseInputHistoryOptions = {}): UseInputHistoryReturn {
  const { maxSize = MAX_HISTORY_SIZE, storageKey } = options
  
  // Load initial history from localStorage if key provided
  const getInitialHistory = (): string[] => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey)
        return stored ? JSON.parse(stored) : []
      } catch {
        return []
      }
    }
    return []
  }
  
  const [history, setHistory] = useState<string[]>(getInitialHistory)
  const [historyIndex, setHistoryIndex] = useState(-1)
  
  // Store the current input before navigating
  const currentInputRef = useRef<string>('')
  
  // Persist history to localStorage
  const persistHistory = useCallback((newHistory: string[]) => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, JSON.stringify(newHistory))
      } catch (e) {
        console.warn('Failed to persist input history:', e)
      }
    }
  }, [storageKey])
  
  // Add a new entry to history
  const addToHistory = useCallback((value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    
    setHistory(prev => {
      // Don't add duplicates at the top
      if (prev[0] === trimmed) return prev
      
      // Add to front, remove duplicates, and limit size
      const newHistory = [trimmed, ...prev.filter(h => h !== trimmed)].slice(0, maxSize)
      persistHistory(newHistory)
      return newHistory
    })
    
    // Reset navigation
    setHistoryIndex(-1)
    currentInputRef.current = ''
  }, [maxSize, persistHistory])
  
  // Navigate up through history (older)
  const navigateUp = useCallback((): string | null => {
    if (history.length === 0) return null
    
    setHistoryIndex(prev => {
      const newIndex = Math.min(prev + 1, history.length - 1)
      return newIndex
    })
    
    const newIndex = Math.min(historyIndex + 1, history.length - 1)
    return history[newIndex] ?? null
  }, [history, historyIndex])
  
  // Navigate down through history (newer)
  const navigateDown = useCallback((): string | null => {
    if (historyIndex < 0) return null
    
    const newIndex = historyIndex - 1
    setHistoryIndex(newIndex)
    
    if (newIndex < 0) {
      // Return to current input
      return currentInputRef.current
    }
    
    return history[newIndex] ?? null
  }, [history, historyIndex])
  
  // Reset navigation (when user starts typing new content)
  const resetNavigation = useCallback(() => {
    if (historyIndex >= 0) {
      setHistoryIndex(-1)
      currentInputRef.current = ''
    }
  }, [historyIndex])
  
  // Get value at current history index
  const getCurrentHistoryValue = useCallback((): string | null => {
    if (historyIndex < 0 || historyIndex >= history.length) return null
    return history[historyIndex]
  }, [history, historyIndex])
  
  // Store current input when starting to navigate
  const setCurrentInput = useCallback((value: string) => {
    if (historyIndex < 0) {
      currentInputRef.current = value
    }
  }, [historyIndex])
  
  return {
    navigateUp,
    navigateDown,
    addToHistory,
    resetNavigation,
    historyIndex,
    isNavigating: historyIndex >= 0,
    getCurrentHistoryValue
  }
}

/**
 * Hook for combining input history with textarea/input state
 */
export function useInputWithHistory(
  initialValue: string = '',
  options: UseInputHistoryOptions = {}
) {
  const [value, setValue] = useState(initialValue)
  const history = useInputHistory(options)
  const savedCurrentRef = useRef<string>('')
  
  // Handle up arrow - navigate to older history
  const handleUpArrow = useCallback((isEmpty: boolean): boolean => {
    if (!isEmpty) return false // Only navigate when input is empty
    
    // Save current value before first navigation
    if (history.historyIndex < 0) {
      savedCurrentRef.current = value
    }
    
    const historyValue = history.navigateUp()
    if (historyValue !== null) {
      setValue(historyValue)
      return true
    }
    return false
  }, [history, value])
  
  // Handle down arrow - navigate to newer history
  const handleDownArrow = useCallback((): boolean => {
    if (history.historyIndex < 0) return false // Not navigating
    
    const historyValue = history.navigateDown()
    if (historyValue !== null) {
      setValue(historyValue)
      return true
    } else if (history.historyIndex === 0) {
      // Returned to current input
      setValue(savedCurrentRef.current)
      return true
    }
    return false
  }, [history])
  
  // Handle sending - add to history and clear
  const handleSend = useCallback(() => {
    if (value.trim()) {
      history.addToHistory(value)
      setValue('')
    }
  }, [value, history])
  
  // Handle change - reset history navigation if typing
  const handleChange = useCallback((newValue: string) => {
    setValue(newValue)
    if (history.isNavigating && newValue !== history.getCurrentHistoryValue()) {
      history.resetNavigation()
    }
  }, [history])
  
  return {
    value,
    setValue: handleChange,
    handleUpArrow,
    handleDownArrow,
    handleSend,
    isNavigating: history.isNavigating,
    historyIndex: history.historyIndex
  }
}
