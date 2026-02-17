'use client'

/**
 * @file add-to-river-dialog.tsx
 *
 * @description Dialog for adding milestones or objectives to a strategic
 * objective river lane. Triggered by clicking the "+" button on a river lane
 * in the StrategyRiver visualization.
 *
 * Supports two creation modes:
 * - **Milestone**: Creates a new milestone under the strategic goal
 * - **Objective**: Creates a new objective under an existing milestone
 *
 * @component AddToRiverDialog
 *
 * @related
 * - Server actions: src/actions/canvas.ts — createMilestones, createCanvasObjective
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
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DatePickerWithShortcuts } from '@/components/ui/date-picker-with-shortcuts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Milestone as MilestoneIcon,
  Target,
  Plus,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { createMilestones, createCanvasObjective } from '@/actions/canvas'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

import type { MilestoneOption } from '@/types/canvas'

// ============================================================================
// TYPES
// ============================================================================

type CreateMode = 'milestone' | 'objective'

interface AddToRiverDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Open/close handler */
  onOpenChange: (open: boolean) => void
  /** ID of the strategic objective (goal) to add to */
  strategicObjectiveId: string
  /** Title of the strategic objective (for display) */
  strategicObjectiveTitle: string
  /** Available milestones for objective creation (needed to pick parent) */
  milestones?: MilestoneOption[]
  /** Called after successful creation */
  onCreated: () => void
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TITLE_MAX_LENGTH = 200
const DESCRIPTION_MAX_LENGTH = 500

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * AddToRiverDialog - Quick-add a milestone or objective to a strategic river lane.
 *
 * @description A dialog for creating either a new milestone within a strategic
 * goal, or a new objective under an existing milestone. Users pick the type,
 * provide a title (and optionally description/date), and the item appears
 * in the river visualization.
 *
 * @param props - Dialog props including the target strategic objective
 * @returns Dialog component
 */
