'use client'

import { useState, useMemo, useCallback } from 'react'
import { Gantt, Task as GanttTask, ViewMode } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft, ChevronRight, CalendarDays, GanttChartSquare,
} from 'lucide-react'
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns'
import type { ObjectiveWithTasks } from './types'

// ─── Health color mapping ───────────────────────────────────────────
const HEALTH_COLORS: Record<string, { bar: string; progress: string }> = {
  'on-track':    { bar: '#22c55e', progress: '#16a34a' },
  'at-risk':     { bar: '#f59e0b', progress: '#d97706' },
  'off-track':   { bar: '#ef4444', progress: '#dc2626' },
  'completed':   { bar: '#22c55e', progress: '#16a34a' },
  'not-started': { bar: '#9ca3af', progress: '#6b7280' },
}

const TASK_STATUS_COLORS: Record<string, string> = {
  Pending: '#9ca3af',
  Accepted: '#3b82f6',
  Pending_Peer_Review: '#a855f7',
  Pending_Executive_Approval: '#a855f7',
  Amended_Pending_Approval: '#a855f7',
  Completed: '#22c55e',
  Rejected: '#ef4444',
}

// ─── Extended GanttTask ─────────────────────────────────────────────
interface ExtendedGanttTask extends GanttTask {
  objectiveHealth?: string
  taskCount?: number
  completedCount?: number
  isObjective?: boolean
  progressPct?: number
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
}: {
  tasks: ExtendedGanttTask[]
  rowHeight: number
  onExpanderClick: (task: GanttTask) => void
  sortedTasks: ExtendedGanttTask[]
  onSelectObjective: (id: string) => void
}) {
  return (
    <div>
      {sortedTasks.map(task => {
        const isObj = task.isObjective
        const healthColor = isObj ? HEALTH_COLORS[task.objectiveHealth || 'not-started'] : null
        const progressPct = task.progressPct ?? task.progress

        return (
          <div
            key={task.id}
            className={cn(
              'flex items-center text-sm cursor-pointer transition-colors border-b border-slate-50',
              isObj
                ? 'bg-muted/20 hover:bg-muted/40 font-medium'
                : 'pl-6 hover:bg-muted/30'
            )}
            style={{ height: rowHeight }}
            onClick={() => {
              if (isObj) onSelectObjective(task.id)
              onExpanderClick(task)
            }}
          >
            {/* Name */}
            <div className="flex-1 px-4 min-w-[200px] flex items-center gap-2 overflow-hidden">
              {isObj && healthColor && (
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: healthColor.bar }}
                />
              )}
              {!isObj && <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 flex-shrink-0 ml-1" />}
              <span className={cn(
                'truncate',
                isObj ? 'text-foreground text-[13px]' : 'text-muted-foreground text-[12px]'
              )}>
                {task.name}
              </span>
              {isObj && task.taskCount !== undefined && (
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
                  {task.completedCount}/{task.taskCount}
                </span>
              )}
            </div>

            {/* Progress */}
            <div className="w-16 px-2 flex items-center justify-center">
              <div className="w-full max-w-[48px] h-1.5 bg-muted/50 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progressPct}%`,
                    backgroundColor: isObj
                      ? (healthColor?.progress || '#9ca3af')
                      : (TASK_STATUS_COLORS[task.name] || '#3b82f6'),
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
}

export function ObjectivesGanttView({ objectives, selectedId, onSelect }: ObjectivesGanttViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week)
  const [dateOffset, setDateOffset] = useState<Date>(new Date())

  const navigate = (dir: 'prev' | 'next') => {
    setDateOffset(prev => {
      if (viewMode === ViewMode.Day) return dir === 'next' ? addDays(prev, 7) : subDays(prev, 7)
      if (viewMode === ViewMode.Week) return dir === 'next' ? addWeeks(prev, 4) : subWeeks(prev, 4)
      return dir === 'next' ? addMonths(prev, 2) : subMonths(prev, 2)
    })
  }

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

      // Fallback dates
      let objStart = allStarts.length > 0 ? new Date(Math.min(...allStarts)) : new Date(obj.created_at)
      let objEnd = allEnds.length > 0 ? new Date(Math.max(...allEnds)) : new Date(objStart.getTime() + 14 * 86400000)

      if (isNaN(objStart.getTime())) objStart = now
      if (isNaN(objEnd.getTime()) || objEnd <= objStart) objEnd = new Date(objStart.getTime() + 14 * 86400000)

      const healthPalette = HEALTH_COLORS[obj.health] || HEALTH_COLORS['not-started']

      // Add objective row (project type)
      result.push({
        start: objStart,
        end: objEnd,
        name: obj.title,
        id: obj.id,
        type: 'project',
        progress: obj.progress,
        hideChildren: false,
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

      // Add child tasks
      for (const task of obj.tasks) {
        let taskStart = task.start_date ? new Date(task.start_date) : new Date(task.created_at)
        let taskEnd = task.end_date ? new Date(task.end_date) : new Date(taskStart.getTime() + 86400000)

        if (isNaN(taskStart.getTime())) taskStart = now
        if (isNaN(taskEnd.getTime()) || taskEnd <= taskStart) taskEnd = new Date(taskStart.getTime() + 86400000)

        const taskColor = TASK_STATUS_COLORS[task.status] || '#9ca3af'
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
        })
      }
    }

    return result
  }, [objectives])

  // Click handler
  const handleClick = useCallback((task: GanttTask) => {
    const ext = task as ExtendedGanttTask
    if (ext.isObjective) onSelect(task.id)
  }, [onSelect])

  // Memoized table wrapper
  const MemoizedTable = useCallback(
    (props: { tasks: ExtendedGanttTask[]; rowHeight: number; onExpanderClick: (task: GanttTask) => void }) => (
      <ObjListTable {...props} sortedTasks={ganttTasks} onSelectObjective={onSelect} />
    ),
    [ganttTasks, onSelect]
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
      {/* ─── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Health legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="text-muted-foreground font-medium">Health:</span>
          {[
            { label: 'On Track', color: '#22c55e' },
            { label: 'At Risk', color: '#f59e0b' },
            { label: 'Off Track', color: '#ef4444' },
            { label: 'Completed', color: '#22c55e' },
            { label: 'Not Started', color: '#9ca3af' },
          ].map(s => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="text-muted-foreground">{s.label}</span>
            </span>
          ))}
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
          key={`gantt-objectives-${dateOffset.getTime()}`}
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
