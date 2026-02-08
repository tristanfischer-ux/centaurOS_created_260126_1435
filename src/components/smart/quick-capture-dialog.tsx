'use client'

/**
 * QuickCaptureDialog - Lightweight dialog for rapidly capturing ideas as objectives or tasks.
 *
 * @description A minimal dialog optimized for speed: one textarea ("What's on your mind?")
 * with a toggle for objective vs. task. On submit it uses the SMART engine to refine the
 * idea, then routes to the appropriate creation dialog with context pre-filled.
 *
 * Entry points: global FAB, sidebar "+", mobile FAB, command palette, contextual CTAs.
 *
 * @component
 *
 * @example
 * <QuickCaptureDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   context={{ source: 'marketplace', entityTitle: 'SEO Expert' }}
 * />
 */

import { useState, useEffect, useCallback } from 'react'
import { Lightbulb, Target, CheckSquare, Sparkles, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { smartifyGoal } from '@/actions/smart-goals'
import { SmartScoreCard, getOverallScore } from '@/components/smart/smart-score-card'
import { toast } from 'sonner'

import type { SmartGoalContext, SmartGoalSuggestion } from '@/actions/smart-goals'

type CaptureType = 'objective' | 'task'

interface QuickCaptureDialogProps {
  /** Controls whether the dialog is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Optional pre-fill context from the source page */
  context?: SmartGoalContext
  /** Optional pre-fill text for the idea */
  prefillText?: string
  /** Called when the user wants to create an objective (with AI-refined data) */
  onCreateObjective?: (rawIdea: string, suggestion?: SmartGoalSuggestion) => void
  /** Called when the user wants to create a task (with AI-refined data) */
  onCreateTask?: (rawIdea: string, suggestion?: SmartGoalSuggestion) => void
}

export function QuickCaptureDialog({
  open,
  onOpenChange,
  context,
  prefillText,
  onCreateObjective,
  onCreateTask,
}: QuickCaptureDialogProps): React.ReactElement {
  const [idea, setIdea] = useState('')
  const [captureType, setCaptureType] = useState<CaptureType>('task')
  const [isRefining, setIsRefining] = useState(false)
  const [suggestion, setSuggestion] = useState<SmartGoalSuggestion | null>(null)

  // Pre-fill when dialog opens
  useEffect(() => {
    if (open) {
      if (prefillText) setIdea(prefillText)
      setSuggestion(null)
    } else {
      // Reset on close (delayed for animation)
      setTimeout(() => {
        setIdea('')
        setSuggestion(null)
        setIsRefining(false)
      }, 300)
    }
  }, [open, prefillText])

  /** Refine with AI then dispatch to create flow */
  const handleCapture = useCallback(async () => {
    const trimmed = idea.trim()
    if (trimmed.length < 5) {
      toast.error('Please enter at least a few words about your idea.')
      return
    }

    setIsRefining(true)

    const result = await smartifyGoal({
      rawIdea: trimmed,
      type: captureType,
      context,
    })

    setIsRefining(false)

    if (result.suggestion) {
      setSuggestion(result.suggestion)
      const overall = getOverallScore(result.suggestion.smartScore)

      // If score is already strong, go straight to create
      if (overall >= 3.5) {
        if (captureType === 'objective') {
          onCreateObjective?.(trimmed, result.suggestion)
        } else {
          onCreateTask?.(trimmed, result.suggestion)
        }
        onOpenChange(false)
      }
      // Otherwise, show the refined suggestion for user review
    } else {
      // AI failed -- let user create anyway with raw text
      toast.error(result.error || 'Could not refine. Creating with your original text.')
      if (captureType === 'objective') {
        onCreateObjective?.(trimmed)
      } else {
        onCreateTask?.(trimmed)
      }
      onOpenChange(false)
    }
  }, [idea, captureType, context, onCreateObjective, onCreateTask, onOpenChange])

  /** Accept the refined suggestion and create */
  const handleAcceptSuggestion = useCallback(() => {
    if (!suggestion) return
    if (captureType === 'objective') {
      onCreateObjective?.(idea.trim(), suggestion)
    } else {
      onCreateTask?.(idea.trim(), suggestion)
    }
    onOpenChange(false)
  }, [suggestion, captureType, idea, onCreateObjective, onCreateTask, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-international-orange" />
            Capture an Idea
          </DialogTitle>
          <DialogDescription>
            Turn a thought into action. AI will help make it SMART.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCaptureType('task')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all',
                captureType === 'task'
                  ? 'bg-foreground text-background shadow-md'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              <CheckSquare className="h-4 w-4" />
              Task
            </button>
            <button
              type="button"
              onClick={() => setCaptureType('objective')}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all',
                captureType === 'objective'
                  ? 'bg-foreground text-background shadow-md'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
            >
              <Target className="h-4 w-4" />
              Objective
            </button>
          </div>

          {/* Idea input */}
          <div className="space-y-2">
            <Label htmlFor="quick-idea" className="sr-only">
              Your idea
            </Label>
            <Textarea
              id="quick-idea"
              placeholder={
                captureType === 'task'
                  ? 'e.g. Research competitor pricing, set up analytics, hire a designer...'
                  : 'e.g. Launch MVP by Q2, grow revenue to $10k MRR, build advisory board...'
              }
              value={idea}
              onChange={(e) => {
                setIdea(e.target.value)
                setSuggestion(null)
              }}
              className="min-h-[100px] resize-none"
              autoFocus
              maxLength={2000}
            />
            {idea.length > 0 && (
              <p className="text-xs text-muted-foreground text-right">
                {idea.length} / 2,000
              </p>
            )}
          </div>

          {/* Refined suggestion preview */}
          {suggestion && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">AI-refined version</p>
                <SmartScoreCard
                  score={suggestion.smartScore}
                  suggestions={suggestion.suggestions}
                  compact
                />
              </div>
              <p className="text-sm text-foreground font-medium">{suggestion.title}</p>
              {suggestion.description && (
                <p className="text-xs text-muted-foreground">{suggestion.description}</p>
              )}
              <Button
                variant="default"
                size="sm"
                onClick={handleAcceptSuggestion}
                className="w-full"
              >
                Use this and create
              </Button>
            </div>
          )}

          {/* Context indicator */}
          {context?.entityTitle && (
            <p className="text-xs text-muted-foreground">
              Inspired by: <span className="font-medium">{context.entityTitle}</span>
              {context.source !== 'manual' && (
                <span> (from {context.source})</span>
              )}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCapture}
            disabled={isRefining || idea.trim().length < 5}
            className="min-w-[140px]"
          >
            {isRefining ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Refining...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Capture &amp; Refine
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
