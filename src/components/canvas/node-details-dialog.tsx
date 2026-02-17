'use client'

/**
 * @file node-details-dialog.tsx
 *
 * @description Details dialog that opens when any Canvas node is clicked.
 * Shows editable fields specific to the node type (goal, milestone, objective,
 * task) with auto-save on field change. Handles ghost accept/reject and
 * linking unlinked items to the strategic hierarchy.
 *
 * @component
 *
 * @related
 * - Server actions: src/actions/canvas.ts
 * - Types: src/types/canvas.ts
 * - Consumer: src/app/(platform)/canvas/strategic-canvas-view.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Info,
  CheckCircle2,
  XCircle,
  Loader2,
  Ghost,
  Trash2,
  Link2,
  AlertTriangle,
  Save,
  Target,
  Plus,
} from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePickerWithShortcuts } from '@/components/ui/date-picker-with-shortcuts'
import { cn } from '@/lib/utils'

import {
  getCanvasItemDetails,
  updateCanvasItem,
  acceptGhost,
  rejectGhost,
  softDeleteGoal,
  linkObjectiveToMilestone,
  linkTaskToObjective,
  getFoundryMembers,
  getObjectivesForLinking,
  createCanvasObjective,
} from '@/actions/canvas'

import type {
  CanvasObjectiveDetails,
  CanvasTaskDetails,
  FoundryMember,
  MilestoneOption,
} from '@/types/canvas'

// ============================================================================
// TYPES
// ============================================================================

interface NodeDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeType: 'goal' | 'milestone' | 'objective' | 'task'
  nodeId: string
  isUnlinked: boolean
  milestones: MilestoneOption[]
  onUpdate: () => void
}

/** Union of the two possible detail shapes */
type ItemDetails = CanvasObjectiveDetails | CanvasTaskDetails

/** Type guard: details represent a task (has assignees) */
function isTaskDetails(d: ItemDetails): d is CanvasTaskDetails {
  return 'assignees' in d && Array.isArray((d as CanvasTaskDetails).assignees)
}

// ============================================================================
// STATUS OPTIONS & DESCRIPTIONS
// ============================================================================

const GOAL_STATUSES = ['In Progress', 'Completed', 'On Hold'] as const
const MILESTONE_STATUSES = ['Not Started', 'In Progress', 'Done', 'Blocked'] as const
const OBJECTIVE_STATUSES = ['In Progress', 'Completed', 'On Hold'] as const
const TASK_STATUSES = ['Pending', 'Accepted', 'Rejected', 'Amended', 'Amended_Pending_Approval'] as const
const RISK_LEVELS = ['Low', 'Medium', 'High'] as const

/** Descriptions shown when user changes status, so they understand what it means */
const GOAL_STATUS_DESCRIPTIONS = {
  'In Progress': 'This goal is actively being worked on. Milestones and objectives under it are being pursued.',
  'Completed': 'This goal has been achieved. All milestones and objectives should be complete.',
  'On Hold': 'Work on this goal is paused. No active progress is expected until it resumes.',
} satisfies Record<(typeof GOAL_STATUSES)[number], string>

const MILESTONE_STATUS_DESCRIPTIONS = {
  'Not Started': 'This milestone hasn\u2019t begun yet. It\u2019s planned for the future.',
  'In Progress': 'Active work is underway toward this milestone.',
  'Done': 'This milestone has been achieved.',
  'Blocked': 'Progress on this milestone is blocked by a dependency or issue.',
} satisfies Record<(typeof MILESTONE_STATUSES)[number], string>

const OBJECTIVE_STATUS_DESCRIPTIONS = {
  'In Progress': 'This objective is actively being worked on.',
  'Completed': 'This objective has been achieved.',
  'On Hold': 'Work on this objective is paused.',
} satisfies Record<(typeof OBJECTIVE_STATUSES)[number], string>

const TASK_STATUS_DESCRIPTIONS = {
  'Pending': 'This task is waiting to be picked up.',
  'Accepted': 'This task has been accepted and is in progress.',
  'Rejected': 'This task was rejected and will not be done.',
  'Amended': 'This task has been modified since its original scope.',
  'Amended_Pending_Approval': 'This task was amended and is waiting for approval.',
} satisfies Record<(typeof TASK_STATUSES)[number], string>

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * NodeDetailsDialog — shows editable details for a clicked Canvas node.
 *
 * @description Fetches full item data on open, renders type-specific fields
 * that auto-save on change (debounced 300ms). Handles ghost accept/reject
 * and linking unlinked items to the structured hierarchy.
 */
