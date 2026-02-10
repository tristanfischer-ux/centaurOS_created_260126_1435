'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { Gantt, Task as GanttTask, ViewMode } from 'gantt-task-react'
import 'gantt-task-react/dist/index.css'
import { cn } from '@/lib/utils'
import { ViewToggle } from '@/components/ui/view-toggle'
import { Button } from '@/components/ui/button'
import {
  ChevronLeft, ChevronRight, CalendarDays, GanttChartSquare,
} from 'lucide-react'
import { UserAvatar } from '@/components/ui/user-avatar'
import { getStatusHex } from '@/lib/status-colors'
import { updateTaskDates } from '@/actions/tasks'
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns'
import { toast } from 'sonner'
import type { TaskWithData } from './types'

// ─── Extended GanttTask with extra metadata ─────────────────────────
interface ExtendedGanttTask extends GanttTask {
  taskNumber?: number
  assigneeName?: string | null
  assigneeRole?: string | null
  taskProgress?: number
  taskStatus?: string | null
  objectiveTitle?: string | null
}

// ─── Status-to-progress fallback ────────────────────────────────────
function getProgress(status: string | null): number {
  switch (status) {
    case 'Completed': return 100
    case 'Accepted': return 50
    case 'Pending_Peer_Review':
    case 'Pending_Executive_Approval':
    case 'Amended_Pending_Approval': return 70
    case 'Pending': return 0
    default: return 0
  }
}

// ─── Urgency-aware bar color ────────────────────────────────────────
function getBarColor(task: { status: string | null; end_date: string | null }): string {
  const endDate = task.end_date ? new Date(task.end_date) : null
  const now = new Date()

  if (endDate && endDate < now && task.status !== 'Completed') return '#ef4444'
  if (endDate && task.status !== 'Completed') {
    const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    if (endDate <= threeDays) return '#f59e0b'
  }
  return getStatusHex(task.status)
}

// ─── Custom Header ──────────────────────────────────────────────────
function TaskListHeader({ headerHeight }: { headerHeight: number }) {
  return (
    <div
      className="flex items-center border-b border-slate-100 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
      style={{ height: headerHeight }}
    >
      <div className="w-10 px-2 text-center">#</div>
      <div className="flex-1 px-3 min-w-[140px]">Task</div>
      <div className="w-[68px] px-2 text-center">From</div>
      <div className="w-[68px] px-2 text-center">To</div>
    </div>
  )
}

