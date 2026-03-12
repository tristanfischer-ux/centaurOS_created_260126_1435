'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Gantt, Task as GanttTask, ViewMode } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'
import { cn } from '@/lib/utils'
import { ViewToggle } from '@/components/ui/view-toggle'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft, ChevronRight, CalendarDays, GanttChartSquare,
  ChevronDown, ChevronRight as ChevronRightIcon, Plus, GripVertical,
  ArrowRightLeft,
} from 'lucide-react'
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns'
import { Flag } from 'lucide-react'
import { toast } from 'sonner'
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragStartEvent, DragEndEvent } from '@dnd-kit/core'
import { updateObjectiveDates, moveTaskToObjective } from '@/actions/objectives'
import { updateTaskDates } from '@/actions/tasks'
import type { ObjectiveWithTasks, StrategicObjective } from './types'

// ─── Unified semantic color system ──────────────────────────────────
const SEMANTIC_COLORS = {
  positive: 'hsl(var(--status-success))',
  active:   'hsl(var(--status-info))',
  review:   'hsl(var(--chart-5))',
  warning:  'hsl(var(--status-warning))',
  critical: 'hsl(var(--status-error))',
  inactive: 'hsl(var(--muted-foreground))',
} as const

/** Map objective health to a semantic color */
function getObjectiveColor(health: string): string {
  switch (health) {
    case 'on-track':    return SEMANTIC_COLORS.positive
    case 'completed':   return SEMANTIC_COLORS.positive
    case 'at-risk':     return SEMANTIC_COLORS.warning
    case 'off-track':   return SEMANTIC_COLORS.critical
    case 'not-started':
    default:            return SEMANTIC_COLORS.inactive
  }
}

/** Map task status (+overdue) to a semantic color */
function getTaskColor(status: string, endDate: string | null): string {
  const now = new Date()
  if (endDate && status !== 'Completed' && status !== 'Rejected') {
    const end = new Date(endDate)
    if (end < now) return SEMANTIC_COLORS.critical
    const threeDays = new Date(now.getTime() + 3 * 86400000)
    if (end <= threeDays) return SEMANTIC_COLORS.warning
  }
  switch (status) {
    case 'Completed':                     return SEMANTIC_COLORS.positive
    case 'Accepted':                      return SEMANTIC_COLORS.active
    case 'Pending_Peer_Review':
    case 'Pending_Executive_Approval':
    case 'Amended_Pending_Approval':      return SEMANTIC_COLORS.review
    case 'Rejected':                      return SEMANTIC_COLORS.critical
    case 'Pending':
    default:                              return SEMANTIC_COLORS.inactive
  }
}

// ─── Extended GanttTask ─────────────────────────────────────────────
interface ExtendedGanttTask extends GanttTask {
  objectiveHealth?: string
  taskCount?: number
  completedCount?: number
  isObjective?: boolean
  isStrategy?: boolean
  progressPct?: number
  barColor?: string
  /** The objective this task belongs to (for task rows only) */
  parentObjectiveId?: string
}

// ─── Draggable Task Row ─────────────────────────────────────────────
/**
 * A task row in the list panel that can be dragged to another objective.
 * Uses dnd-kit's useDraggable hook.
 */
function DraggableTaskRow({
  task,
  rowHeight,
  onSelectTask,
}: {
  task: ExtendedGanttTask
  rowHeight: number
  onSelectTask?: (taskId: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: { type: 'task', taskId: task.id, taskName: task.name, sourceObjectiveId: task.parentObjectiveId },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center text-sm cursor-pointer transition-colors border-b border-border/50 hover:bg-muted/30',
        isDragging && 'opacity-40'
      )}
      style={{ height: rowHeight }}
      onClick={() => onSelectTask?.(task.id)}
    >
      {/* Drag handle */}
      <div
        className="flex-shrink-0 px-1 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
        {...listeners}
        {...attributes}
      >
        <GripVertical className="h-3 w-3" />
      </div>

      {/* Indent + color dot */}
      <div className="flex-1 px-2 min-w-[180px] flex items-center gap-1.5 overflow-hidden">
        {task.barColor && (
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: task.barColor }}
          />
        )}
        <span className="truncate text-muted-foreground text-[12px]">{task.name}</span>
      </div>

      {/* Progress bar */}
      <div className="w-16 px-2 flex items-center justify-center">
        <div className="w-full max-w-[48px] h-1.5 bg-muted/50 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${task.progressPct}%`,
              backgroundColor: task.barColor || SEMANTIC_COLORS.inactive,
            }}
          />
        </div>
      </div>

      {/* Dates */}
      <div className="w-[68px] px-2 text-center text-muted-foreground text-[11px] tabular-nums">
        {format(task.start, 'd MMM')}
      </div>
      <div className="w-[68px] px-2 text-center text-muted-foreground text-[11px] tabular-nums">
        {format(task.end, 'd MMM')}
      </div>
    </div>
  )
}

