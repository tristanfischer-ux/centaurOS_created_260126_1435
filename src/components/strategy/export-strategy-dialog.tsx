/**
 * @file export-strategy-dialog.tsx
 *
 * @description Dialog for exporting strategic goals, objectives, and tasks
 * as formatted plain text for pasting into emails. Shows a checkbox tree
 * so the user can select exactly which items to include.
 *
 * @component
 *
 * @example
 * <ExportStrategyDialog
 *   open={isExportOpen}
 *   onOpenChange={setIsExportOpen}
 *   bundles={initialBundles}
 *   pillars={pillars}
 * />
 */

'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Copy, FileText, Target, CheckSquare, Minus } from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { StatusBadge } from '@/components/ui/status-badge'
import type { GoalBundle, CanvasObjective, CanvasTask } from '@/types/canvas'
import type { StrategyPillar } from '@/app/(platform)/strategy/strategy-dashboard'

// ─── Types ────────────────────────────────────────────────────────

interface ExportStrategyDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to toggle open state */
  onOpenChange: (open: boolean) => void
  /** Full cascade data: goal -> milestones -> objectives -> tasks */
  bundles: GoalBundle[]
  /** Pillar summary data with progress and health */
  pillars: StrategyPillar[]
}

type CheckState = 'checked' | 'unchecked' | 'indeterminate'

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Resolves objectives for a goal bundle. Objectives are parented to
 * milestones via parent_objective_id, so we group them accordingly.
 *
 * @param bundle - The goal bundle containing milestones, objectives, and tasks
 * @returns Flat list of objectives with their associated tasks
 */
function getObjectivesWithTasks(bundle: GoalBundle): Array<{
  objective: CanvasObjective
  tasks: CanvasTask[]
}> {
  return bundle.objectives
    .filter((o) => !o.is_ghost)
    .map((objective) => ({
      objective,
      tasks: bundle.tasks.filter(
        (t) => t.objective_id === objective.id && !t.is_ghost
      ),
    }))
}

/**
 * Collects all selectable IDs from a bundle array.
 *
 * @param bundles - Array of goal bundles
 * @returns Set of all goal, objective, and task IDs
 */
function getAllIds(bundles: GoalBundle[]): Set<string> {
  const ids = new Set<string>()
  for (const bundle of bundles) {
    ids.add(bundle.goal.id)
    for (const { objective, tasks } of getObjectivesWithTasks(bundle)) {
      ids.add(objective.id)
      for (const task of tasks) {
        ids.add(task.id)
      }
    }
  }
  return ids
}

/**
 * Maps task status values to display labels.
 *
 * @param status - Raw task status from database
 * @returns Human-readable status label
 */
function formatTaskStatus(status: string | null): string {
  if (!status) return 'Pending'
  switch (status) {
    case 'Accepted':
    case 'Completed':
      return 'Completed'
    case 'Pending':
      return 'Pending'
    case 'Rejected':
      return 'Rejected'
    default:
      return status
  }
}

/**
 * Formats a date string as "Feb 17" or "Feb 17, 2026" style.
 *
 * @param dateStr - ISO date string
 * @param includeYear - Whether to include the year
 * @returns Formatted date string
 */
function formatDate(dateStr: string | null, includeYear = false): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear && { year: 'numeric' }),
  })
}

/**
 * Maps health status to a label for plain text output.
 *
 * @param health - Health status string
 * @returns Human-readable health label
 */
function healthLabel(health: string): string {
  switch (health) {
    case 'on-track':
      return 'On Track'
    case 'at-risk':
      return 'At Risk'
    case 'off-track':
      return 'Off Track'
    case 'completed':
      return 'Completed'
    case 'not-started':
      return 'Not Started'
    default:
      return health
  }
}

/**
 * Maps health status to StatusBadge status prop.
 *
 * @param health - Health status string
 * @returns StatusBadge-compatible status value
 */
function healthToStatus(health: string): 'success' | 'warning' | 'error' | 'pending' {
  switch (health) {
    case 'on-track':
    case 'completed':
      return 'success'
    case 'at-risk':
      return 'warning'
    case 'off-track':
      return 'error'
    default:
      return 'pending'
  }
}

// ─── Formatting Functions ─────────────────────────────────────────

/**
 * Formats selected items as a high-level summary for stakeholder emails.
 *
 * @param bundles - Goal bundles to format
 * @param pillars - Pillar data with progress/health
 * @param selected - Set of selected item IDs
 * @returns Plain text summary string
 */
