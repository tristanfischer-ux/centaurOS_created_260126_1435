'use client'

import { useState, useRef, useCallback, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Plus, Check, X, Pencil, Trash2, Loader2, Flag,
} from 'lucide-react'
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
import {
  createStrategicObjective,
  updateStrategicObjective,
  deleteStrategicObjective,
} from '@/actions/objectives'
import { toast } from 'sonner'
import type { StrategicObjective } from './types'

interface StrategicObjectivesManagerProps {
  /** The strategic objectives to display */
  strategicObjectives: StrategicObjective[]
  /** All regular objectives — only parent_objective_id is read for counting linked items */
  objectives: { parent_objective_id: string | null }[]
  /** Currently active filter (strategic objective ID) */
  activeFilter: string | null
  /** Callback when a strategic objective is clicked for filtering */
  onFilterChange: (strategicObjectiveId: string | null) => void
}

/**
 * StrategicObjectivesManager - Inline CRUD for strategic objective pillars.
 *
 * @description Renders strategic objectives as editable chips at the top
 * of the Strategy page. Users can create, rename, and delete them inline.
 * Clicking a chip filters the objectives list to show only linked objectives.
 *
 * @component
 */
export function StrategicObjectivesManager({
  strategicObjectives,
  objectives,
  activeFilter,
  onFilterChange,
}: StrategicObjectivesManagerProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<StrategicObjective | null>(null)
  const [isPending, startTransition] = useTransition()
  const addInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  /** Count how many regular objectives are linked to a strategic objective */
  const getLinkedCount = useCallback(
    (strategicId: string): number =>
      objectives.filter(o => o.parent_objective_id === strategicId).length,
    [objectives]
  )

  // ─── Create ─────────────────────────────────────────────────────────
  const handleCreate = useCallback(() => {
    const trimmed = newTitle.trim()
    if (!trimmed) return

    startTransition(async () => {
      const result = await createStrategicObjective(trimmed)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Strategic objective created')
        setNewTitle('')
        setIsAdding(false)
      }
    })
  }, [newTitle])

  const handleAddKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleCreate()
      }
      if (e.key === 'Escape') {
        setIsAdding(false)
        setNewTitle('')
      }
    },
    [handleCreate]
  )

  // ─── Edit ───────────────────────────────────────────────────────────
  const startEditing = useCallback((obj: StrategicObjective) => {
    setEditingId(obj.id)
    setEditTitle(obj.title)
    // Focus the input after render
    requestAnimationFrame(() => editInputRef.current?.focus())
  }, [])

  const handleSaveEdit = useCallback(() => {
    if (!editingId) return
    const trimmed = editTitle.trim()
    if (!trimmed) {
      setEditingId(null)
      return
    }

    startTransition(async () => {
      const result = await updateStrategicObjective(editingId, trimmed)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Updated')
      }
      setEditingId(null)
    })
  }, [editingId, editTitle])

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSaveEdit()
      }
      if (e.key === 'Escape') {
        setEditingId(null)
      }
    },
    [handleSaveEdit]
  )

  // ─── Delete ─────────────────────────────────────────────────────────
  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return

    startTransition(async () => {
      const result = await deleteStrategicObjective(deleteTarget.id)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Strategic objective deleted')
        // Clear filter if we deleted the active one
        if (activeFilter === deleteTarget.id) {
          onFilterChange(null)
        }
      }
      setDeleteTarget(null)
    })
  }, [deleteTarget, activeFilter, onFilterChange])

  return (
    <>
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Strategic Objective?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete &ldquo;{deleteTarget?.title}&rdquo; and unlink any objectives
              currently associated with it. The linked objectives themselves will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 focus:ring-destructive"
              onClick={handleConfirmDelete}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Strategic Objectives Row */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Flag className="h-4 w-4 text-international-orange" />
          <span className="font-semibold text-foreground">Strategic Objectives</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Existing strategic objectives */}
          {strategicObjectives.map((obj) => {
            const isEditing = editingId === obj.id
            const isActive = activeFilter === obj.id
            const linkedCount = getLinkedCount(obj.id)

            if (isEditing) {
              return (
                <div
                  key={obj.id}
                  className="flex items-center gap-1 rounded-lg border border-international-orange bg-background px-2 py-1"
                >
                  <Input
                    ref={editInputRef}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    onBlur={handleSaveEdit}
                    className="h-7 w-48 text-sm border-0 bg-transparent p-0 focus-visible:ring-0"
                    disabled={isPending}
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleSaveEdit}
                    disabled={isPending}
                    aria-label="Save"
                  >
                    {isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3 text-status-success" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setEditingId(null)}
                    disabled={isPending}
                    aria-label="Cancel"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )
            }

            return (
              <div
                key={obj.id}
                className={cn(
                  'group flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all cursor-pointer',
                  isActive
                    ? 'border-international-orange bg-international-orange/5 text-international-orange shadow-sm'
                    : 'border-slate-200 bg-background text-foreground hover:border-international-orange/40 hover:shadow-sm'
                )}
                onClick={() => onFilterChange(isActive ? null : obj.id)}
              >
                {/* Color dot */}
                <span
                  className={cn(
                    'h-2 w-2 rounded-full flex-shrink-0',
                    isActive ? 'bg-international-orange' : 'bg-muted-foreground/30'
                  )}
                />

                {/* Title */}
                <span className="truncate max-w-[200px]">{obj.title}</span>

                {/* Linked count badge */}
                {linkedCount > 0 && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
                    {linkedCount}
                  </span>
                )}

                {/* Edit / Delete actions (show on hover) */}
                <div className="hidden group-hover:flex items-center gap-0.5 ml-0.5">
                  <button
                    className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      startEditing(obj)
                    }}
                    aria-label={`Edit ${obj.title}`}
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <button
                    className="h-5 w-5 flex items-center justify-center rounded hover:bg-status-error-light transition-colors"
                    onClick={(e) => {
                      e.stopPropagation()
                      setDeleteTarget(obj)
                    }}
                    aria-label={`Delete ${obj.title}`}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
            )
          })}

          {/* Add new input */}
          {isAdding ? (
            <div className="flex items-center gap-1 rounded-lg border border-dashed border-international-orange/40 bg-background px-2 py-1">
              <Input
                ref={addInputRef}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={handleAddKeyDown}
                placeholder="e.g. Grow Revenue"
                className="h-7 w-48 text-sm border-0 bg-transparent p-0 focus-visible:ring-0"
                disabled={isPending}
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleCreate}
                disabled={isPending || !newTitle.trim()}
                aria-label="Add strategic objective"
              >
                {isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3 text-status-success" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => { setIsAdding(false); setNewTitle('') }}
                disabled={isPending}
                aria-label="Cancel"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground border border-dashed border-slate-200 hover:border-international-orange/40 hover:text-foreground rounded-lg"
              onClick={() => {
                setIsAdding(true)
                requestAnimationFrame(() => addInputRef.current?.focus())
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Strategic Objective
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
