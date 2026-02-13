'use client'

/**
 * BoardView — Kanban board for tasks with drag-and-drop.
 *
 * @description Renders tasks in status columns (Pending, In Progress, In Review, Completed)
 * with drag-and-drop support using @dnd-kit. Dragging a card between columns
 * updates the task status optimistically.
 *
 * @component
 */

import { useState, useMemo, useCallback, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { UserAvatar } from '@/components/ui/user-avatar'
import { AlertTriangle, MessageSquare, Paperclip, GripVertical } from 'lucide-react'
import { toast } from 'sonner'
import { useCelebration } from '@/hooks/useCelebration'
import type { TaskWithData } from './types'

// ─── Types ────────────────────────────────────────────────────────

interface BoardViewProps {
  /** Tasks to display on the board */
  tasks: TaskWithData[]
  /** Currently selected task ID */
  selectedId: string | null
  /** Callback when a task is selected */
  onSelect: (id: string) => void
}

interface BoardColumn {
  key: string
  label: string
  statuses: string[]
  color: string
  dotColor: string
}

// ─── Column Definitions ───────────────────────────────────────────

const COLUMNS: BoardColumn[] = [
  {
    key: 'pending',
    label: 'Pending',
    statuses: ['Pending'],
    color: 'border-t-muted-foreground/40',
    dotColor: 'bg-muted-foreground',
  },
  {
    key: 'accepted',
    label: 'In Progress',
    statuses: ['Accepted'],
    color: 'border-t-status-info',
    dotColor: 'bg-status-info',
  },
  {
    key: 'review',
    label: 'In Review',
    statuses: ['Pending_Peer_Review', 'Pending_Executive_Approval', 'Amended_Pending_Approval'],
    color: 'border-t-status-warning',
    dotColor: 'bg-status-warning',
  },
  {
    key: 'completed',
    label: 'Completed',
    statuses: ['Completed'],
    color: 'border-t-status-success',
    dotColor: 'bg-status-success',
  },
]

/** Map column key to the target status when dropping */
const COLUMN_TO_STATUS: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  review: 'Pending_Peer_Review',
  completed: 'Completed',
}

// ─── Draggable Board Card ─────────────────────────────────────────

interface SortableBoardCardProps {
  task: TaskWithData
  isSelected: boolean
  onSelect: (id: string) => void
  isDragOverlay?: boolean
}

