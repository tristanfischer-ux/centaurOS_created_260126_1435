'use client'

/**
 * @file add-to-river-dialog.tsx
 *
 * @description Lightweight dialog for adding a new milestone to a specific
 * strategic objective river lane. Triggered by clicking the "+" button on a
 * river lane in the StrategyRiver visualization.
 *
 * @component AddToRiverDialog
 *
 * @example
 * <AddToRiverDialog
 *   open={!!addToRiverGoalId}
 *   onOpenChange={(open) => !open && setAddToRiverGoalId(null)}
 *   strategicObjectiveId={addToRiverGoalId ?? ''}
 *   strategicObjectiveTitle={getGoalTitle(addToRiverGoalId)}
 *   onCreated={handleDialogUpdate}
 * />
 *
 * @related
 * - Server action: src/actions/canvas.ts — createMilestones
 * - River: src/components/canvas/StrategyRiver.tsx
 * - Shell: src/app/(platform)/canvas/canvas-shell.tsx
 */

import { useState, useTransition, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DatePickerWithShortcuts } from '@/components/ui/date-picker-with-shortcuts'
import { Milestone as MilestoneIcon, Plus, Loader2, AlertCircle } from 'lucide-react'
import { createMilestones } from '@/actions/canvas'
import { toast } from 'sonner'

// ============================================================================
// TYPES
// ============================================================================

interface AddToRiverDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Open/close handler */
  onOpenChange: (open: boolean) => void
  /** ID of the strategic objective to add to */
  strategicObjectiveId: string
  /** Title of the strategic objective (for display) */
  strategicObjectiveTitle: string
  /** Called after successful creation */
  onCreated: () => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TITLE_MAX_LENGTH = 200

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * AddToRiverDialog - Quick-add a milestone to a strategic objective river lane.
 *
 * @description A lightweight single-step dialog for creating a new milestone
 * within a specific strategic objective. Users provide a title and due date,
 * and the milestone appears in the river visualization.
 *
 * @param props - Dialog props including the target strategic objective
 * @returns Dialog component
 */
export function AddToRiverDialog({
  open,
  onOpenChange,
  strategicObjectiveId,
  strategicObjectiveTitle,
  onCreated,
}: AddToRiverDialogProps) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ── Reset form on close ──
  const handleOpenChange = useCallback((nextOpen: boolean): void => {
    if (!nextOpen) {
      setTitle('')
      setDueDate(undefined)
      setError(null)
    }
    onOpenChange(nextOpen)
  }, [onOpenChange])

  // ── Validate and submit ──
  const handleSubmit = useCallback((): void => {
    // VALIDATION: Title is required
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Please enter a milestone title')
      return
    }

    // VALIDATION: Due date is required
    if (!dueDate) {
      setError('Please select a due date')
      return
    }

    setError(null)

    startTransition(async () => {
      // Get count of existing milestones for order_index
      const milestoneInput = {
        title: trimmed,
        due_date: dueDate.toISOString().slice(0, 10),
        order_index: 999, // Append at end; order will be recalculated
      }

      const result = await createMilestones(strategicObjectiveId, [milestoneInput])

      if ('error' in result) {
        setError(result.error)
        return
      }

      toast.success(`Milestone "${trimmed}" added`)
      handleOpenChange(false)
      onCreated()
    })
  }, [title, dueDate, strategicObjectiveId, handleOpenChange, onCreated])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MilestoneIcon className="h-5 w-5 text-international-orange" />
            Add Milestone
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Context: which river this milestone will be added to */}
          <p className="text-sm text-muted-foreground">
            Adding a milestone to <span className="font-semibold text-foreground">{strategicObjectiveTitle}</span>
          </p>

          {/* Error display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Title input */}
          <div className="space-y-2">
            <Label htmlFor="milestone-title">
              Milestone title <span className="text-destructive" aria-label="required">*</span>
            </Label>
            <Input
              id="milestone-title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (error) setError(null) }}
              placeholder="e.g. Complete market research"
              maxLength={TITLE_MAX_LENGTH}
              aria-required
              aria-invalid={!!error && !title.trim()}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit() } }}
            />
            <p className="text-xs text-muted-foreground">
              {title.length} / {TITLE_MAX_LENGTH} characters
            </p>
          </div>

          {/* Due date */}
          <div className="space-y-2">
            <Label htmlFor="milestone-date">
              Due date <span className="text-destructive" aria-label="required">*</span>
            </Label>
            <DatePickerWithShortcuts
              date={dueDate}
              onDateChange={setDueDate}
            />
          </div>
        </div>

        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <Button variant="secondary" onClick={() => handleOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Milestone
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