// ─── Droppable Objective Row ────────────────────────────────────────
/**
 * An objective row that acts as a drop target for tasks being dragged
 * from other objectives. Uses dnd-kit's useDroppable hook.
 */
function DroppableObjectiveRow({
  task,
  rowHeight,
  isCollapsed,
  onSelectObjective,
  onToggleCollapse,
}: {
  task: ExtendedGanttTask
  rowHeight: number
  isCollapsed: boolean
  onSelectObjective: (id: string) => void
  onToggleCollapse: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `objective-${task.id}`,
    data: { type: 'objective', objectiveId: task.id },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex items-center text-sm cursor-pointer transition-colors border-b border-border/50',
        'bg-muted/20 hover:bg-muted/40 font-medium',
        isOver && 'ring-2 ring-international-orange/50 bg-international-orange/5'
      )}
      style={{ height: rowHeight }}
      onClick={() => onSelectObjective(task.id)}
    >
      {/* Name */}
      <div className="flex-1 px-4 min-w-[200px] flex items-center gap-1.5 overflow-hidden">
        <button
          className="flex-shrink-0 p-0.5 rounded hover:bg-muted/60 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            onToggleCollapse(task.id)
          }}
          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {isCollapsed
            ? <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </button>

        {task.barColor && (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: task.barColor }}
          />
        )}

        <span className="truncate text-foreground text-[13px]">{task.name}</span>

        {task.taskCount !== undefined && (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
            {task.completedCount}/{task.taskCount}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-16 px-2 flex items-center justify-center">
        <div className="w-full max-w-[48px] h-1.5 bg-muted/50 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${task.progressPct ?? task.progress}%`,
              backgroundColor: task.barColor || SEMANTIC_COLORS.inactive,
            }}
          />
        </div>
      </div>

      {/* Dates */}
      <div className="w-[68px] px-2 text-center text-muted-foreground text-[11px] tabular-nums">
        {format(task.start, 'd MMM')}
      </div>
      <div className="w-[68px] px-2 text-center text-muted-foreground text-[11px] tabular-nums">
        {format(task.end, 'd MMM')}
      </div>
    </div>
  )
}

// ─── Custom Header ──────────────────────────────────────────────────
function ObjListHeader({ headerHeight }: { headerHeight: number }) {
  return (
    <div
      className="flex items-center border-b text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
      style={{ height: headerHeight }}
    >
      <div className="flex-1 px-4 min-w-[200px]">Objective / Task</div>
      <div className="w-16 px-2 text-center">Progress</div>
      <div className="w-[68px] px-2 text-center">From</div>
      <div className="w-[68px] px-2 text-center">To</div>
    </div>
  )
}

