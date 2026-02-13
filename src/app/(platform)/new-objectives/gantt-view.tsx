'use client'

import { useState, useMemo, useCallback } from 'react'
import { Gantt, Task as GanttTask, ViewMode } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'
import { cn } from '@/lib/utils'
import { ViewToggle } from '@/components/ui/view-toggle'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft, ChevronRight, CalendarDays, GanttChartSquare,
  ChevronDown, ChevronRight as ChevronRightIcon, Plus,
} from 'lucide-react'
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns'
import { Flag } from 'lucide-react'
import type { ObjectiveWithTasks, StrategicObjective } from './types'

// ─── Unified semantic color system ──────────────────────────────────
// Green  = Positive/Good    (On Track objectives, Completed tasks)
// Blue   = Active/Working   (In Progress/Accepted tasks)
// Purple = In Review        (Pending review tasks)
// Amber  = Needs Attention  (At Risk objectives, Due Soon tasks)
// Red    = Critical         (Off Track objectives, Overdue/Rejected tasks)
// Gray   = Inactive         (Not Started objectives, Pending tasks)

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

  // Overdue: past end date and not completed/rejected
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

// ─── Custom Row ─────────────────────────────────────────────────────
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
        const progressPct = task.progressPct ?? task.progress
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

        return (
          <div
            key={task.id}
            className={cn(
              'flex items-center text-sm cursor-pointer transition-colors border-b border-border/50',
              isObj
                ? 'bg-muted/20 hover:bg-muted/40 font-medium'
                : 'hover:bg-muted/30'
            )}
            style={{ height: rowHeight }}
            onClick={() => {
              if (isObj) {
                onSelectObjective(task.id)
              } else {
                onSelectTask?.(task.id)
              }
            }}
          >
            {/* Name */}
            <div className="flex-1 px-4 min-w-[200px] flex items-center gap-1.5 overflow-hidden">
              {/* Expand/collapse chevron for objectives */}
              {isObj ? (
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
              ) : (
                <span className="w-5 flex-shrink-0" />
              )}

              {/* Semantic color dot */}
              {task.barColor && (
                <span
                  className={cn('rounded-full flex-shrink-0', isObj ? 'w-2 h-2' : 'w-1.5 h-1.5')}
                  style={{ backgroundColor: task.barColor }}
                />
              )}

              {/* Label */}
              <span className={cn(
                'truncate',
                isObj ? 'text-foreground text-[13px]' : 'text-muted-foreground text-[12px]'
              )}>
                {task.name}
              </span>

              {/* Task count badge for objectives */}
              {isObj && task.taskCount !== undefined && (
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
                    width: `${progressPct}%`,
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

export function ObjectivesGanttView({ objectives, strategicObjectives = [], selectedId, onSelect, onTaskSelect, onCreateNew }: ObjectivesGanttViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week)
  const [dateOffset, setDateOffset] = useState<Date>(new Date())
  const [collapsedObjectives, setCollapsedObjectives] = useState<Set<string>>(new Set())

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
   * Build a list of gantt tasks for a set of objectives (with optional nesting).
   * Shared between strategy-grouped and flat views.
   */
  const buildObjectiveGanttTasks = useCallback(
    (objs: ObjectiveWithTasks[], now: Date): ExtendedGanttTask[] => {
      const result: ExtendedGanttTask[] = []

      for (const obj of objs) {
        const tasksWithDates = obj.tasks.filter(t => t.start_date || t.end_date)
        const allStarts = tasksWithDates.filter(t => t.start_date).map(t => new Date(t.start_date!).getTime())
        const allEnds = tasksWithDates.filter(t => t.end_date).map(t => new Date(t.end_date!).getTime())

        let objStart = allStarts.length > 0 ? new Date(Math.min(...allStarts)) : new Date(obj.created_at)
        let objEnd = allEnds.length > 0 ? new Date(Math.max(...allEnds)) : new Date(objStart.getTime() + 14 * 86400000)
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
          isDisabled: true,
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
            let taskStart = task.start_date ? new Date(task.start_date) : new Date(task.created_at)
            let taskEnd = task.end_date ? new Date(task.end_date) : new Date(taskStart.getTime() + 86400000)
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
              isDisabled: true,
              styles: {
                progressColor: taskColor,
                progressSelectedColor: taskColor,
                backgroundColor: taskColor,
              },
              isObjective: false,
              progressPct: taskProgress,
              barColor: taskColor,
            })
          }
        }
      }

      return result
    },
    [collapsedObjectives]
  )

  // Build gantt data with strategy group headers when strategies are present
  const ganttTasks: ExtendedGanttTask[] = useMemo(() => {
    const now = new Date()

    // No strategies — flat view
    if (strategicObjectives.length === 0) {
      return buildObjectiveGanttTasks(objectives, now)
    }

    // Group by strategy
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

      // Strategy header row (non-renderable bar — just a list row)
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

    // Unlinked
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
        <h3 className="text-base font-semibold text-foreground mb-1">No objectives to display</h3>
        <p className="text-sm text-muted-foreground">Create objectives with tasks to see the Gantt chart.</p>
        {onCreateNew && (
          <Button onClick={onCreateNew} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Create Objective
          </Button>
        )}
      </div>
    )
  }

  // Unique key that changes whenever collapse state changes
  const ganttKey = `gantt-obj-${dateOffset.getTime()}-${Array.from(collapsedObjectives).sort().join(',')}`

  return (
    <div className="space-y-3">
      {/* ─── Unified Legend ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 text-[11px]">
        {LEGEND_ITEMS.map(item => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="text-muted-foreground">{item.label}</span>
          </span>
        ))}
      </div>

      {/* ─── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Expand/Collapse all */}
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

        {/* View mode + navigation */}
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
      <div className="bg-background rounded-xl border overflow-hidden shadow-sm">
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
          onClick={handleClick}
          TaskListHeader={ObjListHeader}
          TaskListTable={MemoizedTable}
          TooltipContent={ObjTooltip}
        />
      </div>
    </div>
  )
}