function formatSummary(
  bundles: GoalBundle[],
  pillars: StrategyPillar[],
  selected: Set<string>
): string {
  const today = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const lines: string[] = [`STRATEGY UPDATE — ${today}`, '']

  const selectedBundles = bundles.filter((b) => selected.has(b.goal.id))
  if (selectedBundles.length === 0) return lines.join('\n')

  lines.push('STRATEGIC PILLARS', '')

  const needsAttention: string[] = []

  selectedBundles.forEach((bundle, index) => {
    const pillar = pillars.find((p) => p.id === bundle.goal.id)
    const progress = pillar?.progress ?? 0
    const health = pillar?.health ?? 'not-started'

    // Count selected objectives and tasks
    const objsWithTasks = getObjectivesWithTasks(bundle)
    const selectedObjs = objsWithTasks.filter((o) => selected.has(o.objective.id))
    const selectedTaskCount = selectedObjs.reduce(
      (sum, o) => sum + o.tasks.filter((t) => selected.has(t.id)).length,
      0
    )
    const completedTaskCount = selectedObjs.reduce(
      (sum, o) =>
        sum +
        o.tasks.filter(
          (t) =>
            selected.has(t.id) &&
            (t.status === 'Completed' || t.status === 'Accepted')
        ).length,
      0
    )

    const line = `${index + 1}. ${bundle.goal.title} — ${progress}% complete (${healthLabel(health)})`
    lines.push(line)

    const stats: string[] = []
    stats.push(`${selectedObjs.length} objective${selectedObjs.length !== 1 ? 's' : ''}`)
    stats.push(`${completedTaskCount}/${selectedTaskCount} tasks complete`)
    if (pillar?.overdueTasks && pillar.overdueTasks > 0) {
      stats.push(`${pillar.overdueTasks} overdue`)
    }
    lines.push(`   ${stats.join(' · ')}`)
    lines.push('')

    // Track items needing attention
    if (health === 'at-risk' && pillar?.overdueTasks) {
      needsAttention.push(
        `${bundle.goal.title} is at risk with ${pillar.overdueTasks} overdue task${pillar.overdueTasks !== 1 ? 's' : ''}`
      )
    } else if (health === 'off-track') {
      needsAttention.push(`${bundle.goal.title} is off track`)
    }
  })

  if (needsAttention.length > 0) {
    lines.push('NEEDS ATTENTION')
    needsAttention.forEach((item) => lines.push(`- ${item}`))
  }

  return lines.join('\n')
}

/**
 * Formats selected items as a detailed breakdown with individual tasks.
 *
 * @param bundles - Goal bundles to format
 * @param pillars - Pillar data with progress/health
 * @param selected - Set of selected item IDs
 * @returns Plain text detailed breakdown string
 */
function formatDetailed(
  bundles: GoalBundle[],
  pillars: StrategyPillar[],
  selected: Set<string>
): string {
  const today = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const lines: string[] = [`STRATEGY UPDATE — ${today}`, '']

  const selectedBundles = bundles.filter((b) => selected.has(b.goal.id))
  if (selectedBundles.length === 0) return lines.join('\n')

  selectedBundles.forEach((bundle, index) => {
    const pillar = pillars.find((p) => p.id === bundle.goal.id)
    const progress = pillar?.progress ?? 0
    const health = pillar?.health ?? 'not-started'

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', '')
    lines.push(
      `${index + 1}. ${bundle.goal.title.toUpperCase()} — ${progress}% (${healthLabel(health)})`
    )

    const objsWithTasks = getObjectivesWithTasks(bundle)
    const selectedObjs = objsWithTasks.filter((o) => selected.has(o.objective.id))

    if (selectedObjs.length > 0) {
      lines.push('')
      lines.push('   Objectives:')

      selectedObjs.forEach(({ objective, tasks }) => {
        const objProgress = objective.progress ?? 0
        lines.push(`   - ${objective.title} — ${objProgress}% complete`)

        const selectedTasks = tasks.filter((t) => selected.has(t.id))
        if (selectedTasks.length > 0) {
          lines.push('     Tasks:')
          selectedTasks.forEach((task) => {
            const isComplete =
              task.status === 'Completed' || task.status === 'Accepted'
            const marker = isComplete ? '✓' : '○'
            const status = formatTaskStatus(task.status)
            const dueStr =
              !isComplete && task.end_date
                ? ` — due ${formatDate(task.end_date)}`
                : ''
            lines.push(`     ${marker} ${task.title} (${status})${dueStr}`)
          })
        }
        lines.push('')
      })
    } else {
      lines.push('')
    }
  })

  return lines.join('\n')
}

// ─── Indeterminate Checkbox ───────────────────────────────────────

/**
 * A checkbox that supports the indeterminate visual state via a ref.
 * Used for parent nodes where some but not all children are selected.
 */
