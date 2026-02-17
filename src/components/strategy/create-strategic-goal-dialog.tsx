'use client'

/**
 * @file create-strategic-goal-dialog.tsx
 *
 * @description Inline dialog for creating a strategic goal directly from
 * the Strategy page. Keeps the user in context instead of navigating away.
 *
 * @security Uses createStrategicGoal server action which validates auth
 * and scopes to the user's foundry.
 */

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Plus, Target, Calendar, FileText, Flag, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { createStrategicGoal } from '@/actions/canvas'
import { AutoGenerateMilestonesDialog } from './auto-generate-milestones-dialog'
import { GOAL_TYPES } from '@/types/canvas'

import type { GoalType } from '@/types/canvas'

// ============================================================================
// CONSTANTS
// ============================================================================

const CHARACTER_LIMITS = {
  title: 200,
  description: 500,
} as const

const GOAL_TYPE_ICONS: Record<GoalType, string> = {
  Fundraise: '💰',
  Launch: '🚀',
  Hiring: '👥',
  Revenue: '📈',
  Other: '🎯',
} satisfies Record<GoalType, string>

// ============================================================================
// TYPES
// ============================================================================

interface CreateStrategicGoalDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Dialog for creating a new strategic goal with title, description,
 * goal type, and target date.
 *
 * @description Provides a focused creation experience without navigating
 * away from the Strategy page. Uses the createStrategicGoal server action.
 *
 * @param props.open - Whether the dialog is open
 * @param props.onOpenChange - Callback when open state changes
 */
export function CreateStrategicGoalDialog({
  open,
  onOpenChange,
}: CreateStrategicGoalDialogProps) {
  const router = useRouter()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [goalType, setGoalType] = useState<GoalType>('Other')
  const [targetDate, setTargetDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [autoGenerate, setAutoGenerate] = useState(true)

  // State for chaining to the auto-generate dialog after goal creation
  const [autoGenGoalId, setAutoGenGoalId] = useState<string | null>(null)
  const [autoGenGoalTitle, setAutoGenGoalTitle] = useState('')
  const [autoGenGoalDeadline, setAutoGenGoalDeadline] = useState('')
  const [autoGenGoalDescription, setAutoGenGoalDescription] = useState<string | null>(null)

  const resetForm = useCallback((): void => {
    setTitle('')
    setDescription('')
    setGoalType('Other')
    setTargetDate('')
    setError(null)
    setAutoGenerate(true)
  }, [])

  const handleOpenChange = useCallback((nextOpen: boolean): void => {
    if (!nextOpen) {
      resetForm()
    }
    onOpenChange(nextOpen)
  }, [onOpenChange, resetForm])

  const handleSubmit = useCallback(async (): Promise<void> => {
    // VALIDATION: Title is required
    if (!title.trim()) {
      setError('Please enter a title for your strategic goal')
      return
    }

    // VALIDATION: Target date is required
    if (!targetDate) {
      setError('Please set a target date')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const result = await createStrategicGoal({
        title: title.trim(),
        description: description.trim() || undefined,
        goal_type: goalType,
        target_date: targetDate,
      })

      if ('error' in result) {
        setError(result.error)
        return
      }

      toast.success('Strategic goal created', {
        description: title.trim(),
      })

      handleOpenChange(false)
      router.refresh()

      // Chain to auto-generate dialog if enabled
      if (autoGenerate && 'data' in result && result.data) {
        setAutoGenGoalId(result.data.id)
        setAutoGenGoalTitle(title.trim())
        setAutoGenGoalDeadline(targetDate)
        setAutoGenGoalDescription(description.trim() || null)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create strategic goal'
      console.error('[CreateStrategicGoalDialog] Unexpected error:', { error: message })
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }, [title, description, goalType, targetDate, autoGenerate, handleOpenChange, router])

  // Compute minimum date (today)
  const today = new Date().toISOString().split('T')[0]

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-international-orange" />
            Create Strategic Goal
          </DialogTitle>
          <DialogDescription>
            Define a high-level goal that everything else aligns to.
            Objectives, tasks, and progress will cascade from here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Error display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="goal-title" className="text-sm font-medium">
              What do you want to achieve?
              <span className="text-destructive ml-1" aria-label="required">*</span>
            </Label>
            <div className="relative">
              <Target className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="goal-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  if (error) setError(null)
                }}
                placeholder="e.g., Raise $50M Series B funding"
                maxLength={CHARACTER_LIMITS.title}
                className="pl-10"
                aria-required
                aria-invalid={!!error && !title.trim()}
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {title.length} / {CHARACTER_LIMITS.title} characters
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="goal-description" className="text-sm font-medium">
              Why does this matter?
            </Label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Textarea
                id="goal-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the impact this goal will have..."
                maxLength={CHARACTER_LIMITS.description}
                className="pl-10 min-h-[80px]"
                rows={3}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {description.length} / {CHARACTER_LIMITS.description} characters
            </p>
          </div>

          {/* Goal Type & Target Date — side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Goal Type */}
            <div className="space-y-2">
              <Label htmlFor="goal-type" className="text-sm font-medium">
                Goal type
                <span className="text-destructive ml-1" aria-label="required">*</span>
              </Label>
              <Select
                value={goalType}
                onValueChange={(v) => setGoalType(v as GoalType)}
              >
                <SelectTrigger id="goal-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      <span className="flex items-center gap-2">
                        <span>{GOAL_TYPE_ICONS[type]}</span>
                        <span>{type}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target Date */}
            <div className="space-y-2">
              <Label htmlFor="goal-target-date" className="text-sm font-medium">
                Target date
                <span className="text-destructive ml-1" aria-label="required">*</span>
              </Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="goal-target-date"
                  type="date"
                  value={targetDate}
                  onChange={(e) => {
                    setTargetDate(e.target.value)
                    if (error) setError(null)
                  }}
                  min={today}
                  className="pl-10"
                  aria-required
                  aria-invalid={!!error && !targetDate}
                />
              </div>
            </div>
          </div>

          {/* Auto-generate toggle */}
          <label className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4 cursor-pointer">
            <Checkbox
              checked={autoGenerate}
              onCheckedChange={(checked) => setAutoGenerate(checked === true)}
              className="mt-0.5"
              aria-label="Auto-generate milestones and tasks"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-international-orange" />
                <span className="text-sm font-medium text-foreground">
                  Auto-generate milestones and tasks
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                AI will create a full plan with milestones, tasks, dependencies, and risk analysis.
                You&apos;ll review everything before it&apos;s created.
              </p>
            </div>
          </label>
        </div>

        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <Button
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-international-orange hover:bg-international-orange-hover"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Create Goal
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Chained auto-generate dialog */}
    {autoGenGoalId && (
      <AutoGenerateMilestonesDialog
        open={!!autoGenGoalId}
        onOpenChange={(isOpen) => {
          if (!isOpen) setAutoGenGoalId(null)
        }}
        goalId={autoGenGoalId}
        goalTitle={autoGenGoalTitle}
        goalDeadline={autoGenGoalDeadline}
        goalDescription={autoGenGoalDescription}
        onComplete={() => {
          setAutoGenGoalId(null)
          router.refresh()
        }}
      />
    )}
    </>
  )
}
