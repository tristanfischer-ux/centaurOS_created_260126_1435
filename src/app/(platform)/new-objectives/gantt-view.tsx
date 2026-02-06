'use client'

import { useState, useMemo, useCallback } from 'react'
import { Gantt, Task as GanttTask, ViewMode } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft, ChevronRight, CalendarDays, GanttChartSquare,
  ChevronDown, ChevronRight as ChevronRightIcon,
} from 'lucide-react'
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns'
import type { ObjectiveWithTasks } from './types'

// ─── Health color mapping (for objective bars) ──────────────────────
const HEALTH_COLORS: Record<string, { bar: string; progress: string }> = {
  'on-track':    { bar: '#22c55e', progress: '#16a34a' },
  'at-risk':     { bar: '#f59e0b', progress: '#d97706' },
  'off-track':   { bar: '#ef4444', progress: '#dc2626' },
  'completed':   { bar: '#22c55e', progress: '#16a34a' },
  'not-started': { bar: '#9ca3af', progress: '#6b7280' },
}

// ─── Task status color mapping (for task bars) ─────────────────────
function getTaskBarColor(status: string, endDate: string | null): string {
  const now = new Date()

  // Overdue check: past end date and not completed
  if (endDate && status !== 'Completed' && status !== 'Rejected') {
    const end = new Date(endDate)
    if (end < now) return '#ef4444' // red -- overdue

    // Due within 3 days
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    if (end <= threeDays) return '#f59e0b' // amber -- due soon
  }

  // Status-based
  switch (status) {
    case 'Completed': return '#22c55e'
    case 'Accepted': return '#3b82f6'
    case 'Pending_Peer_Review':
    case 'Pending_Executive_Approval':
    case 'Amended_Pending_Approval': return '#a855f7'
    case 'Rejected': return '#ef4444'
    case 'Pending':
    default: return '#9ca3af'
  }
}

// ─── Extended GanttTask ─────────────────────────────────────────────
interface ExtendedGanttTask extends GanttTask {
  objectiveHealth?: string
  taskCount?: number
  completedCount?: number
  isObjective?: boolean
  progressPct?: number
  taskStatusColor?: string  // actual color for the task bar
}