function SortableBoardCard({ task, isSelected, onSelect, isDragOverlay }: SortableBoardCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const isOverdue = task.end_date && task.status !== 'Completed' && new Date(task.end_date) < new Date()

  return (
    <div
      ref={setNodeRef}
      style={isDragOverlay ? undefined : style}
      className={cn(
        'w-full text-left bg-background rounded-lg border p-3 space-y-2 transition-all duration-200',
        'hover:shadow-md hover:-translate-y-0.5',
        isDragging && 'opacity-30',
        isDragOverlay && 'shadow-xl rotate-1 scale-105',
        isSelected
          ? 'ring-2 ring-international-orange/30 shadow-md'
          : 'hover:border-foreground/10',
      )}
    >
      <div className="flex items-start gap-1.5">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {/* Content - clickable for selection */}
        <button
          onClick={() => onSelect(task.id)}
          className="flex-1 text-left min-w-0"
        >
          <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">
            {task.title}
          </p>
        </button>
      </div>

      {/* Objective tag */}
      {task.objective && (
        <span className="inline-block text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full truncate max-w-full">
          {task.objective.title}
        </span>
      )}

      {/* Bottom row: assignee, date, indicators */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Assignee */}
          {(() => {
            const primary = task.assignees?.length > 0 ? task.assignees[0] : task.assignee
            return primary?.full_name ? (
              <UserAvatar name={primary.full_name} role={primary.role} size="xs" />
            ) : null
          })()}

          {/* Risk badge */}
          {task.risk_level && task.risk_level !== 'Low' && (
            <Badge variant="outline" className={cn(
              'text-[9px] px-1.5',
              task.risk_level === 'High' ? 'border-status-error/30 text-status-error' : 'border-status-warning/30 text-status-warning'
            )}>
              {task.risk_level}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {task.message_count > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <MessageSquare className="h-3 w-3" />
              {task.message_count}
            </span>
          )}
          {task.task_files.length > 0 && (
            <Paperclip className="h-3 w-3" />
          )}
          {task.end_date && (
            <span className={cn(
              'tabular-nums inline-flex items-center gap-0.5',
              isOverdue ? 'text-status-error font-medium' : ''
            )}>
              {isOverdue && <AlertTriangle className="h-3 w-3" />}
              {new Date(task.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Droppable Column ─────────────────────────────────────────────

interface DroppableColumnProps {
  column: BoardColumn & { tasks: TaskWithData[] }
  selectedId: string | null
  onSelect: (id: string) => void
  isOver: boolean
}

function DroppableColumn({ column, selectedId, onSelect, isOver }: DroppableColumnProps) {
  const { setNodeRef } = useDroppable({ id: column.key })

  return (
    <div key={column.key} className="flex flex-col">
      {/* Column header */}
      <div className={cn('bg-background rounded-t-xl border border-b-0 border-t-2 px-4 py-3', column.color)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn('h-2 w-2 rounded-full', column.dotColor)} />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
              {column.label}
            </span>
          </div>
          <span className="text-xs font-medium tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {column.tasks.length}
          </span>
        </div>
      </div>

      {/* Column body */}
      <div
        ref={setNodeRef}
        className={cn(
          'bg-muted/20 rounded-b-xl border border-t-0 p-2 flex-1 min-h-[200px] transition-colors duration-200',
          isOver && 'bg-international-orange/5 border-international-orange/20',
        )}
      >
        <ScrollArea className="h-[calc(100dvh-420px)]">
          <SortableContext
            items={column.tasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {column.tasks.length === 0 ? (
                <div className={cn(
                  'text-center py-8 text-xs text-muted-foreground rounded-lg border-2 border-dashed transition-colors',
                  isOver ? 'border-international-orange/30 bg-international-orange/5' : 'border-transparent',
                )}>
                  {isOver ? 'Drop here' : 'No tasks'}
                </div>
              ) : (
                column.tasks.map(task => (
                  <SortableBoardCard
                    key={task.id}
                    task={task}
                    isSelected={selectedId === task.id}
                    onSelect={onSelect}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </ScrollArea>
      </div>
    </div>
  )
}

// ─── Main Board Component ─────────────────────────────────────────

export function BoardView({ tasks, selectedId, onSelect }: BoardViewProps) {
  const { celebrateTaskComplete } = useCelebration()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overColumnKey, setOverColumnKey] = useState<string | null>(null)
  const [optimisticTasks, setOptimisticTasks] = useState<Map<string, string>>(new Map())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  // Apply optimistic status overrides
  const effectiveTasks = useMemo(() => {
    if (optimisticTasks.size === 0) return tasks
    return tasks.map((t) => {
      const override = optimisticTasks.get(t.id)
      if (override) return { ...t, status: override }
      return t
    })
  }, [tasks, optimisticTasks])

  const columns = useMemo(() => {
    return COLUMNS.map(col => ({
      ...col,
      tasks: effectiveTasks.filter(t => col.statuses.includes(t.status)),
    }))
  }, [effectiveTasks])

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overKey = event.over?.id as string | null
    // Only set if it's a column key
    if (overKey && COLUMNS.some((c) => c.key === overKey)) {
      setOverColumnKey(overKey)
    } else {
      // Check if we're over a task, find its column
      if (overKey) {
        for (const col of COLUMNS) {
          const colTasks = effectiveTasks.filter((t) => col.statuses.includes(t.status))
          if (colTasks.some((t) => t.id === overKey)) {
            setOverColumnKey(col.key)
            break
          }
        }
      }
    }
  }, [effectiveTasks])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveId(null)
    setOverColumnKey(null)

    const { active, over } = event
    if (!over) return

    const taskId = active.id as string
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    // Determine target column
    let targetColumnKey: string | null = null

    // Check if dropped on a column directly
    if (COLUMNS.some((c) => c.key === (over.id as string))) {
      targetColumnKey = over.id as string
    } else {
      // Dropped on a task — find which column it's in
      const overTask = effectiveTasks.find((t) => t.id === over.id)
      if (overTask) {
        const col = COLUMNS.find((c) => c.statuses.includes(overTask.status))
        if (col) targetColumnKey = col.key
      }
    }

    if (!targetColumnKey) return

    const newStatus = COLUMN_TO_STATUS[targetColumnKey]
    if (!newStatus) return

    // Check if status actually changed
    const currentColumn = COLUMNS.find((c) => c.statuses.includes(task.status))
    if (currentColumn?.key === targetColumnKey) return

    // Optimistic update
    setOptimisticTasks((prev) => new Map(prev).set(taskId, newStatus))

    // Celebrate completions
    if (newStatus === 'Completed') {
      celebrateTaskComplete(task.title)
    }

    // Server update
    try {
      const { updateTaskStatus } = await import('@/actions/tasks')
      const result = await updateTaskStatus(taskId, newStatus)
      if (result && 'error' in result && result.error) {
        // Revert optimistic update
        setOptimisticTasks((prev) => {
          const next = new Map(prev)
          next.delete(taskId)
          return next
        })
        toast.error(typeof result.error === 'string' ? result.error : 'Failed to update status')
      } else {
        // Clear optimistic override (server data will revalidate)
        setOptimisticTasks((prev) => {
          const next = new Map(prev)
          next.delete(taskId)
          return next
        })
      }
    } catch {
      // Revert on error
      setOptimisticTasks((prev) => {
        const next = new Map(prev)
        next.delete(taskId)
        return next
      })
      toast.error('Failed to update task status')
    }
  }, [tasks, effectiveTasks, celebrateTaskComplete])

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
    setOverColumnKey(null)
  }, [])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map(col => (
          <DroppableColumn
            key={col.key}
            column={col}
            selectedId={selectedId}
            onSelect={onSelect}
            isOver={overColumnKey === col.key}
          />
        ))}
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeTask ? (
          <SortableBoardCard
            task={activeTask}
            isSelected={false}
            onSelect={() => {}}
            isDragOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