function IndeterminateCheckbox({
  state,
  onChange,
  label,
  className,
}: {
  state: CheckState
  onChange: () => void
  label: string
  className?: string
}): React.ReactElement {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = state === 'indeterminate'
    }
  }, [state])

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        ref={ref}
        type="checkbox"
        checked={state === 'checked'}
        onChange={onChange}
        aria-label={label}
        className="h-4 w-4 rounded border-input accent-international-orange cursor-pointer"
      />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────

export function ExportStrategyDialog({
  open,
  onOpenChange,
  bundles,
  pillars,
}: ExportStrategyDialogProps): React.ReactElement {
  // All IDs for select-all logic
  const allIds = useMemo(() => getAllIds(bundles), [bundles])

  // Selected item IDs — start with everything selected
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allIds))

  // Reset selection when dialog opens
  useEffect(() => {
    if (open) {
      setSelected(new Set(allIds))
    }
  }, [open, allIds])

  // ── Selection helpers ──

  const toggleId = useCallback(
    (id: string): void => {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      })
    },
    []
  )

  const toggleGoal = useCallback(
    (bundle: GoalBundle): void => {
      setSelected((prev) => {
        const next = new Set(prev)
        const goalSelected = prev.has(bundle.goal.id)
        const objsWithTasks = getObjectivesWithTasks(bundle)

        if (goalSelected) {
          // Deselect goal and all children
          next.delete(bundle.goal.id)
          objsWithTasks.forEach(({ objective, tasks }) => {
            next.delete(objective.id)
            tasks.forEach((t) => next.delete(t.id))
          })
        } else {
          // Select goal and all children
          next.add(bundle.goal.id)
          objsWithTasks.forEach(({ objective, tasks }) => {
            next.add(objective.id)
            tasks.forEach((t) => next.add(t.id))
          })
        }
        return next
      })
    },
    []
  )

  const toggleObjective = useCallback(
    (objective: CanvasObjective, tasks: CanvasTask[]): void => {
      setSelected((prev) => {
        const next = new Set(prev)
        const objSelected = prev.has(objective.id)

        if (objSelected) {
          next.delete(objective.id)
          tasks.forEach((t) => next.delete(t.id))
        } else {
          next.add(objective.id)
          tasks.forEach((t) => next.add(t.id))
        }
        return next
      })
    },
    []
  )

  const toggleAll = useCallback((): void => {
    setSelected((prev) => {
      if (prev.size === allIds.size) {
        return new Set<string>()
      }
      return new Set(allIds)
    })
  }, [allIds])

  // ── Check state computation ──

  const getGoalState = useCallback(
    (bundle: GoalBundle): CheckState => {
      if (!selected.has(bundle.goal.id)) return 'unchecked'
      const objsWithTasks = getObjectivesWithTasks(bundle)
      const allChildIds: string[] = []
      objsWithTasks.forEach(({ objective, tasks }) => {
        allChildIds.push(objective.id)
        tasks.forEach((t) => allChildIds.push(t.id))
      })
      if (allChildIds.length === 0) return 'checked'
      const selectedCount = allChildIds.filter((id) => selected.has(id)).length
      if (selectedCount === allChildIds.length) return 'checked'
      if (selectedCount === 0) return 'unchecked'
      return 'indeterminate'
    },
    [selected]
  )

  const getObjectiveState = useCallback(
    (objectiveId: string, tasks: CanvasTask[]): CheckState => {
      if (!selected.has(objectiveId)) return 'unchecked'
      if (tasks.length === 0) return 'checked'
      const selectedCount = tasks.filter((t) => selected.has(t.id)).length
      if (selectedCount === tasks.length) return 'checked'
      if (selectedCount === 0) return 'unchecked'
      return 'indeterminate'
    },
    [selected]
  )

  const selectAllState: CheckState = useMemo(() => {
    if (selected.size === 0) return 'unchecked'
    if (selected.size === allIds.size) return 'checked'
    return 'indeterminate'
  }, [selected, allIds])

  // ── Copy handlers ──

  const handleCopySummary = useCallback((): void => {
    const text = formatSummary(bundles, pillars, selected)
    navigator.clipboard.writeText(text).then(
      () => {
        toast.success('Summary copied to clipboard')
        onOpenChange(false)
      },
      () => {
        toast.error('Failed to copy to clipboard')
      }
    )
  }, [bundles, pillars, selected, onOpenChange])

  const handleCopyDetailed = useCallback((): void => {
    const text = formatDetailed(bundles, pillars, selected)
    navigator.clipboard.writeText(text).then(
      () => {
        toast.success('Detailed report copied to clipboard')
        onOpenChange(false)
      },
      () => {
        toast.error('Failed to copy to clipboard')
      }
    )
  }, [bundles, pillars, selected, onOpenChange])

  // Count selected items for footer
  const selectedCount = selected.size
  const hasSelection = selectedCount > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-international-orange" />
            Copy for Email
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Select all toggle */}
          <div className="flex items-center justify-between px-1">
            <button
              type="button"
              onClick={toggleAll}
              className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-international-orange transition-colors"
            >
              <IndeterminateCheckbox
                state={selectAllState}
                onChange={toggleAll}
                label="Select all items"
              />
              <span>Select All</span>
            </button>
            <span className="text-xs text-muted-foreground">
              {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
            </span>
          </div>

          {/* Checkbox tree */}
          <ScrollArea className="max-h-[55vh]">
            <div className="space-y-1 pr-4">
              {bundles.map((bundle) => {
                const pillar = pillars.find((p) => p.id === bundle.goal.id)
                const goalState = getGoalState(bundle)
                const objsWithTasks = getObjectivesWithTasks(bundle)

                return (
                  <div key={bundle.goal.id} className="space-y-0.5">
                    {/* Goal row */}
                    <button
                      type="button"
                      onClick={() => toggleGoal(bundle)}
                      className={cn(
                        'flex items-center gap-2.5 w-full rounded-lg px-2 py-2 text-left transition-colors',
                        'hover:bg-muted/50'
                      )}
                    >
                      <IndeterminateCheckbox
                        state={goalState}
                        onChange={() => toggleGoal(bundle)}
                        label={`Select ${bundle.goal.title}`}
                      />
                      <Target className="h-4 w-4 text-international-orange shrink-0" />
                      <span className="text-sm font-semibold text-foreground truncate flex-1">
                        {bundle.goal.title}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {pillar?.progress ?? 0}%
                        </span>
                        {pillar && (
                          <StatusBadge
                            status={healthToStatus(pillar.health)}
                            size="sm"
                          >
                            {healthLabel(pillar.health)}
                          </StatusBadge>
                        )}
                      </div>
                    </button>

                    {/* Objectives under this goal */}
                    {objsWithTasks.map(({ objective, tasks }) => {
                      const objState = getObjectiveState(objective.id, tasks)

                      return (
                        <div key={objective.id}>
                          {/* Objective row */}
                          <button
                            type="button"
                            onClick={() => toggleObjective(objective, tasks)}
                            className={cn(
                              'flex items-center gap-2.5 w-full rounded-lg pl-8 pr-2 py-1.5 text-left transition-colors',
                              'hover:bg-muted/50'
                            )}
                          >
                            <IndeterminateCheckbox
                              state={objState}
                              onChange={() =>
                                toggleObjective(objective, tasks)
                              }
                              label={`Select ${objective.title}`}
                            />
                            <span className="text-sm font-medium text-foreground truncate flex-1">
                              {objective.title}
                            </span>
                            <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                              {objective.progress ?? 0}%
                            </span>
                          </button>

                          {/* Tasks under this objective */}
                          {tasks.map((task) => {
                            const isComplete =
                              task.status === 'Completed' ||
                              task.status === 'Accepted'
                            const isSelected = selected.has(task.id)

                            return (
                              <button
                                key={task.id}
                                type="button"
                                onClick={() => toggleId(task.id)}
                                className={cn(
                                  'flex items-center gap-2.5 w-full rounded-lg pl-14 pr-2 py-1 text-left transition-colors',
                                  'hover:bg-muted/50'
                                )}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleId(task.id)}
                                  aria-label={`Select ${task.title}`}
                                  className="h-3.5 w-3.5 rounded border-input accent-international-orange cursor-pointer"
                                />
                                <span
                                  className={cn(
                                    'text-xs truncate flex-1',
                                    isComplete
                                      ? 'text-muted-foreground line-through'
                                      : 'text-foreground'
                                  )}
                                >
                                  {task.title}
                                </span>
                                <span
                                  className={cn(
                                    'text-[10px] shrink-0',
                                    isComplete
                                      ? 'text-status-success'
                                      : 'text-muted-foreground'
                                  )}
                                >
                                  {formatTaskStatus(task.status)}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })}

              {bundles.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Target className="h-8 w-8 text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No strategic goals to export yet.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Create a strategic goal first, then come back to share it.
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <div className="flex w-full items-center justify-between">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleCopyDetailed}
                disabled={!hasSelection}
                className="gap-1.5"
              >
                <FileText className="h-4 w-4" />
                Copy Detailed
              </Button>
              <Button
                onClick={handleCopySummary}
                disabled={!hasSelection}
                className="gap-1.5"
              >
                <Copy className="h-4 w-4" />
                Copy Summary
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
