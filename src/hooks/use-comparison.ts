/**
 * @file use-comparison.ts
 * 
 * @description Shared hook for comparison modal state management.
 * Extracts common logic from marketplace and team comparison modals
 * to ensure consistent behavior and prevent duplicate bugs.
 * 
 * @usage
 * const {
 *   aiAnalysis,
 *   isAnalyzing,
 *   analysisError,
 *   analyzeWithAI,
 *   clearAnalysis,
 *   handleOpenChange
 * } = useComparison({ endpoint: '/api/marketplace/compare' })
 */

import { useState, useCallback, useEffect } from 'react'

interface AIAnalysisResult {
  winner: string
  winnerTitle?: string
  winnerName?: string
  reasoning: string
  tradeoffs: string[]
  summary: string
}

interface UseComparisonOptions<T> {
  /** API endpoint for AI analysis */
  endpoint: string
  /** Items to compare */
  items: T[]
  /** Called when modal open state changes */
  onOpenChange?: (open: boolean) => void
}

interface UseComparisonResult<T> {
  /** AI analysis result */
  aiAnalysis: AIAnalysisResult | null
  /** Whether AI analysis is in progress */
  isAnalyzing: boolean
  /** Error message from AI analysis */
  analysisError: string | null
  /** Trigger AI analysis */
  analyzeWithAI: () => Promise<void>
  /** Clear analysis state */
  clearAnalysis: () => void
  /** Handle modal open/close with cleanup */
  handleOpenChange: (open: boolean) => void
  /** Clear error message */
  clearError: () => void
}

/**
 * Hook for managing comparison modal state.
 * Provides AI analysis, error handling, and cleanup logic.
 * 
 * @param options - Configuration options
 * @returns Comparison state and handlers
 * 
 * @example
 * // In marketplace comparison modal
 * const comparison = useComparison({
 *   endpoint: '/api/marketplace/compare',
 *   items: selectedListings,
 *   onOpenChange
 * })
 * 
 * // In team comparison modal  
 * const comparison = useComparison({
 *   endpoint: '/api/team/compare',
 *   items: selectedMembers,
 *   onOpenChange
 * })
 */
export function useComparison<T>({
  endpoint,
  items,
  onOpenChange
}: UseComparisonOptions<T>): UseComparisonResult<T> {
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

  // Clear analysis when items change
  useEffect(() => {
    setAiAnalysis(null)
    setAnalysisError(null)
  }, [items])

  const clearAnalysis = useCallback(() => {
    setAiAnalysis(null)
    setAnalysisError(null)
  }, [])

  const clearError = useCallback(() => {
    setAnalysisError(null)
  }, [])

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      clearAnalysis()
    }
    onOpenChange?.(open)
  }, [onOpenChange, clearAnalysis])

  const analyzeWithAI = useCallback(async () => {
    if (items.length < 2) {
      setAnalysisError('Need at least 2 items to compare')
      return
    }

    setIsAnalyzing(true)
    setAnalysisError(null)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, members: items }) // Support both naming conventions
      })

      const data = await response.json()

      if (!response.ok || data.error) {
        setAnalysisError(data.error || 'Failed to analyze. Please try again.')
        return
      }

      setAiAnalysis(data)
    } catch (error) {
      console.error('[useComparison] AI analysis failed:', error)
      setAnalysisError('Failed to connect to AI service. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }, [endpoint, items])

  return {
    aiAnalysis,
    isAnalyzing,
    analysisError,
    analyzeWithAI,
    clearAnalysis,
    handleOpenChange,
    clearError
  }
}

/**
 * Utility to compute best values for numeric comparisons.
 * Used by both marketplace and team comparison modals.
 * 
 * @param items - Array of items with attributes
 * @param keys - Attribute keys to compare
 * @param higherIsBetter - Keys where higher values are better
 * @param lowerIsBetter - Keys where lower values are better
 * @param getValue - Function to extract value from item
 * @param getId - Function to get item ID
 */
export function computeBestValues<T>(
  items: T[],
  keys: string[],
  higherIsBetter: string[],
  lowerIsBetter: string[],
  getValue: (item: T, key: string) => number | null,
  getId: (item: T) => string
): Record<string, { value: number; itemId: string; direction: 'higher' | 'lower' } | null> {
  const bestValues: Record<string, { value: number; itemId: string; direction: 'higher' | 'lower' } | null> = {}

  for (const key of keys) {
    const values: { value: number; itemId: string }[] = []

    for (const item of items) {
      const value = getValue(item, key)
      if (value !== null) {
        values.push({ value, itemId: getId(item) })
      }
    }

    if (values.length >= 2) {
      const isHigherBetter = higherIsBetter.includes(key)
      const isLowerBetter = lowerIsBetter.includes(key)

      if (isHigherBetter || isLowerBetter) {
        const sorted = [...values].sort((a, b) =>
          isHigherBetter ? b.value - a.value : a.value - b.value
        )

        const best = sorted[0]
        const second = sorted[1]

        // Only highlight if there's a meaningful difference
        if (best.value !== second.value) {
          bestValues[key] = {
            value: best.value,
            itemId: best.itemId,
            direction: isHigherBetter ? 'higher' : 'lower'
          }
        } else {
          bestValues[key] = null
        }
      } else {
        bestValues[key] = null
      }
    } else {
      bestValues[key] = null
    }
  }

  return bestValues
}

/**
 * Extract numeric value from various formats.
 * Handles: numbers, percentages, currency, durations.
 */
export function extractNumericValue(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return null

  // Handle percentages like "95%"
  if (value.endsWith('%')) {
    const num = parseFloat(value.slice(0, -1))
    return isNaN(num) ? null : num
  }

  // Handle currency like "£150/hour" or "£50,000"
  const currencyMatch = value.match(/[£$€]?([\d,]+(?:\.\d+)?)/i)
  if (currencyMatch) {
    const num = parseFloat(currencyMatch[1].replace(/,/g, ''))
    return isNaN(num) ? null : num
  }

  // Handle simple numbers like "5 years" -> 5
  const simpleMatch = value.match(/^([\d.]+)/)
  if (simpleMatch) {
    const num = parseFloat(simpleMatch[1])
    return isNaN(num) ? null : num
  }

  return null
}