// ─── Custom Header ──────────────────────────────────────────────────
function ObjListHeader({ headerHeight }: { headerHeight: number }) {
  return (
    <div
      className="flex items-center border-b border-slate-100 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
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
  onExpanderClick,
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
        const healthColor = isObj ? HEALTH_COLORS[task.objectiveHealth || 'not-started'] : null
        const progressPct = task.progressPct ?? task.progress
        const isCollapsed = isObj ? collapsedObjectives.has(task.id) : false

        return (
          <div
            key={task.id}
            className={cn(
              'flex items-center text-sm cursor-pointer transition-colors border-b border-slate-50',
              isObj
                ? 'bg-muted/20 hover:bg-muted/40 font-medium'
                : 'hover:bg-muted/30'
            )}
            style={{ height: rowHeight }}
            onClick={() => {
              if (isObj) {
                onSelectObjective(task.id)
                onToggleCollapse(task.id)
              } else {
                onSelectTask?.(task.id)
              }
              onExpanderClick(task)
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
                    onExpanderClick(task)
                  }}
                  aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                >
                  {isCollapsed
                    ? <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  }
                </button>
              ) : (
                <span className="w-5 flex-shrink-0" /> // indent spacer for tasks
              )}

              {/* Health/status dot */}
              {isObj && healthColor && (
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: healthColor.bar }}
                />
              )}
              {!isObj && task.taskStatusColor && (
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: task.taskStatusColor }}
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
                    backgroundColor: isObj
                      ? (healthColor?.progress || '#9ca3af')
                      : (task.taskStatusColor || '#9ca3af'),
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
    <div
      style={{
        backgroundColor: 'white',
        padding: '12px 16px',
        boxShadow: '0 8px 24px -4px rgba(0,0,0,0.12), 0 2px 8px -2px rgba(0,0,0,0.08)',
        borderRadius: '10px',
        fontSize: '12px',
        fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
        whiteSpace: 'nowrap',
        transform: 'translateY(-130%)',
        pointerEvents: 'none',
        zIndex: 50,
        color: '#0f172a',
        border: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '13px' }}>
        {ext.isObjective ? '🎯 ' : ''}{task.name}
      </div>
      <div style={{ color: '#6b7280', marginBottom: '4px' }}>
        {format(task.start, 'MMM d')} &ndash; {format(task.end, 'MMM d, yyyy')}
      </div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
        <span style={{ color: '#f59e0b', fontWeight: 600 }}>{diffDays} day{diffDays !== 1 ? 's' : ''}</span>
        <span style={{ color: '#3b82f6', fontWeight: 600 }}>{progress}%</span>
        {ext.isObjective && ext.taskCount !== undefined && (
          <span style={{ color: '#6b7280' }}>{ext.completedCount}/{ext.taskCount} tasks</span>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────

interface ObjectivesGanttViewProps {
  objectives: ObjectiveWithTasks[]
  selectedId: string | null
  onSelect: (id: string) => void
  onTaskSelect?: (taskId: string) => void
}

export function ObjectivesGanttView({ objectives, selectedId, onSelect, onTaskSelect }: ObjectivesGanttViewProps) {
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
      if (next.has(objId)) {
        next.delete(objId)
      } else {
        next.add(objId)
      }
      return next
    })
  }, [])

  // Build hierarchical gantt data: objectives as projects, tasks nested under them
  const ganttTasks: ExtendedGanttTask[] = useMemo(() => {
    const result: ExtendedGanttTask[] = []
    const now = new Date()

    for (const obj of objectives) {
      // Compute objective date range from tasks
      const tasksWithDates = obj.tasks.filter(t => t.start_date || t.end_date)
      const allStarts = tasksWithDates
        .filter(t => t.start_date)
        .map(t => new Date(t.start_date!).getTime())
      const allEnds = tasksWithDates
        .filter(t => t.end_date)
        .map(t => new Date(t.end_date!).getTime())

      let objStart = allStarts.length > 0 ? new Date(Math.min(...allStarts)) : new Date(obj.created_at)
      let objEnd = allEnds.length > 0 ? new Date(Math.max(...allEnds)) : new Date(objStart.getTime() + 14 * 86400000)

      if (isNaN(objStart.getTime())) objStart = now
      if (isNaN(objEnd.getTime()) || objEnd <= objStart) objEnd = new Date(objStart.getTime() + 14 * 86400000)

      const healthPalette = HEALTH_COLORS[obj.health] || HEALTH_COLORS['not-started']
      const isCollapsed = collapsedObjectives.has(obj.id)

      // Objective row (project type)
      result.push({
        start: objStart,
        end: objEnd,
        name: obj.title,
        id: obj.id,
        type: 'project',
        progress: obj.progress,
        hideChildren: isCollapsed,
        isDisabled: true,
        styles: {
          progressColor: healthPalette.progress,
          progressSelectedColor: healthPalette.progress,
          backgroundColor: healthPalette.bar,
        },
        isObjective: true,
        objectiveHealth: obj.health,
        taskCount: obj.totalTasks,
        completedCount: obj.completedTasks,
        progressPct: obj.progress,
      })

      // Child tasks (only add to gantt data if not collapsed)
      if (!isCollapsed) {
        for (const task of obj.tasks) {
          let taskStart = task.start_date ? new Date(task.start_date) : new Date(task.created_at)
          let taskEnd = task.end_date ? new Date(task.end_date) : new Date(taskStart.getTime() + 86400000)

          if (isNaN(taskStart.getTime())) taskStart = now
          if (isNaN(taskEnd.getTime()) || taskEnd <= taskStart) taskEnd = new Date(taskStart.getTime() + 86400000)

          const taskColor = getTaskBarColor(task.status, task.end_date)
          const taskProgress = typeof task.progress === 'number' ? task.progress : (task.status === 'Completed' ? 100 : 0)

          result.push({
            start: taskStart,
            end: taskEnd,
            name: task.title,
            id: task.id,
            type: 'task',
            project: obj.id,
            progress: taskProgress,
            isDisabled: true,
            styles: {
              progressColor: taskColor,
              progressSelectedColor: taskColor,
              backgroundColor: taskColor,
            },
            isObjective: false,
            progressPct: taskProgress,
            taskStatusColor: taskColor,
          })
        }
      }
    }

    return result
  }, [objectives, collapsedObjectives])

  // Click handler (for clicking bars in the chart)
  const handleClick = useCallback((task: GanttTask) => {
    const ext = task as ExtendedGanttTask
    if (ext.isObjective) {
      onSelect(task.id)
    } else {
      onTaskSelect?.(task.id)
    }
  }, [onSelect, onTaskSelect])

  // Expander click handler (for gantt library)
  const handleExpanderClick = useCallback((task: GanttTask) => {
    const ext = task as ExtendedGanttTask
    if (ext.isObjective) {
      toggleCollapse(task.id)
    }
  }, [toggleCollapse])

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
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ─── Legend ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px]">
        {/* Objective health legend */}
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground font-semibold">Objectives:</span>
          {[
            { label: 'On Track', color: '#22c55e' },
            { label: 'At Risk', color: '#f59e0b' },
            { label: 'Off Track', color: '#ef4444' },
            { label: 'Not Started', color: '#9ca3af' },
          ].map(s => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="text-muted-foreground">{s.label}</span>
            </span>
          ))}
        </div>

        {/* Task status legend */}
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground font-semibold">Tasks:</span>
          {[
            { label: 'Pending', color: '#9ca3af' },
            { label: 'In Progress', color: '#3b82f6' },
            { label: 'Completed', color: '#22c55e' },
            { label: 'Due Soon', color: '#f59e0b' },
            { label: 'Overdue', color: '#ef4444' },
          ].map(s => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="text-muted-foreground">{s.label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ─── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Expand/Collapse all */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] text-muted-foreground"
            onClick={() => {
              // If any are expanded, collapse all. Otherwise expand all.
              if (collapsedObjectives.size < objectives.length) {
                setCollapsedObjectives(new Set(objectives.map(o => o.id)))
              } else {
                setCollapsedObjectives(new Set())
              }
            }}
          >
            {collapsedObjectives.size < objectives.length ? (
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
        </div>

        {/* View mode + navigation */}
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-muted/60 p-0.5 rounded-lg">
            {[
              { mode: ViewMode.Day, label: 'Day' },
              { mode: ViewMode.Week, label: 'Week' },
              { mode: ViewMode.Month, label: 'Month' },
            ].map(v => (
              <button
                key={v.label}
                onClick={() => setViewMode(v.mode)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md transition-all duration-200',
                  viewMode === v.mode
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('prev')}
              className="h-8 w-8"
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDateOffset(new Date())}
              className="h-8 px-2.5 text-xs font-medium"
            >
              <CalendarDays className="h-3.5 w-3.5 mr-1" />
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('next')}
              className="h-8 w-8"
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Gantt Chart ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-100 overflow-hidden shadow-sm">
        <Gantt
          key={`gantt-objectives-${dateOffset.getTime()}-${collapsedObjectives.size}`}
          tasks={ganttTasks}
          viewMode={viewMode}
          viewDate={dateOffset}
          listCellWidth="340px"
          columnWidth={viewMode === ViewMode.Month ? 300 : viewMode === ViewMode.Week ? 150 : 65}
          barFill={75}
          rowHeight={40}
          headerHeight={50}
          onClick={handleClick}
          onExpanderClick={handleExpanderClick}
          TaskListHeader={ObjListHeader}
          TaskListTable={MemoizedTable}
          TooltipContent={ObjTooltip}
        />
      </div>
    </div>
  )
}