// ─── Custom Row ─────────────────────────────────────────────────────
function TaskListTable({
  rowHeight,
  onExpanderClick,
  sortedTasks,
  onSelectTask,
}: {
  tasks: ExtendedGanttTask[]
  rowHeight: number
  onExpanderClick: (task: GanttTask) => void
  sortedTasks: ExtendedGanttTask[]
  onSelectTask: (id: string) => void
}) {
  return (
    <div>
      {sortedTasks.map(task => {
        const displayName = task.name.replace(/^Task \d+:\s*/i, '')
        const progressPct = task.taskProgress ?? task.progress

        return (
          <div
            key={task.id}
            className="flex items-center hover:bg-muted/40 text-sm cursor-pointer transition-colors border-b border-slate-50"
            style={{ height: rowHeight }}
            onClick={() => {
              onSelectTask(task.id)
              onExpanderClick(task)
            }}
          >
            {/* Task number */}
            <div className="w-10 px-2 text-center text-muted-foreground text-[11px] font-mono tabular-nums">
              {task.taskNumber || '-'}
            </div>

            {/* Avatar + name */}
            <div className="flex-1 px-3 min-w-[140px] flex items-center gap-2 overflow-hidden">
              <UserAvatar
                name={task.assigneeName}
                role={task.assigneeRole}
                size="xs"
              />
              <span className="text-foreground text-[13px] truncate">{displayName}</span>
              {progressPct !== undefined && progressPct > 0 && progressPct < 100 && (
                <span className="ml-auto shrink-0 text-[10px] font-medium text-electric-blue bg-electric-blue-light px-1.5 py-0.5 rounded tabular-nums">
                  {progressPct}%
                </span>
              )}
              {progressPct === 100 && (
                <span className="ml-auto shrink-0 text-[10px] font-medium text-status-success bg-status-success-light px-1.5 py-0.5 rounded">
                  Done
                </span>
              )}
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
const GanttTooltip = ({ task }: { task: GanttTask; fontSize: string; fontFamily: string }) => {
  const ext = task as ExtendedGanttTask
  const diffDays = Math.ceil(Math.abs(task.end.getTime() - task.start.getTime()) / (1000 * 60 * 60 * 24))
  const progress = ext.taskProgress ?? task.progress

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
      <div style={{ fontWeight: 700, marginBottom: '4px', fontSize: '13px' }}>{task.name}</div>
      {ext.objectiveTitle && (
        <div style={{ color: '#6b7280', marginBottom: '6px', fontSize: '11px' }}>
          {ext.objectiveTitle}
        </div>
      )}
      <div style={{ color: '#6b7280', marginBottom: '4px' }}>
        {format(task.start, 'MMM d')} &ndash; {format(task.end, 'MMM d, yyyy')}
      </div>
      <div style={{ display: 'flex', gap: '12px', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
        <span style={{ color: '#f59e0b', fontWeight: 600 }}>{diffDays} day{diffDays !== 1 ? 's' : ''}</span>
        <span style={{ color: '#3b82f6', fontWeight: 600 }}>{progress}%</span>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────

interface TasksGanttViewProps {
  tasks: TaskWithData[]
  selectedId: string | null
  onSelect: (id: string) => void
}

export function TasksGanttView({ tasks, selectedId, onSelect }: TasksGanttViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.Week)
  const [dateOffset, setDateOffset] = useState<Date>(new Date())
  const [localDateOverrides, setLocalDateOverrides] = useState<Record<string, { start: Date; end: Date }>>({})
  const dateChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    return () => {
      if (dateChangeTimeoutRef.current) clearTimeout(dateChangeTimeoutRef.current)
    }
  }, [])

  // Clear optimistic overrides when server data matches
  useEffect(() => {
    if (Object.keys(localDateOverrides).length === 0) return
    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

    const next = { ...localDateOverrides }
    let changed = false
    for (const [id, ov] of Object.entries(localDateOverrides)) {
      const t = tasks.find(t => t.id === id)
      if (t?.start_date && t?.end_date) {
        if (isSameDay(new Date(t.start_date), ov.start) && isSameDay(new Date(t.end_date), ov.end)) {
          delete next[id]
          changed = true
        }
      }
    }
    if (changed) setLocalDateOverrides(next)
  }, [tasks, localDateOverrides])

  // Navigate
  const navigate = (dir: 'prev' | 'next') => {
    setDateOffset(prev => {
      if (viewMode === ViewMode.Day) return dir === 'next' ? addDays(prev, 7) : subDays(prev, 7)
      if (viewMode === ViewMode.Week) return dir === 'next' ? addWeeks(prev, 4) : subWeeks(prev, 4)
      return dir === 'next' ? addMonths(prev, 2) : subMonths(prev, 2)
    })
  }

  // Transform tasks
  const activeTasks = useMemo(() => tasks.filter(t => t.status !== 'Rejected'), [tasks])

  const ganttTasks: ExtendedGanttTask[] = useMemo(() => {
    return activeTasks
      .sort((a, b) => {
        const aEnd = a.end_date ? new Date(a.end_date).getTime() : Infinity
        const bEnd = b.end_date ? new Date(b.end_date).getTime() : Infinity
        return aEnd - bEnd
      })
      .slice(0, 60)
      .map(task => {
        const ov = localDateOverrides[task.id]
        let startDate = ov?.start ?? (task.start_date ? new Date(task.start_date) : new Date(task.created_at))
        let endDate = ov?.end ?? (task.end_date ? new Date(task.end_date) : new Date(startDate.getTime() + 86400000))

        if (isNaN(startDate.getTime())) startDate = new Date()
        if (isNaN(endDate.getTime()) || endDate <= startDate) endDate = new Date(startDate.getTime() + 86400000)

        const color = getBarColor({ status: task.status, end_date: task.end_date })
        const actualProgress = typeof task.progress === 'number' ? task.progress : getProgress(task.status)

        return {
          start: startDate,
          end: endDate,
          name: task.title || 'Untitled Task',
          id: task.id,
          type: 'task' as const,
          progress: actualProgress,
          isDisabled: false,
          styles: { progressColor: color, progressSelectedColor: color, backgroundColor: color },
          // Prefer task_assignees (multi-assignee system) over assignee_id (legacy)
          assigneeName: (task.assignees?.length > 0 ? task.assignees[0].full_name : task.assignee?.full_name) ?? null,
          assigneeRole: (task.assignees?.length > 0 ? task.assignees[0].role : task.assignee?.role) ?? null,
          taskNumber: task.task_number ?? undefined,
          taskProgress: actualProgress,
          taskStatus: task.status,
          objectiveTitle: task.objective?.title ?? null,
        }
      })
  }, [activeTasks, localDateOverrides])

  // Drag-to-reschedule
  const handleDateChange = useCallback(async (task: GanttTask) => {
    setLocalDateOverrides(prev => ({ ...prev, [task.id]: { start: task.start, end: task.end } }))
    try {
      const result = await updateTaskDates(task.id, task.start.toISOString(), task.end.toISOString())
      if (result.error) {
        setLocalDateOverrides(prev => { const n = { ...prev }; delete n[task.id]; return n })
        toast.error(result.error)
      } else {
        toast.success(`Rescheduled: ${task.name}`)
        if (dateChangeTimeoutRef.current) clearTimeout(dateChangeTimeoutRef.current)
        dateChangeTimeoutRef.current = setTimeout(() => {
          setLocalDateOverrides(prev => { const n = { ...prev }; delete n[task.id]; return n })
        }, 10000)
      }
    } catch {
      setLocalDateOverrides(prev => { const n = { ...prev }; delete n[task.id]; return n })
      toast.error('Failed to update task dates')
    }
  }, [])

  // Click to select
  const handleClick = useCallback((task: GanttTask) => {
    onSelect(task.id)
  }, [onSelect])

  // Memoized table wrapper
  const MemoizedTable = useCallback(
    (props: { tasks: ExtendedGanttTask[]; rowHeight: number; onExpanderClick: (task: GanttTask) => void }) => (
      <TaskListTable {...props} sortedTasks={ganttTasks} onSelectTask={onSelect} />
    ),
    [ganttTasks, onSelect]
  )

  // ─── Empty state ────────────────────────────────────────────────
  if (ganttTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <GanttChartSquare className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">No tasks to display</h3>
        <p className="text-sm text-muted-foreground">Create tasks with dates to see the Gantt chart.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ─── Toolbar ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Color legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <span className="text-muted-foreground font-medium">Status:</span>
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
          <span className="text-muted-foreground/60 ml-2">Drag bars to reschedule</span>
        </div>

        {/* View mode + navigation */}
        <div className="flex items-center gap-2">
          {/* View mode pills */}
          <ViewToggle
            options={[
              { value: 'day', label: 'Day', ariaLabel: 'Day view' },
              { value: 'week', label: 'Week', ariaLabel: 'Week view' },
              { value: 'month', label: 'Month', ariaLabel: 'Month view' },
            ]}
            value={viewMode === ViewMode.Day ? 'day' : viewMode === ViewMode.Week ? 'week' : 'month'}
            onValueChange={(v) => setViewMode(v === 'day' ? ViewMode.Day : v === 'week' ? ViewMode.Week : ViewMode.Month)}
          />

          {/* Date navigation */}
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
          key={`gantt-tasks-${dateOffset.getTime()}`}
          tasks={ganttTasks}
          viewMode={viewMode}
          viewDate={dateOffset}
          listCellWidth="300px"
          columnWidth={viewMode === ViewMode.Month ? 300 : viewMode === ViewMode.Week ? 150 : 65}
          barFill={75}
          rowHeight={42}
          headerHeight={50}
          onDateChange={handleDateChange}
          onClick={handleClick}
          TaskListHeader={TaskListHeader}
          TaskListTable={MemoizedTable}
          TooltipContent={GanttTooltip}
        />
      </div>
    </div>
  )
}