export function AddToRiverDialog({
  open,
  onOpenChange,
  strategicObjectiveId,
  strategicObjectiveTitle,
  milestones = [],
  onCreated,
}: AddToRiverDialogProps) {
  const [mode, setMode] = useState<CreateMode>('milestone')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
  const [selectedMilestoneId, setSelectedMilestoneId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const hasMilestones = milestones.length > 0

  // ── Reset form on close ──
  const handleOpenChange = useCallback((nextOpen: boolean): void => {
    if (!nextOpen) {
      setTitle('')
      setDescription('')
      setDueDate(undefined)
      setSelectedMilestoneId('')
      setError(null)
      setMode('milestone')
    }
    onOpenChange(nextOpen)
  }, [onOpenChange])

  // ── Validate and submit ──
  const handleSubmit = useCallback((): void => {
    const trimmed = title.trim()

    // VALIDATION: Title is required
    if (!trimmed) {
      setError(`Please enter ${mode === 'milestone' ? 'a milestone' : 'an objective'} title`)
      return
    }

    if (mode === 'milestone') {
      // VALIDATION: Due date required for milestones
      if (!dueDate) {
        setError('Please select a due date')
        return
      }
    } else {
      // VALIDATION: Must select a parent milestone for objectives
      if (!selectedMilestoneId) {
        setError('Please select which milestone this objective belongs to')
        return
      }
    }

    setError(null)

    startTransition(async () => {
      if (mode === 'milestone') {
        const milestoneInput = {
          title: trimmed,
          due_date: dueDate!.toISOString().slice(0, 10),
          order_index: 999,
        }

        const result = await createMilestones(strategicObjectiveId, [milestoneInput])

        if ('error' in result) {
          setError(result.error)
          return
        }

        toast.success(`Milestone "${trimmed}" added`)
      } else {
        const result = await createCanvasObjective({
          title: trimmed,
          milestone_id: selectedMilestoneId,
          description: description.trim() || undefined,
        })

        if ('error' in result) {
          setError(result.error)
          return
        }

        toast.success(`Objective "${trimmed}" added`)
      }

      handleOpenChange(false)
      onCreated()
    })
  }, [title, description, dueDate, selectedMilestoneId, mode, strategicObjectiveId, handleOpenChange, onCreated])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'milestone' ? (
              <MilestoneIcon className="h-5 w-5 text-international-orange" />
            ) : (
              <Target className="h-5 w-5 text-international-orange" />
            )}
            Add to Strategy
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Context */}
          <p className="text-sm text-muted-foreground">
            Adding to <span className="font-semibold text-foreground">{strategicObjectiveTitle}</span>
          </p>

          {/* Type selector */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setMode('milestone'); setError(null) }}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                mode === 'milestone'
                  ? 'border-international-orange bg-international-orange-light text-international-orange'
                  : 'border-input text-muted-foreground hover:bg-muted'
              )}
            >
              <MilestoneIcon className="h-4 w-4" />
              Milestone
            </button>
            <button
              type="button"
              onClick={() => { setMode('objective'); setError(null) }}
              disabled={!hasMilestones}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                mode === 'objective'
                  ? 'border-international-orange bg-international-orange-light text-international-orange'
                  : 'border-input text-muted-foreground hover:bg-muted',
                !hasMilestones && 'opacity-50 cursor-not-allowed'
              )}
              title={!hasMilestones ? 'Create a milestone first before adding objectives' : undefined}
            >
              <Target className="h-4 w-4" />
              Objective
            </button>
          </div>

          {!hasMilestones && mode === 'milestone' && (
            <p className="text-xs text-muted-foreground">
              Create milestones first, then you can add objectives under them.
            </p>
          )}

          {/* Error display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Title input */}
          <div className="space-y-2">
            <Label htmlFor="item-title">
              {mode === 'milestone' ? 'Milestone' : 'Objective'} title{' '}
              <span className="text-destructive" aria-label="required">*</span>
            </Label>
            <Input
              id="item-title"
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (error) setError(null) }}
              placeholder={
                mode === 'milestone'
                  ? 'e.g. Complete market research'
                  : 'e.g. Validate product-market fit'
              }
              maxLength={TITLE_MAX_LENGTH}
              aria-required
              aria-invalid={!!error && !title.trim()}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && mode === 'milestone') { e.preventDefault(); handleSubmit() } }}
            />
            <p className="text-xs text-muted-foreground">
              {title.length} / {TITLE_MAX_LENGTH} characters
            </p>
          </div>

          {/* Milestone-specific: Due date */}
          {mode === 'milestone' && (
            <div className="space-y-2">
              <Label htmlFor="milestone-date">
                Due date <span className="text-destructive" aria-label="required">*</span>
              </Label>
              <DatePickerWithShortcuts
                date={dueDate}
                onDateChange={setDueDate}
              />
            </div>
          )}

          {/* Objective-specific: Parent milestone picker */}
          {mode === 'objective' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="parent-milestone">
                  Under milestone <span className="text-destructive" aria-label="required">*</span>
                </Label>
                <Select
                  value={selectedMilestoneId}
                  onValueChange={(v) => { setSelectedMilestoneId(v); if (error) setError(null) }}
                >
                  <SelectTrigger id="parent-milestone">
                    <SelectValue placeholder="Select a milestone" />
                  </SelectTrigger>
                  <SelectContent>
                    {milestones.map((ms) => (
                      <SelectItem key={ms.id} value={ms.id}>
                        {ms.title}
                        {ms.milestone_date && (
                          <span className="text-muted-foreground ml-2">
                            — due {ms.milestone_date}
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="obj-description">Description (optional)</Label>
                <Textarea
                  id="obj-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does achieving this objective look like?"
                  maxLength={DESCRIPTION_MAX_LENGTH}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  {description.length} / {DESCRIPTION_MAX_LENGTH} characters
                </p>
              </div>
            </>
          )}
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
                  Add {mode === 'milestone' ? 'Milestone' : 'Objective'}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