export function NodeDetailsDialog({
  open,
  onOpenChange,
  nodeType,
  nodeId,
  isUnlinked,
  milestones,
  onUpdate,
}: NodeDetailsDialogProps) {
  // -- State --
  const [details, setDetails] = useState<ItemDetails | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [members, setMembers] = useState<FoundryMember[]>([])
  const [objectivesForLinking, setObjectivesForLinking] = useState<
    Array<{ id: string; title: string }>
  >([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)
  const [isPending, startTransition] = useTransition()
  /** Accumulates all changed fields since last save */
  const pendingChangesRef = useRef<Record<string, string | null>>({})

  // -- Fetch details + members on open --
  useEffect(() => {
    if (!open || !nodeId || !nodeType) return

    setIsLoading(true)
    setDetails(null)

    startTransition(async () => {
      const [detailsResult, membersResult] = await Promise.all([
        getCanvasItemDetails(nodeType, nodeId),
        getFoundryMembers(),
      ])

      if ('data' in detailsResult) {
        setDetails(detailsResult.data)
      } else {
        toast.error(detailsResult.error)
      }

      if ('data' in membersResult) {
        setMembers(membersResult.data)
      }

      // For unlinked tasks, also fetch objectives for linking
      if (nodeType === 'task' && isUnlinked) {
        const objResult = await getObjectivesForLinking()
        if ('data' in objResult) {
          setObjectivesForLinking(objResult.data)
        }
      }

      setIsLoading(false)
    })
  }, [open, nodeId, nodeType, isUnlinked])

  // -- Update local state + track dirty field (no auto-save) --
  const handleFieldChange = useCallback(
    (field: string, value: string) => {
      if (!details) return
      setDetails((prev) => (prev ? { ...prev, [field]: value } : prev))
      pendingChangesRef.current[field] = value || null
      setIsDirty(true)
    },
    [details]
  )

  const handleSelectChange = useCallback(
    (field: string, value: string) => {
      if (!details) return
      setDetails((prev) => (prev ? { ...prev, [field]: value } : prev))
      pendingChangesRef.current[field] = value
      setIsDirty(true)
    },
    [details]
  )

  const handleDateChange = useCallback(
    (field: string, date: Date | undefined) => {
      if (!details) return
      const value = date ? date.toISOString().split('T')[0] : null
      setDetails((prev) => (prev ? { ...prev, [field]: value } : prev))
      pendingChangesRef.current[field] = value
      setIsDirty(true)
    },
    [details]
  )

  // -- Explicit save: persists all pending changes at once --
  const handleSave = useCallback(async () => {
    if (!details || !isDirty) return
    const changes = { ...pendingChangesRef.current }
    if (Object.keys(changes).length === 0) return

    setIsSaving(true)
    const itemType = nodeType === 'goal' || nodeType === 'milestone' ? 'objective' : nodeType
    const result = await updateCanvasItem(itemType, nodeId, changes)

    if ('error' in result) {
      toast.error(`Failed to save: ${result.error}`)
    } else {
      pendingChangesRef.current = {}
      setIsDirty(false)
      toast.success('Changes saved')
      onUpdate()
    }
    setIsSaving(false)
  }, [details, isDirty, nodeType, nodeId, onUpdate])

  // -- Ghost actions --
  const handleAcceptGhost = useCallback(async () => {
    const itemType = nodeType === 'goal' || nodeType === 'milestone' ? 'objective' : nodeType
    if (itemType !== 'objective' && itemType !== 'task') return
    const result = await acceptGhost(itemType, nodeId)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Ghost item accepted')
      onUpdate()
      onOpenChange(false)
    }
  }, [nodeType, nodeId, onUpdate, onOpenChange])

  const handleRejectGhost = useCallback(async () => {
    const itemType = nodeType === 'goal' || nodeType === 'milestone' ? 'objective' : nodeType
    if (itemType !== 'objective' && itemType !== 'task') return
    const result = await rejectGhost(itemType, nodeId)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Ghost item rejected')
      onUpdate()
      onOpenChange(false)
    }
    setConfirmReject(false)
  }, [nodeType, nodeId, onUpdate, onOpenChange])

  // -- Delete goal --
  const handleDeleteGoal = useCallback(async () => {
    const result = await softDeleteGoal(nodeId)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Strategic goal deleted')
      onUpdate()
      onOpenChange(false)
    }
    setConfirmDelete(false)
  }, [nodeId, onUpdate, onOpenChange])

  // -- Create objective under a milestone --
  const handleCreateObjectiveUnderMilestone = useCallback(
    async (milestoneId: string, title: string) => {
      const result = await createCanvasObjective({
        title,
        milestone_id: milestoneId,
      })
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success(`Objective "${title}" created`)
        onUpdate()
      }
    },
    [onUpdate]
  )

  // -- Link objective to milestone --
  const handleLinkObjectiveToMilestone = useCallback(
    async (milestoneId: string) => {
      const result = await linkObjectiveToMilestone(nodeId, milestoneId)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Objective linked to milestone')
        onUpdate()
      }
    },
    [nodeId, onUpdate]
  )

  // -- Link task to objective --
  const handleLinkTaskToObjective = useCallback(
    async (objectiveId: string) => {
      const result = await linkTaskToObjective(nodeId, objectiveId)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Task linked to objective')
        onUpdate()
      }
    },
    [nodeId, onUpdate]
  )

  // -- Clean up on close --
  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) {
        setDetails(null)
        setObjectivesForLinking([])
        pendingChangesRef.current = {}
        setIsDirty(false)
      }
      onOpenChange(isOpen)
    },
    [onOpenChange]
  )

  // -- Dialog title --
  const dialogTitle =
    nodeType === 'goal'
      ? 'Strategic Goal'
      : nodeType === 'milestone'
        ? 'Milestone'
        : nodeType === 'objective'
          ? 'Objective'
          : 'Task'

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent size="md" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          {/* Loading skeleton */}
          {isLoading && (
            <div className="space-y-4 py-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {/* Content — varies by nodeType */}
          {!isLoading && details && (
            <div className="space-y-5 py-1">
              {/* ============================================================ */}
              {/* GOAL FIELDS                                                   */}
              {/* ============================================================ */}
              {nodeType === 'goal' && !isTaskDetails(details) && (
                <GoalFields
                  details={details}
                  onFieldChange={handleFieldChange}
                  onSelectChange={handleSelectChange}
                  onDateChange={handleDateChange}
                  onDelete={() => setConfirmDelete(true)}
                />
              )}

              {/* ============================================================ */}
              {/* MILESTONE FIELDS                                              */}
              {/* ============================================================ */}
              {nodeType === 'milestone' && !isTaskDetails(details) && (
                <MilestoneFields
                  details={details}
                  members={members}
                  onFieldChange={handleFieldChange}
                  onSelectChange={handleSelectChange}
                  onDateChange={handleDateChange}
                  onCreateObjective={handleCreateObjectiveUnderMilestone}
                />
              )}

              {/* ============================================================ */}
              {/* OBJECTIVE FIELDS                                              */}
              {/* ============================================================ */}
              {nodeType === 'objective' && !isTaskDetails(details) && (
                <ObjectiveFields
                  details={details}
                  members={members}
                  milestones={milestones}
                  isUnlinked={isUnlinked}
                  onFieldChange={handleFieldChange}
                  onSelectChange={handleSelectChange}
                  onDateChange={handleDateChange}
                  onLinkToMilestone={handleLinkObjectiveToMilestone}
                  onAcceptGhost={handleAcceptGhost}
                  onRejectGhost={() => setConfirmReject(true)}
                />
              )}

              {/* ============================================================ */}
              {/* TASK FIELDS                                                   */}
              {/* ============================================================ */}
              {nodeType === 'task' && isTaskDetails(details) && (
                <TaskFields
                  details={details}
                  members={members}
                  objectivesForLinking={objectivesForLinking}
                  isUnlinked={isUnlinked}
                  onFieldChange={handleFieldChange}
                  onSelectChange={handleSelectChange}
                  onDateChange={handleDateChange}
                  onLinkToObjective={handleLinkTaskToObjective}
                  onAcceptGhost={handleAcceptGhost}
                  onRejectGhost={() => setConfirmReject(true)}
                />
              )}
            </div>
          )}

          {/* Footer with explicit Save */}
          {!isLoading && details && (
            <DialogFooter>
              <div className="flex w-full items-center justify-between">
                <Button
                  variant="secondary"
                  onClick={() => handleOpenChange(false)}
                >
                  {isDirty ? 'Discard' : 'Close'}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!isDirty || isSaving}
                  className="gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm delete goal */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete strategic goal?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the goal, all its milestones, and all objectives
              under them. Tasks will be unlinked (not deleted).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGoal}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Goal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm reject ghost */}
      <AlertDialog open={confirmReject} onOpenChange={setConfirmReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject ghost item?</AlertDialogTitle>
            <AlertDialogDescription>
              {nodeType === 'objective'
                ? 'This will also remove ghost tasks under this objective.'
                : 'This ghost item will be removed from the canvas.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRejectGhost}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ============================================================================
// FIELD COMPONENTS (extracted per node type)
// ============================================================================

// ---------------------------------------------------------------------------
// GOAL FIELDS
// ---------------------------------------------------------------------------

interface GoalFieldsProps {
  details: CanvasObjectiveDetails
  onFieldChange: (field: string, value: string) => void
  onSelectChange: (field: string, value: string) => void
  onDateChange: (field: string, date: Date | undefined) => void
  onDelete: () => void
}

function GoalFields({
  details,
  onFieldChange,
  onSelectChange,
  onDateChange,
  onDelete,
}: GoalFieldsProps) {
  const isPastDate =
    details.milestone_date && new Date(details.milestone_date) < new Date()

  return (
    <>
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="goal-title">Title</Label>
        <Input
          id="goal-title"
          value={details.title ?? ''}
          onChange={(e) => onFieldChange('title', e.target.value)}
        />
      </div>

      {/* Target date */}
      <div className="space-y-2">
        <Label>Target date</Label>
        <DatePickerWithShortcuts
          date={details.milestone_date ? new Date(details.milestone_date) : undefined}
          onDateChange={(d) => onDateChange('milestone_date', d)}
        />
        {isPastDate && (
          <p className="flex items-center gap-1 text-xs text-status-warning">
            <AlertTriangle className="h-3 w-3" />
            Target date has passed
          </p>
        )}
      </div>

      {/* Goal type (read-only) */}
      {details.goal_type && (
        <div className="space-y-2">
          <Label>Goal type</Label>
          <div>
            <StatusBadge status="info" size="md">
              {details.goal_type}
            </StatusBadge>
          </div>
        </div>
      )}

      {/* Status */}
      <div className="space-y-2">
        <Label htmlFor="goal-status">Status</Label>
        <Select
          value={details.status ?? ''}
          onValueChange={(v) => onSelectChange('status', v)}
        >
          <SelectTrigger id="goal-status">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {GOAL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {details.status && GOAL_STATUS_DESCRIPTIONS[details.status as keyof typeof GOAL_STATUS_DESCRIPTIONS] && (
          <p className="text-xs text-muted-foreground">
            {GOAL_STATUS_DESCRIPTIONS[details.status as keyof typeof GOAL_STATUS_DESCRIPTIONS]}
          </p>
        )}
      </div>

      {/* Success criteria / description */}
      <div className="space-y-2">
        <Label htmlFor="goal-desc">Success criteria</Label>
        <Textarea
          id="goal-desc"
          rows={3}
          value={details.description ?? ''}
          onChange={(e) => onFieldChange('description', e.target.value)}
          placeholder="What does success look like?"
        />
      </div>

      <Separator />

      {/* Delete */}
      <Button variant="destructive" size="sm" onClick={onDelete} className="gap-1.5">
        <Trash2 className="h-4 w-4" />
        Delete Goal
      </Button>
    </>
  )
}

// ---------------------------------------------------------------------------
// MILESTONE FIELDS
// ---------------------------------------------------------------------------

interface MilestoneFieldsProps {
  details: CanvasObjectiveDetails
  members: FoundryMember[]
  onFieldChange: (field: string, value: string) => void
  onSelectChange: (field: string, value: string) => void
  onDateChange: (field: string, date: Date | undefined) => void
  onCreateObjective: (milestoneId: string, title: string) => Promise<void>
}

function MilestoneFields({
  details,
  members,
  onFieldChange,
  onSelectChange,
  onDateChange,
  onCreateObjective,
}: MilestoneFieldsProps) {
  const [newObjTitle, setNewObjTitle] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const handleCreateObjective = async (): Promise<void> => {
    const trimmed = newObjTitle.trim()
    if (!trimmed) return
    setIsCreating(true)
    try {
      await onCreateObjective(details.id, trimmed)
      setNewObjTitle('')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <>
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="ms-title">Title</Label>
        <Input
          id="ms-title"
          value={details.title ?? ''}
          onChange={(e) => onFieldChange('title', e.target.value)}
        />
      </div>

      {/* Due date */}
      <div className="space-y-2">
        <Label>Due date</Label>
        <DatePickerWithShortcuts
          date={details.milestone_date ? new Date(details.milestone_date) : undefined}
          onDateChange={(d) => onDateChange('milestone_date', d)}
        />
      </div>

      {/* Status */}
      <div className="space-y-2">
        <Label htmlFor="ms-status">Status</Label>
        <Select
          value={details.status ?? ''}
          onValueChange={(v) => onSelectChange('status', v)}
        >
          <SelectTrigger id="ms-status">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {MILESTONE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {details.status && MILESTONE_STATUS_DESCRIPTIONS[details.status as keyof typeof MILESTONE_STATUS_DESCRIPTIONS] && (
          <p className="text-xs text-muted-foreground">
            {MILESTONE_STATUS_DESCRIPTIONS[details.status as keyof typeof MILESTONE_STATUS_DESCRIPTIONS]}
          </p>
        )}
      </div>

      {/* Owner */}
      <div className="space-y-2">
        <Label htmlFor="ms-owner">Owner</Label>
        <Select
          value={details.creator_id ?? ''}
          onValueChange={(v) => onSelectChange('creator_id', v)}
        >
          <SelectTrigger id="ms-owner">
            <SelectValue placeholder="Select owner" />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.full_name ?? 'Unnamed'} — {m.role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Position on spine */}
      {details.milestone_order_index != null && (
        <p className="text-sm text-muted-foreground">
          Position #{details.milestone_order_index + 1} on spine
        </p>
      )}

      <Separator />

      {/* Quick-add objective under this milestone */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Target className="h-3.5 w-3.5 text-international-orange" />
          Add Objective
        </Label>
        <div className="flex gap-2">
          <Input
            value={newObjTitle}
            onChange={(e) => setNewObjTitle(e.target.value)}
            placeholder="New objective title..."
            maxLength={200}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleCreateObjective() }
            }}
          />
          <Button
            size="sm"
            onClick={handleCreateObjective}
            disabled={isCreating || !newObjTitle.trim()}
            className="shrink-0"
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Create an objective under this milestone
        </p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// OBJECTIVE FIELDS
// ---------------------------------------------------------------------------

interface ObjectiveFieldsProps {
  details: CanvasObjectiveDetails
  members: FoundryMember[]
  milestones: MilestoneOption[]
  isUnlinked: boolean
  onFieldChange: (field: string, value: string) => void
  onSelectChange: (field: string, value: string) => void
  onDateChange: (field: string, date: Date | undefined) => void
  onLinkToMilestone: (milestoneId: string) => Promise<void>
  onAcceptGhost: () => Promise<void>
  onRejectGhost: () => void
}

function ObjectiveFields({
  details,
  members,
  milestones,
  isUnlinked,
  onFieldChange,
  onSelectChange,
  onDateChange,
  onLinkToMilestone,
  onAcceptGhost,
  onRejectGhost,
}: ObjectiveFieldsProps) {
  const [isLinking, setIsLinking] = useState(false)

  const handleLink = async (milestoneId: string) => {
    setIsLinking(true)
    await onLinkToMilestone(milestoneId)
    setIsLinking(false)
  }

  return (
    <>
      {/* Unlinked banner + link selector */}
      {isUnlinked && (
        <div className="space-y-3">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              This objective is not linked to any strategic goal.
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="link-ms">Link to milestone</Label>
            {milestones.length > 0 ? (
              <Select
                onValueChange={handleLink}
                disabled={isLinking}
              >
                <SelectTrigger id="link-ms">
                  <SelectValue placeholder={isLinking ? 'Linking…' : 'Choose a milestone…'} />
                </SelectTrigger>
                <SelectContent>
                  {milestones.map((ms) => (
                    <SelectItem key={ms.id} value={ms.id}>
                      {ms.title} — {ms.goalTitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No milestones available. Create a strategic goal with milestones first.
              </p>
            )}
          </div>
          <Separator />
        </div>
      )}

      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="obj-title">Title</Label>
        <Input
          id="obj-title"
          value={details.title ?? ''}
          onChange={(e) => onFieldChange('title', e.target.value)}
        />
      </div>

      {/* Date */}
      <div className="space-y-2">
        <Label>Date</Label>
        <DatePickerWithShortcuts
          date={details.milestone_date ? new Date(details.milestone_date) : undefined}
          onDateChange={(d) => onDateChange('milestone_date', d)}
        />
      </div>

      {/* Status */}
      <div className="space-y-2">
        <Label htmlFor="obj-status">Status</Label>
        <Select
          value={details.status ?? ''}
          onValueChange={(v) => onSelectChange('status', v)}
        >
          <SelectTrigger id="obj-status">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {OBJECTIVE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {details.status && OBJECTIVE_STATUS_DESCRIPTIONS[details.status as keyof typeof OBJECTIVE_STATUS_DESCRIPTIONS] && (
          <p className="text-xs text-muted-foreground">
            {OBJECTIVE_STATUS_DESCRIPTIONS[details.status as keyof typeof OBJECTIVE_STATUS_DESCRIPTIONS]}
          </p>
        )}
      </div>

      {/* Owner */}
      <div className="space-y-2">
        <Label htmlFor="obj-owner">Owner</Label>
        <Select
          value={details.creator_id ?? ''}
          onValueChange={(v) => onSelectChange('creator_id', v)}
        >
          <SelectTrigger id="obj-owner">
            <SelectValue placeholder="Select owner" />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.full_name ?? 'Unnamed'} — {m.role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Workstream */}
      <div className="space-y-2">
        <Label htmlFor="obj-workstream">Workstream</Label>
        <Input
          id="obj-workstream"
          value={details.workstream ?? ''}
          onChange={(e) => onFieldChange('workstream', e.target.value)}
          placeholder="e.g. Engineering, Marketing"
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="obj-desc">Description</Label>
        <Textarea
          id="obj-desc"
          rows={3}
          value={details.description ?? ''}
          onChange={(e) => onFieldChange('description', e.target.value)}
        />
      </div>

      {/* Ghost section */}
      {details.is_ghost && (
        <GhostSection
          ghostSource={details.ghost_source}
          ghostRationale={details.ghost_rationale}
          onAccept={onAcceptGhost}
          onReject={onRejectGhost}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// TASK FIELDS
// ---------------------------------------------------------------------------

interface TaskFieldsProps {
  details: CanvasTaskDetails
  members: FoundryMember[]
  objectivesForLinking: Array<{ id: string; title: string }>
  isUnlinked: boolean
  onFieldChange: (field: string, value: string) => void
  onSelectChange: (field: string, value: string) => void
  onDateChange: (field: string, date: Date | undefined) => void
  onLinkToObjective: (objectiveId: string) => Promise<void>
  onAcceptGhost: () => Promise<void>
  onRejectGhost: () => void
}

function TaskFields({
  details,
  members,
  objectivesForLinking,
  isUnlinked,
  onFieldChange,
  onSelectChange,
  onDateChange,
  onLinkToObjective,
  onAcceptGhost,
  onRejectGhost,
}: TaskFieldsProps) {
  const [isLinking, setIsLinking] = useState(false)
  const hasNoObjective = !details.objective_id

  const handleLink = async (objectiveId: string) => {
    setIsLinking(true)
    await onLinkToObjective(objectiveId)
    setIsLinking(false)
  }

  return (
    <>
      {/* Unlinked banner + link selector (only if truly orphan) */}
      {isUnlinked && hasNoObjective && (
        <div className="space-y-3">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              This task is not linked to any objective.
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="link-obj">Link to objective</Label>
            {objectivesForLinking.length > 0 ? (
              <Select
                onValueChange={handleLink}
                disabled={isLinking}
              >
                <SelectTrigger id="link-obj">
                  <SelectValue placeholder={isLinking ? 'Linking…' : 'Choose an objective…'} />
                </SelectTrigger>
                <SelectContent>
                  {objectivesForLinking.map((obj) => (
                    <SelectItem key={obj.id} value={obj.id}>
                      {obj.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No objectives available to link to.
              </p>
            )}
          </div>
          <Separator />
        </div>
      )}

      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="task-title">Title</Label>
        <Input
          id="task-title"
          value={details.title ?? ''}
          onChange={(e) => onFieldChange('title', e.target.value)}
        />
      </div>

      {/* Start date */}
      <div className="space-y-2">
        <Label>Start date</Label>
        <DatePickerWithShortcuts
          date={details.start_date ? new Date(details.start_date) : undefined}
          onDateChange={(d) => onDateChange('start_date', d)}
        />
      </div>

      {/* Due date */}
      <div className="space-y-2">
        <Label>Due date</Label>
        <DatePickerWithShortcuts
          date={details.end_date ? new Date(details.end_date) : undefined}
          onDateChange={(d) => onDateChange('end_date', d)}
        />
      </div>

      {/* Status */}
      <div className="space-y-2">
        <Label htmlFor="task-status">Status</Label>
        <Select
          value={details.status ?? ''}
          onValueChange={(v) => onSelectChange('status', v)}
        >
          <SelectTrigger id="task-status">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {TASK_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {details.status && TASK_STATUS_DESCRIPTIONS[details.status as keyof typeof TASK_STATUS_DESCRIPTIONS] && (
          <p className="text-xs text-muted-foreground">
            {TASK_STATUS_DESCRIPTIONS[details.status as keyof typeof TASK_STATUS_DESCRIPTIONS]}
          </p>
        )}
      </div>

      {/* Assignee */}
      <div className="space-y-2">
        <Label htmlFor="task-assignee">Assignee</Label>
        <Select
          value={details.assignee_id ?? ''}
          onValueChange={(v) => onSelectChange('assignee_id', v)}
        >
          <SelectTrigger id="task-assignee">
            <SelectValue placeholder="Select assignee" />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.full_name ?? 'Unnamed'} — {m.role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Risk level */}
      <div className="space-y-2">
        <Label htmlFor="task-risk">Risk level</Label>
        <Select
          value={details.risk_level ?? ''}
          onValueChange={(v) => onSelectChange('risk_level', v)}
        >
          <SelectTrigger id="task-risk">
            <SelectValue placeholder="Select risk level" />
          </SelectTrigger>
          <SelectContent>
            {RISK_LEVELS.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="task-desc">Description</Label>
        <Textarea
          id="task-desc"
          rows={3}
          value={details.description ?? ''}
          onChange={(e) => onFieldChange('description', e.target.value)}
        />
      </div>

      {/* Ghost section */}
      {details.is_ghost && (
        <GhostSection
          ghostSource={details.ghost_source}
          ghostRationale={details.ghost_rationale}
          onAccept={onAcceptGhost}
          onReject={onRejectGhost}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// GHOST SECTION (shared between objective and task)
// ---------------------------------------------------------------------------

interface GhostSectionProps {
  ghostSource: string | null
  ghostRationale: string | null
  onAccept: () => Promise<void>
  onReject: () => void
}

function GhostSection({
  ghostSource,
  ghostRationale,
  onAccept,
  onReject,
}: GhostSectionProps) {
  const [isAccepting, setIsAccepting] = useState(false)

  const handleAccept = async () => {
    setIsAccepting(true)
    await onAccept()
    setIsAccepting(false)
  }

  return (
    <>
      <Separator />
      <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Ghost className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Ghost Item</span>
          {ghostSource && (
            <StatusBadge status="info" size="sm">
              {ghostSource}
            </StatusBadge>
          )}
        </div>
        {ghostRationale && (
          <p className="text-sm text-muted-foreground italic">
            {ghostRationale}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleAccept}
            disabled={isAccepting}
            className="gap-1.5"
          >
            {isAccepting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Accept
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onReject}
            className="gap-1.5"
          >
            <XCircle className="h-3.5 w-3.5" />
            Reject
          </Button>
        </div>
      </div>
    </>
  )
}