// ─── Custom Row (with dnd-kit integration) ──────────────────────────
function ObjListTable({
  rowHeight,
  sortedTasks,
  onSelectObjective,
  onSelectTask,
  collapsedObjectives,
  onToggleCollapse,
}: {
  tasks: ExtendedGanttTask[]
  rowHeight: number
  onExpanderClick: (task: GanttTask) => void
  sortedTasks: ExtendedGanttTask[]
  onSelectObjective: (id: string) => void
  onSelectTask?: (taskId: string) => void
  collapsedObjectives: Set<string>
  onToggleCollapse: (id: string) => void
}) {
  return (
    <div>
      {sortedTasks.map(task => {
        const isObj = task.isObjective
        const isStrat = (task as ExtendedGanttTask).isStrategy
        const isCollapsed = isObj ? collapsedObjectives.has(task.id) : isStrat ? collapsedObjectives.has(task.id) : false

        // Strategy group header row
        if (isStrat) {
          return (
            <div
              key={task.id}
              className="flex items-center text-sm cursor-pointer transition-colors border-b bg-international-orange/5 hover:bg-international-orange/10 font-semibold"
              style={{ height: rowHeight }}
              onClick={(e) => {
                e.stopPropagation()
                onToggleCollapse(task.id)
              }}
            >
              <div className="flex-1 px-4 min-w-[200px] flex items-center gap-1.5 overflow-hidden">
                <button
                  className="flex-shrink-0 p-0.5 rounded hover:bg-muted/60 transition-colors"
                  aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                >
                  {isCollapsed
                    ? <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  }
                </button>
                <Flag className="h-3.5 w-3.5 text-international-orange flex-shrink-0" />
                <span className="truncate text-foreground text-[13px]">{task.name}</span>
                {task.taskCount !== undefined && (
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
                    {task.taskCount}
                  </span>
                )}
              </div>
              <div className="w-16 px-2" />
              <div className="w-[68px] px-2" />
              <div className="w-[68px] px-2" />
            </div>
          )
        }

        // Objective row — droppable target for tasks
        if (isObj) {
          return (
            <DroppableObjectiveRow
              key={task.id}
              task={task}
              rowHeight={rowHeight}
              isCollapsed={isCollapsed}
              onSelectObjective={onSelectObjective}
              onToggleCollapse={onToggleCollapse}
            />
          )
        }

        // Task row — draggable between objectives
        return (
          <DraggableTaskRow
            key={task.id}
            task={task}
            rowHeight={rowHeight}
            onSelectTask={onSelectTask}
          />
        )
      })}
    </div>
  )
}

// ─── Custom Tooltip ─────────────────────────────────────────────────
const ObjTooltip = ({ task }: { task: GanttTask; fontSize: string; fontFamily: string }) => {
  const ext = task as ExtendedGanttTask
  const diffDays = Math.ceil(Math.abs(task.end.getTime() - task.start.getTime()) / (1000 * 60 * 60 * 24))
  const progress = ext.progressPct ?? task.progress

  return (
    <div className="bg-background px-4 py-3 shadow-lg rounded-xl text-xs font-sans whitespace-nowrap pointer-events-none z-50 text-foreground border" style={{ transform: 'translateY(-130%)' }}>
      <div className="font-bold mb-1 text-[13px]">
        {ext.isObjective ? '🎯 ' : ''}{task.name}
      </div>
      <div className="text-muted-foreground mb-1">
        {format(task.start, 'MMM d')} &ndash; {format(task.end, 'MMM d, yyyy')}
      </div>
      <div className="flex gap-3 mt-1.5 pt-1.5 border-t">
        <span className="font-semibold" style={{ color: ext.barColor }}>{diffDays}d</span>
        <span className="text-electric-blue font-semibold">{progress}%</span>
        {ext.isObjective && ext.taskCount !== undefined && (
          <span className="text-muted-foreground">{ext.completedCount}/{ext.taskCount} tasks</span>
        )}
      </div>
      {!ext.isObjective && !ext.isStrategy && (
        <div className="text-[10px] text-muted-foreground mt-1 border-t pt-1">
          Drag bar to reschedule &bull; Drag edges to resize
        </div>
      )}
      {ext.isObjective && (
        <div className="text-[10px] text-muted-foreground mt-1 border-t pt-1">
          Drag bar to set objective dates
        </div>
      )}
    </div>
  )
}

// ─── Unified Legend ──────────────────────────────────────────────────
const LEGEND_ITEMS = [
  { label: 'Healthy / Complete',  color: SEMANTIC_COLORS.positive },
  { label: 'In Progress',         color: SEMANTIC_COLORS.active },
  { label: 'In Review',           color: SEMANTIC_COLORS.review },
  { label: 'Needs Attention',     color: SEMANTIC_COLORS.warning },
  { label: 'Critical / Overdue',  color: SEMANTIC_COLORS.critical },
  { label: 'Not Started',         color: SEMANTIC_COLORS.inactive },
]

// ─── Main Component ─────────────────────────────────────────────────

interface ObjectivesGanttViewProps {
  objectives: ObjectiveWithTasks[]
  strategicObjectives?: StrategicObjective[]
  selectedId: string | null
  onSelect: (id: string) => void
  onTaskSelect?: (taskId: string) => void
  onCreateNew?: () => void
}

