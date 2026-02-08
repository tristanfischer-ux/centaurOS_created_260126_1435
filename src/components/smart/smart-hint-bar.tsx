'use client'

/**
 * SmartHintBar - Inline SMART feedback for task/objective title fields.
 *
 * @description Shows a compact bar below a text input that analyzes the
 * entered text against SMART criteria with a debounced AI call. Displays
 * a brief suggestion and mini score pills. Includes a "Refine with AI"
 * sparkle button to trigger full smartification.
 *
 * @component
 *
 * @example
 * <SmartHintBar
 *   text={title}
 *   type="task"
 *   onAcceptSuggestion={(suggestion) => setTitle(suggestion.title)}
 * />
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Sparkles, Loader2, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { SmartScoreCard } from '@/components/smart/smart-score-card'
import { smartifyGoal, scoreSmartGoal } from '@/actions/smart-goals'

import type { SmartScore, SmartGoalSuggestion, SmartGoalContext } from '@/actions/smart-goals'

interface SmartHintBarProps {
  /** Current text to analyze */
  text: string
  /** Whether this is for an objective or task */
  type: 'objective' | 'task'
  /** Optional source context for AI pre-fill */
  context?: SmartGoalContext
  /** Called when user accepts a refined suggestion */
  onAcceptSuggestion?: (suggestion: SmartGoalSuggestion) => void
  /** Additional CSS classes */
  className?: string
}

/** Debounce delay for scoring (ms) */
const SCORE_DEBOUNCE_MS = 1500

export function SmartHintBar({
  text,
  type,
  context,
  onAcceptSuggestion,
  className,
}: SmartHintBarProps): React.ReactElement | null {
  const [score, setScore] = useState<SmartScore | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [isScoring, setIsScoring] = useState(false)
  const [isRefining, setIsRefining] = useState(false)
  const [refinedSuggestion, setRefinedSuggestion] = useState<SmartGoalSuggestion | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastScoredText = useRef<string>('')

  // Debounced scoring as user types
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = text.trim()
    if (trimmed.length < 5) {
      setScore(null)
      setSuggestions([])
      setRefinedSuggestion(null)
      return
    }

    // Don't re-score if text hasn't meaningfully changed
    if (trimmed === lastScoredText.current) return

    debounceRef.current = setTimeout(async () => {
      setIsScoring(true)
      const result = await scoreSmartGoal(trimmed, type)
      if (result.score) {
        setScore(result.score)
        setSuggestions(result.suggestions || [])
        lastScoredText.current = trimmed
      }
      setIsScoring(false)
    }, SCORE_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [text, type])

  // Full AI refinement
  const handleRefine = useCallback(async () => {
    const trimmed = text.trim()
    if (trimmed.length < 5 || isRefining) return

    setIsRefining(true)
    setRefinedSuggestion(null)

    const result = await smartifyGoal({
      rawIdea: trimmed,
      type,
      context,
    })

    if (result.suggestion) {
      setRefinedSuggestion(result.suggestion)
      setScore(result.suggestion.smartScore)
      setSuggestions(result.suggestion.suggestions)
    }
    setIsRefining(false)
  }, [text, type, context, isRefining])

  const handleAccept = useCallback(() => {
    if (refinedSuggestion && onAcceptSuggestion) {
      onAcceptSuggestion(refinedSuggestion)
      setRefinedSuggestion(null)
    }
  }, [refinedSuggestion, onAcceptSuggestion])

  // Don't render until user has typed enough
  if (text.trim().length < 5) return null

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-muted/30 px-3 py-2 transition-all',
        className
      )}
    >
      {/* Score + refine row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isScoring ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Analyzing...
            </div>
          ) : score ? (
            <SmartScoreCard score={score} suggestions={suggestions} compact />
          ) : null}

          {suggestions.length > 0 && !refinedSuggestion && (
            <span className="text-xs text-muted-foreground truncate max-w-[300px]">
              {suggestions[0]}
            </span>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-international-orange hover:text-international-orange-hover"
          onClick={handleRefine}
          disabled={isRefining || text.trim().length < 5}
        >
          {isRefining ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Refining...
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" />
              Refine with AI
            </>
          )}
        </Button>
      </div>

      {/* Refined suggestion */}
      {refinedSuggestion && (
        <div className="flex items-start gap-2 rounded-md border bg-background p-2.5">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {refinedSuggestion.title}
            </p>
            {refinedSuggestion.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                {refinedSuggestion.description}
              </p>
            )}
          </div>
          <Button
            variant="default"
            size="sm"
            className="h-7 shrink-0 gap-1"
            onClick={handleAccept}
          >
            Use this
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  )
}