export function ObjectivesGanttView({ objectives, strategicObjectives = [], onSelect, onTaskSelect, onCreateNew }: ObjectivesGanttViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week)
  const [dateOffset, setDateOffset] = useState<Date>(new Date())
  const [collapsedObjectives, setCollapsedObjectives] = useState<Set<string>>(new Set())

  // Optimistic date overrides for objectives and tasks (prevents bounce-back)
  const [localDateOverrides, setLocalDateOverrides] = useState<Record<string, { start: Date; end: Date }>>({})
  const dateChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // dnd-kit: track active drag for overlay
  const [activeDragTask, setActiveDragTask] = useState<{ id: string; name: string } | null>(null)

  // dnd-kit sensors — require 8px movement to start drag (prevents accidental drags)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (dateChangeTimeoutRef.current) clearTimeout(dateChangeTimeoutRef.current)
    }
  }, [])

  // Clear optimistic overrides when server data matches
  useEffect(() => {
    if (Object.keys(localDateOverrides).length === 0) return

    const isSameDay = (d1: Date, d2: Date): boolean =>
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()

    const updated = { ...localDateOverrides }
    let changed = false

    for (const [id, override] of Object.entries(localDateOverrides)) {
      // Check objectives
      const obj = objectives.find(o => o.id === id)
      if (obj) {
        const serverStart = obj.start_date ? new Date(obj.start_date) : null
        const serverEnd = obj.end_date ? new Date(obj.end_date) : null
        if (serverStart && serverEnd && isSameDay(serverStart, override.start) && isSameDay(serverEnd, override.end)) {
          delete updated[id]
          changed = true
          continue
        }
      }

      // Check tasks within objectives
      for (const o of objectives) {
        const task = o.tasks.find(t => t.id === id)
        if (task) {
          const serverStart = task.start_date ? new Date(task.start_date) : null
          const serverEnd = task.end_date ? new Date(task.end_date) : null
          if (serverStart && serverEnd && isSameDay(serverStart, override.start) && isSameDay(serverEnd, override.end)) {
            delete updated[id]
            changed = true
          }
          break
        }
      }
    }

    if (changed) setLocalDateOverrides(updated)
  }, [objectives, localDateOverrides])

  const navigate = (dir: 'prev' | 'next') => {
    setDateOffset(prev => {
      if (viewMode === ViewMode.Day) return dir === 'next' ? addDays(prev, 7) : subDays(prev, 7)
      if (viewMode === ViewMode.Week) return dir === 'next' ? addWeeks(prev, 4) : subWeeks(prev, 4)
      return dir === 'next' ? addMonths(prev, 2) : subMonths(prev, 2)
    })
  }

  const toggleCollapse = useCallback((objId: string) => {
    setCollapsedObjectives(prev => {
      const next = new Set(prev)
      if (next.has(objId)) next.delete(objId)
      else next.add(objId)
      return next
    })
  }, [])

  /**
   * Build gantt tasks for a set of objectives with nested tasks.
   * Now uses explicit objective dates when available.
   */
  const buildObjectiveGanttTasks = useCallback(
    (objs: ObjectiveWithTasks[], now: Date): ExtendedGanttTask[] => {
      const result: ExtendedGanttTask[] = []

      for (const obj of objs) {
        // Check for optimistic override first
        const override = localDateOverrides[obj.id]

        let objStart: Date
        let objEnd: Date

        if (override) {
          objStart = override.start
          objEnd = override.end
        } else if (obj.start_date && obj.end_date) {
          // Use explicit objective dates if set
          objStart = new Date(obj.start_date)
          objEnd = new Date(obj.end_date)
        } else {
          // Fall back to deriving from tasks
          const tasksWithDates = obj.tasks.filter(t => t.start_date || t.end_date)
          const allStarts = tasksWithDates.filter(t => t.start_date).map(t => new Date(t.start_date!).getTime())
          const allEnds = tasksWithDates.filter(t => t.end_date).map(t => new Date(t.end_date!).getTime())

          objStart = allStarts.length > 0 ? new Date(Math.min(...allStarts)) : new Date(obj.created_at)
          objEnd = allEnds.length > 0 ? new Date(Math.max(...allEnds)) : new Date(objStart.getTime() + 14 * 86400000)
        }

        if (isNaN(objStart.getTime())) objStart = now
        if (isNaN(objEnd.getTime()) || objEnd <= objStart) objEnd = new Date(objStart.getTime() + 14 * 86400000)

        const objColor = getObjectiveColor(obj.health)
        const isCollapsed = collapsedObjectives.has(obj.id)

        result.push({
          start: objStart,
          end: objEnd,
          name: obj.title,
          id: obj.id,
          type: 'task',
          progress: obj.progress,
          isDisabled: false, // ENABLED for drag-drop scheduling
          styles: {
            progressColor: objColor,
            progressSelectedColor: objColor,
            backgroundColor: objColor,
          },
          isObjective: true,
          objectiveHealth: obj.health,
          taskCount: obj.totalTasks,
          completedCount: obj.completedTasks,
          progressPct: obj.progress,
          barColor: objColor,
        })

        if (!isCollapsed) {
          for (const task of obj.tasks) {
            const taskOverride = localDateOverrides[task.id]
            let taskStart = taskOverride?.start ?? (task.start_date ? new Date(task.start_date) : new Date(task.created_at))
            let taskEnd = taskOverride?.end ?? (task.end_date ? new Date(task.end_date) : new Date(taskStart.getTime() + 86400000))
            if (isNaN(taskStart.getTime())) taskStart = now
            if (isNaN(taskEnd.getTime()) || taskEnd <= taskStart) taskEnd = new Date(taskStart.getTime() + 86400000)

            const taskColor = getTaskColor(task.status, task.end_date)
            const taskProgress = typeof task.progress === 'number' ? task.progress : (task.status === 'Completed' ? 100 : 0)

            result.push({
              start: taskStart,
              end: taskEnd,
              name: task.title,
              id: task.id,
              type: 'task',
              progress: taskProgress,
              isDisabled: false, // ENABLED for drag-drop scheduling
              styles: {
                progressColor: taskColor,
                progressSelectedColor: taskColor,
                backgroundColor: taskColor,
              },
              isObjective: false,
              progressPct: taskProgress,
              barColor: taskColor,
              parentObjectiveId: obj.id,
            })
          }
        }
      }

      return result
    },
    [collapsedObjectives, localDateOverrides]
  )

  // Build gantt data with strategy group headers
  const ganttTasks: ExtendedGanttTask[] = useMemo(() => {
    const now = new Date()

    if (strategicObjectives.length === 0) {
      return buildObjectiveGanttTasks(objectives, now)
    }

    const result: ExtendedGanttTask[] = []
    const stratMap = new Map<string, ObjectiveWithTasks[]>()
    const unlinked: ObjectiveWithTasks[] = []

    for (const obj of objectives) {
      if (obj.parent_objective_id && strategicObjectives.some(s => s.id === obj.parent_objective_id)) {
        const existing = stratMap.get(obj.parent_objective_id) || []
        existing.push(obj)
        stratMap.set(obj.parent_objective_id, existing)
      } else {
        unlinked.push(obj)
      }
    }

    for (const strat of strategicObjectives) {
      const stratObjs = stratMap.get(strat.id) || []
      const isStratCollapsed = collapsedObjectives.has(`strat-${strat.id}`)

      result.push({
        start: now,
        end: new Date(now.getTime() + 86400000),
        name: strat.title,
        id: `strat-${strat.id}`,
        type: 'task',
        progress: 0,
        isDisabled: true,
        styles: {
          progressColor: 'transparent',
          progressSelectedColor: 'transparent',
          backgroundColor: 'transparent',
        },
        isStrategy: true,
        isObjective: false,
        taskCount: stratObjs.length,
        barColor: 'hsl(var(--international-orange))',
      })

      if (!isStratCollapsed) {
        result.push(...buildObjectiveGanttTasks(stratObjs, now))
      }
    }

    if (unlinked.length > 0) {
      result.push({
        start: now,
        end: new Date(now.getTime() + 86400000),
        name: 'Unlinked Objectives',
        id: 'strat-unlinked',
        type: 'task',
        progress: 0,
        isDisabled: true,
        styles: {
          progressColor: 'transparent',
          progressSelectedColor: 'transparent',
          backgroundColor: 'transparent',
        },
        isStrategy: true,
        isObjective: false,
        taskCount: unlinked.length,
        barColor: 'hsl(var(--muted-foreground))',
      })

      const isUnlinkedCollapsed = collapsedObjectives.has('strat-unlinked')
      if (!isUnlinkedCollapsed) {
        result.push(...buildObjectiveGanttTasks(unlinked, now))
      }
    }

    return result
  }, [objectives, strategicObjectives, collapsedObjectives, buildObjectiveGanttTasks])

  // ─── Gantt bar date change handler (drag/resize bars) ─────────────
  const handleDateChange = useCallback(async (task: GanttTask) => {
    const ext = task as ExtendedGanttTask

    // Apply optimistic update immediately
    setLocalDateOverrides(prev => ({
      ...prev,
      [task.id]: { start: task.start, end: task.end },
    }))

    try {
      if (ext.isObjective) {
        // Objective bar dragged — update objective dates
        const result = await updateObjectiveDates(
          task.id,
          task.start.toISOString(),
          task.end.toISOString()
        )
        if (result && 'error' in result && result.error) {
          // Revert optimistic update
          setLocalDateOverrides(prev => {
            const next = { ...prev }
            delete next[task.id]
            return next
          })
          toast.error(result.error)
        } else {
          toast.success(`Rescheduled: ${task.name}`)
          // Fallback cleanup after 10s
          if (dateChangeTimeoutRef.current) clearTimeout(dateChangeTimeoutRef.current)
          dateChangeTimeoutRef.current = setTimeout(() => {
            setLocalDateOverrides(prev => {
              const next = { ...prev }
              delete next[task.id]
              return next
            })
          }, 10000)
        }
      } else {
        // Task bar dragged — update task dates
        const result = await updateTaskDates(
          task.id,
          task.start.toISOString(),
          task.end.toISOString()
        )
        if (result && 'error' in result && result.error) {
          setLocalDateOverrides(prev => {
            const next = { ...prev }
            delete next[task.id]
            return next
          })
          toast.error(result.error)
        } else {
          toast.success(`Rescheduled: ${task.name}`)
          if (dateChangeTimeoutRef.current) clearTimeout(dateChangeTimeoutRef.current)
          dateChangeTimeoutRef.current = setTimeout(() => {
            setLocalDateOverrides(prev => {
              const next = { ...prev }
              delete next[task.id]
              return next
            })
          }, 10000)
        }
      }
    } catch {
      setLocalDateOverrides(prev => {
        const next = { ...prev }
        delete next[task.id]
        return next
      })
      toast.error('Failed to update dates')
    }
  }, [])

  // ─── dnd-kit: Move tasks between objectives ──────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event
    const data = active.data.current as { type: string; taskId: string; taskName: string } | undefined
    if (data?.type === 'task') {
      setActiveDragTask({ id: data.taskId, name: data.taskName })
    }
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveDragTask(null)
    const { active, over } = event
    if (!over) return

    const activeData = active.data.current as { type: string; taskId: string; sourceObjectiveId?: string } | undefined
    const overData = over.data.current as { type: string; objectiveId: string } | undefined

    if (activeData?.type !== 'task' || overData?.type !== 'objective') return

    const taskId = activeData.taskId
    const targetObjectiveId = overData.objectiveId

    // Don't move to same objective
    if (activeData.sourceObjectiveId === targetObjectiveId) return

    try {
      const result = await moveTaskToObjective(taskId, targetObjectiveId)
      if (result && 'error' in result && result.error) {
        toast.error(result.error)
      } else {
        const targetObj = objectives.find(o => o.id === targetObjectiveId)
        toast.success(`Task moved to "${targetObj?.title || 'objective'}"`)
      }
    } catch {
      toast.error('Failed to move task')
    }
  }, [objectives])

  // Click handler (bar click)
  const handleClick = useCallback((task: GanttTask) => {
    const ext = task as ExtendedGanttTask
    if (ext.isObjective) onSelect(task.id)
    else onTaskSelect?.(task.id)
  }, [onSelect, onTaskSelect])

  // Memoized table wrapper
  const MemoizedTable = useCallback(
    (props: { tasks: ExtendedGanttTask[]; rowHeight: number; onExpanderClick: (task: GanttTask) => void }) => (
      <ObjListTable
        {...props}
        sortedTasks={ganttTasks}
        onSelectObjective={onSelect}
        onSelectTask={onTaskSelect}
        collapsedObjectives={collapsedObjectives}
        onToggleCollapse={toggleCollapse}
      />
    ),
    [ganttTasks, onSelect, onTaskSelect, collapsedObjectives, toggleCollapse]
  )

  // ─── Empty state ────────────────────────────────────────────────
  if (objectives.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <GanttChartSquare className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">Your timeline awaits</h3>
        <p className="text-sm text-muted-foreground">Create objectives with tasks and deadlines to see your progress mapped across time.</p>
        {onCreateNew && (
          <Button onClick={onCreateNew} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Create Objective
          </Button>
        )}
      </div>
    )
  }

  const ganttKey = `gantt-obj-${dateOffset.getTime()}-${Array.from(collapsedObjectives).sort().join(',')}-${Object.keys(localDateOverrides).join(',')}`

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-3">
        {/* ─── Unified Legend ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px]">
          <div className="flex flex-wrap items-center gap-3">
            {LEGEND_ITEMS.map(item => (
              <span key={item.label} className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: item.color }} />
                <span className="text-muted-foreground">{item.label}</span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="flex items-center gap-1">
              <ArrowRightLeft className="h-3 w-3" />
              Drag bars to reschedule
            </span>
            <span className="flex items-center gap-1">
              <GripVertical className="h-3 w-3" />
              Drag tasks between objectives
            </span>
          </div>
        </div>

        {/* ─── Toolbar ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-muted-foreground"
            onClick={() => {
              const allIds = [
                ...objectives.map(o => o.id),
                ...strategicObjectives.map(s => `strat-${s.id}`),
                ...(objectives.some(o => !o.parent_objective_id) ? ['strat-unlinked'] : []),
              ]
              if (collapsedObjectives.size < allIds.length) {
                setCollapsedObjectives(new Set(allIds))
              } else {
                setCollapsedObjectives(new Set())
              }
            }}
          >
            {collapsedObjectives.size === 0 ? (
              <>
                <ChevronRightIcon className="h-3 w-3 mr-1" />
                Collapse All
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Expand All
              </>
            )}
          </Button>

          <div className="flex items-center gap-2">
            <ViewToggle
              options={[
                { value: 'day', label: 'Day', ariaLabel: 'Day view' },
                { value: 'week', label: 'Week', ariaLabel: 'Week view' },
                { value: 'month', label: 'Month', ariaLabel: 'Month view' },
              ]}
              value={viewMode === ViewMode.Day ? 'day' : viewMode === ViewMode.Week ? 'week' : 'month'}
              onValueChange={(v) => setViewMode(v === 'day' ? ViewMode.Day : v === 'week' ? ViewMode.Week : ViewMode.Month)}
            />

            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => navigate('prev')} className="h-8 w-8" aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDateOffset(new Date())} className="h-8 px-2.5 text-xs font-medium">
                <CalendarDays className="h-3.5 w-3.5 mr-1" />
                Today
              </Button>
              <Button variant="ghost" size="icon" onClick={() => navigate('next')} className="h-8 w-8" aria-label="Next">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* ─── Gantt Chart ─────────────────────────────────────────── */}
        <div className="bg-background rounded-xl border overflow-x-auto overflow-y-hidden shadow-sm">
          <Gantt
            key={ganttKey}
            tasks={ganttTasks}
            viewMode={viewMode}
            viewDate={dateOffset}
            listCellWidth="340px"
            columnWidth={viewMode === ViewMode.Month ? 300 : viewMode === ViewMode.Week ? 150 : 65}
            barFill={75}
            rowHeight={40}
            headerHeight={50}
            onDateChange={handleDateChange}
            onClick={handleClick}
            TaskListHeader={ObjListHeader}
            TaskListTable={MemoizedTable}
            TooltipContent={ObjTooltip}
          />
        </div>
      </div>

      {/* ─── Drag Overlay (floating task card while dragging) ──── */}
      <DragOverlay>
        {activeDragTask ? (
          <div className="bg-background border border-international-orange/50 rounded-lg px-3 py-2 shadow-lg text-sm font-medium text-foreground flex items-center gap-2 max-w-[280px]">
            <GripVertical className="h-3 w-3 text-international-orange" />
            <span className="truncate">{activeDragTask.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
