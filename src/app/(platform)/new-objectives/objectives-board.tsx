'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/design-system'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  LayoutGrid, GitBranch, GanttChartSquare, Search, Target, X, Loader2,
  ChevronRight, ChevronDown, Flag, AlertTriangle, Plus, Waypoints, MessageSquare,
} from 'lucide-react'
import { AskSpecialistButton } from '@/components/specialists/ask-specialist-button'
import { useRegisterScreenContext } from '@/contexts/screen-context'
import type { SpecialistContext } from '@/components/specialists/types'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
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
import { StrategyHealthBar } from './strategy-health-bar'
import { ObjectiveCard } from './objective-card'
import { ObjectiveDetailPanel } from './objective-detail-panel'
import { ObjectivesTreeView } from './objectives-tree-view'
import { getStrategyColor } from './strategy-colors'
import { CreateObjectiveDialog } from '../objectives/create-objective-dialog'
import dynamic from 'next/dynamic'
import { EditObjectiveDialog } from '@/components/objectives/edit-objective-dialog'
import { EditTaskDialog } from '@/components/tasks/edit-task-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { TaskDetailPanel } from '../new-tasks/task-detail-panel'

const ObjectivesGanttView = dynamic(
  () => import('./gantt-view').then((m) => ({ default: m.ObjectivesGanttView })),
  { ssr: false, loading: () => <Skeleton className="w-full h-[500px] rounded-lg" /> },
)
import { deleteObjective, linkObjectiveToStrategic } from '@/actions/objectives'
import { toast } from 'sonner'
import { WeeklyDigestPanel } from './weekly-digest'
import { TeamPulseDashboard } from './team-pulse'
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import type { Database } from '@/types/database.types'
import type { ObjectiveWithTasks, ObjectiveTask, Member, Team, StrategicObjective } from './types'
import type { TaskWithData } from '../new-tasks/types'

const LARGE_BREAKPOINT = 1280
const MEDIUM_BREAKPOINT = 768

/** Map an ObjectiveTask to the TaskWithData shape expected by TaskDetailPanel */
function toTaskWithData(task: ObjectiveTask, parentObjective: ObjectiveWithTasks): TaskWithData {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    task_number: task.task_number,
    status: task.status,
    assignee_id: task.assignee_id,
    creator_id: task.creator_id,
    start_date: task.start_date,
    end_date: task.end_date,
    risk_level: task.risk_level,
    progress: task.progress,
    objective_id: task.objective_id,
    foundry_id: task.foundry_id,
    is_private: task.is_private,
    created_at: task.created_at,
    // Fields not available in ObjectiveTask -- safe defaults
    updated_at: task.created_at,
    amendment_notes: null,
    rejection_reason: null,
    nudge_count: null,
    client_visible: null,
    message_count: 0,
    assignee: task.assignee,
    creator: null,
    objective: { id: parentObjective.id, title: parentObjective.title },
    strategy: parentObjective.strategy ?? null,
    assignees: task.assignees,
    task_files: [],
  }
}

interface ObjectivesBoardProps {
  objectives: ObjectiveWithTasks[]
  /** High-level strategic objectives that regular objectives can be grouped under */
  strategicObjectives: StrategicObjective[]
  objectivesForDialog: { id: string; title: string }[]
  members: Member[]
  teams: Team[]
  currentUserId: string
  currentUserRole: string | null
}

type ViewMode = 'board' | 'tree' | 'timeline'

export function ObjectivesBoard({
  objectives,
  strategicObjectives,
  objectivesForDialog,
  members,
  teams,
  currentUserId,
  currentUserRole,
}: ObjectivesBoardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('board')
  const [healthFilter, setHealthFilter] = useState<string | null>(null)
  const [strategicFilter, setStrategicFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1400)
  const [objectiveToDelete, setObjectiveToDelete] = useState<string | null>(null)
  const [deleteChildAction, setDeleteChildAction] = useState<'keep' | 'cascade'>('keep')
  const [objectiveToEdit, setObjectiveToEdit] = useState<ObjectiveWithTasks | null>(null)
  const [taskToEdit, setTaskToEdit] = useState<TaskWithData | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  // Track window width for responsive layout
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setShowSearch(true)
      }
      if (e.key === 'Escape') {
        if (showSearch) setShowSearch(false)
        else if (selectedTaskId) setSelectedTaskId(null)
        else if (selectedId) setSelectedId(null)
      }
      // Cmd+N / Ctrl+N — open create objective dialog
      if (e.key === 'n' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCreateDialogOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSearch, selectedId, selectedTaskId])

  // Compute health stats
  const stats = useMemo(() => {
    const total = objectives.length
    const onTrack = objectives.filter(o => o.health === 'on-track').length
    const atRisk = objectives.filter(o => o.health === 'at-risk').length
    const offTrack = objectives.filter(o => o.health === 'off-track').length
    const completed = objectives.filter(o => o.health === 'completed').length
    return { total, onTrack, atRisk, offTrack, completed }
  }, [objectives])

  // Register screen context so specialists know what the user is viewing
  useRegisterScreenContext(useMemo(() => ({
    pageTitle: 'Objectives Board',
    summary: `Viewing ${stats.total} objectives. ${stats.onTrack} on track, ${stats.atRisk} at risk, ${stats.offTrack} off track, ${stats.completed} completed.${selectedId ? ` Currently focused on objective "${objectives.find(o => o.id === selectedId)?.title ?? 'Unknown'}".` : ''}`,
    entities: objectives.map(o => ({
      type: 'objective',
      title: o.title,
      status: o.health,
      progress: o.progress ?? undefined,
    })),
  }), [objectives, stats, selectedId]))

  // Filter objectives
  const filteredObjectives = useMemo(() => {
    let result = objectives

    // Strategic objective filter
    if (strategicFilter) {
      result = result.filter(o => o.parent_objective_id === strategicFilter)
    }

    // Health filter
    if (healthFilter) {
      result = result.filter(o => o.health === healthFilter)
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(o =>
        o.title.toLowerCase().includes(q) ||
        o.description?.toLowerCase().includes(q)
      )
    }

    return result
  }, [objectives, strategicFilter, healthFilter, searchQuery])

  const selectedObjective = useMemo(
    () => objectives.find(o => o.id === selectedId) || null,
    [objectives, selectedId]
  )

  const handleSelect = useCallback((id: string) => {
    setSelectedTaskId(null) // clear task selection when selecting an objective
    setSelectedId(prev => prev === id ? null : id)
  }, [])

  const handleTaskSelect = useCallback((taskId: string) => {
    setSelectedId(null) // clear objective selection when selecting a task
    setSelectedTaskId(prev => prev === taskId ? null : taskId)
  }, [])

  const handleTaskEdit = useCallback((task: TaskWithData) => {
    setTaskToEdit(task)
  }, [])

  // Count children of the objective being deleted (for the confirmation dialog)
  const childrenOfDeleteTarget = useMemo(() => {
    if (!objectiveToDelete) return []
    return objectives.filter(o => o.parent_objective_id === objectiveToDelete)
  }, [objectiveToDelete, objectives])

  const handleDelete = useCallback(async () => {
    if (!objectiveToDelete) return

    setIsDeleting(true)
    try {
      const result = await deleteObjective(objectiveToDelete, deleteChildAction)

      if (result?.error) {
        toast.error(result.error)
      } else {
        toast.success('Objective deleted')
        setObjectiveToDelete(null)
        setDeleteChildAction('keep')
        // Clear selection if deleted objective was selected
        if (selectedId === objectiveToDelete) {
          setSelectedId(null)
        }
      }
    } catch (error) {
      toast.error('Failed to delete objective')
    } finally {
      setIsDeleting(false)
    }
  }, [objectiveToDelete, selectedId, deleteChildAction])

  // Find the selected task and its parent objective
  const selectedTaskData: TaskWithData | null = useMemo(() => {
    if (!selectedTaskId) return null
    for (const obj of objectives) {
      const task = obj.tasks.find(t => t.id === selectedTaskId)
      if (task) return toTaskWithData(task, obj)
    }
    return null
  }, [objectives, selectedTaskId])

  const isLarge = windowWidth >= LARGE_BREAKPOINT
  const hasDetailPanel = (selectedObjective || selectedTaskData) && isLarge

  return (
    <div className="space-y-6">
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!objectiveToDelete} onOpenChange={(open) => {
        if (!open) {
          setObjectiveToDelete(null)
          setDeleteChildAction('keep')
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Objective?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  This will permanently delete this objective and its tasks.
                  This action cannot be undone.
                </p>

                {childrenOfDeleteTarget.length > 0 && (
                  <div className="rounded-md border border-status-warning bg-status-warning-light p-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-status-warning-dark mt-0.5 shrink-0" />
                      <p className="text-sm text-status-warning-dark font-medium">
                        This objective has {childrenOfDeleteTarget.length} sub-objective{childrenOfDeleteTarget.length > 1 ? 's' : ''}.
                        What should happen to {childrenOfDeleteTarget.length > 1 ? 'them' : 'it'}?
                      </p>
                    </div>

                    <RadioGroup
                      value={deleteChildAction}
                      onValueChange={(v) => setDeleteChildAction(v as 'keep' | 'cascade')}
                      className="space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <RadioGroupItem value="keep" id="keep-children" className="mt-0.5" />
                        <Label htmlFor="keep-children" className="text-sm font-normal leading-snug cursor-pointer">
                          <span className="font-medium">Keep them</span> — sub-objectives become standalone top-level objectives
                        </Label>
                      </div>
                      <div className="flex items-start gap-2">
                        <RadioGroupItem value="cascade" id="cascade-children" className="mt-0.5" />
                        <Label htmlFor="cascade-children" className="text-sm font-normal leading-snug cursor-pointer">
                          <span className="font-medium">Delete them too</span> — permanently remove all {childrenOfDeleteTarget.length} sub-objective{childrenOfDeleteTarget.length > 1 ? 's' : ''} and their tasks
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 focus:ring-destructive"
              onClick={async (e) => {
                // Prevent dialog from closing until async delete completes
                e.preventDefault()
                await handleDelete()
              }}
              disabled={isDeleting}
            >
              {isDeleting ? (
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

      {/* Edit Objective Dialog */}
      {objectiveToEdit && (
        <EditObjectiveDialog
          open={!!objectiveToEdit}
          onOpenChange={(open) => !open && setObjectiveToEdit(null)}
          objective={{
            id: objectiveToEdit.id,
            title: objectiveToEdit.title,
            description: objectiveToEdit.description,
            extended_description: objectiveToEdit.extended_description,
            is_private: objectiveToEdit.is_private,
            creator_id: objectiveToEdit.creator_id,
          }}
          members={members}
          teams={teams}
          currentUserId={currentUserId}
        />
      )}

      {/* Edit Task Dialog */}
      {taskToEdit && (
        <EditTaskDialog
          open={!!taskToEdit}
          onOpenChange={(open) => !open && setTaskToEdit(null)}
          task={taskToEdit as unknown as Database['public']['Tables']['tasks']['Row']}
          members={members.map(m => ({ id: m.id, full_name: m.full_name, role: m.role ?? '' }))}
        />
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Cascade breadcrumb */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <Link href="/plan" className="hover:text-foreground transition-colors">Plan</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">Objectives</span>
          </nav>
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Objectives</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Your objectives, grouped by strategy
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AskSpecialistButton
            context={{
              type: 'objective',
              title: 'Objectives Planning',
              description: 'Discuss which objectives to set, prioritize, or adjust',
              metadata: {
                objectives: objectives.map(o => ({
                  title: o.title,
                  health: o.health,
                  progress: o.progress,
                })),
                notes: `${stats.total} objectives: ${stats.onTrack} on track, ${stats.atRisk} at risk, ${stats.offTrack} off track, ${stats.completed} completed`,
              },
            }}
            specialistId="strategist"
            specialistName="Sage"
            label="Plan with Sage"
          />
          {strategicObjectives.length > 0 && (
            <Link
              href="/strategy"
              className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-international-orange transition-colors"
            >
              <Waypoints className="h-3.5 w-3.5" />
              Strategy River
            </Link>
          )}
          <WeeklyDigestPanel />
          <CreateObjectiveDialog externalOpen={createDialogOpen} onExternalOpenChange={setCreateDialogOpen} />
        </div>
      </div>

      {/* Team Pulse */}
      <TeamPulseDashboard />

      {/* Strategy Health Bar */}
      <StrategyHealthBar
        total={stats.total}
        onTrack={stats.onTrack}
        atRisk={stats.atRisk}
        offTrack={stats.offTrack}
        completed={stats.completed}
        activeFilter={healthFilter}
        onFilterChange={setHealthFilter}
      />

      {/* Toolbar: View tabs + Strategy Filter + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="h-9">
              <TabsTrigger value="board" className="text-xs gap-1.5 px-3">
                <LayoutGrid className="h-3.5 w-3.5" />
                Board
              </TabsTrigger>
              <TabsTrigger value="tree" className="text-xs gap-1.5 px-3">
                <GitBranch className="h-3.5 w-3.5" />
                Tree
              </TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs gap-1.5 px-3">
                <GanttChartSquare className="h-3.5 w-3.5" />
                Timeline
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Strategy filter dropdown */}
          {strategicObjectives.length > 0 && (
            <select
              value={strategicFilter || ''}
              onChange={(e) => setStrategicFilter(e.target.value || null)}
              className="h-8 text-xs border rounded-md bg-background px-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label="Filter by strategy"
            >
              <option value="">All Strategies</option>
              {strategicObjectives.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-2">
          {showSearch ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                placeholder="Search objectives..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-full sm:w-48 text-sm"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => { setShowSearch(false); setSearchQuery('') }}
                aria-label="Close search"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => setShowSearch(true)}
            >
              <Search className="h-3.5 w-3.5 mr-1.5" />
              Search
              <kbd className="ml-2 text-[10px] bg-muted px-1 py-0.5 rounded hidden sm:inline">/</kbd>
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex gap-6">
        {/* Left: View content */}
        <div className={cn('flex-1 min-w-0', hasDetailPanel && 'max-w-[calc(100%-380px)]')}>
          {viewMode === 'board' && (
            <BoardView
              objectives={filteredObjectives}
              strategicObjectives={strategicObjectives}
              selectedId={selectedId}
              onSelect={handleSelect}
              onEdit={setObjectiveToEdit}
              onDelete={setObjectiveToDelete}
              onCreateNew={() => setCreateDialogOpen(true)}
            />
          )}
          {viewMode === 'tree' && (
            <ObjectivesTreeView
              objectives={filteredObjectives}
              strategicObjectives={strategicObjectives}
              selectedId={selectedId}
              onSelect={handleSelect}
              onEdit={setObjectiveToEdit}
              onDelete={setObjectiveToDelete}
              onCreateNew={() => setCreateDialogOpen(true)}
            />
          )}
          {viewMode === 'timeline' && (
            <ObjectivesGanttView
              objectives={filteredObjectives}
              strategicObjectives={strategicObjectives}
              selectedId={selectedId}
              onSelect={handleSelect}
              onTaskSelect={handleTaskSelect}
              onCreateNew={() => setCreateDialogOpen(true)}
            />
          )}
        </div>

        {/* Right: Detail panel */}
        {hasDetailPanel && (
          <div className="w-[360px] min-w-0 max-w-[360px] flex-shrink-0 rounded-xl border overflow-hidden h-[calc(100dvh-300px)] sticky top-8">
            {selectedTaskData ? (
              <TaskDetailPanel
                task={selectedTaskData}
                onClose={() => setSelectedTaskId(null)}
                onEdit={handleTaskEdit}
              />
            ) : selectedObjective ? (
              <ObjectiveDetailPanel
                objective={selectedObjective}
                onClose={() => setSelectedId(null)}
                onTaskSelect={handleTaskSelect}
                onEdit={setObjectiveToEdit}
              />
            ) : null}
          </div>
        )}
      </div>

      {/* Mobile detail: Full-screen overlay */}
      {selectedTaskData && !isLarge && (
        <div className="fixed inset-0 z-50 bg-background">
          <TaskDetailPanel
            task={selectedTaskData}
            onClose={() => setSelectedTaskId(null)}
            onEdit={handleTaskEdit}
          />
        </div>
      )}
      {selectedObjective && !selectedTaskData && !isLarge && (
        <div className="fixed inset-0 z-50 bg-background">
          <ObjectiveDetailPanel
            objective={selectedObjective}
            onClose={() => setSelectedId(null)}
            onTaskSelect={handleTaskSelect}
            onEdit={setObjectiveToEdit}
          />
        </div>
      )}
    </div>
  )
}

// ─── Drag-and-Drop Helpers ────────────────────────────────────────

/**
 * Wrapper that makes an ObjectiveCard draggable via @dnd-kit.
 *
 * @description Applies useDraggable to the card so it can be picked up
 * and dropped onto strategy sections or the unlinked zone.
 */
function DraggableObjectiveCard(props: {
  objective: ObjectiveWithTasks
  strategicObjectives: StrategicObjective[]
  isSelected: boolean
  onSelect: (id: string) => void
  onEdit?: (objective: ObjectiveWithTasks) => void
  onDelete?: (objectiveId: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: props.objective.id,
    data: { objective: props.objective },
  })

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="outline-none">
      <ObjectiveCard {...props} isDragging={isDragging} />
    </div>
  )
}

/**
 * Droppable zone representing a strategy section.
 *
 * @description Uses useDroppable so objective cards can be dropped here
 * to link them to this strategic objective. Shows a visual highlight
 * when a card is being dragged over this section.
 */
function DroppableStrategySection({
  strategy,
  index,
  isCollapsed,
  onToggleCollapse,
  objectiveCount,
  isDragActive,
  children,
}: {
  strategy: StrategicObjective
  index: number
  isCollapsed: boolean
  onToggleCollapse: () => void
  objectiveCount: number
  isDragActive: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `strategy-${strategy.id}`,
    data: { strategyId: strategy.id },
  })

  const color = getStrategyColor(index)
  const showDropHighlight = isOver && isDragActive

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-xl border-l-4 p-4 space-y-3 transition-all duration-200',
        color.border,
        color.bg,
        showDropHighlight && 'ring-2 ring-international-orange/30 shadow-lg scale-[1.005]',
      )}
    >
      {/* Strategy header */}
      <button
        onClick={onToggleCollapse}
        className="flex items-center gap-2 w-full text-left group"
      >
        {isCollapsed ? (
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
        )}
        <Flag className={cn('h-3.5 w-3.5', color.icon)} />
        <span className="text-sm font-semibold text-foreground">
          {strategy.title}
        </span>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
          {objectiveCount}
        </span>
      </button>

      {/* Content (grid or empty message) */}
      {!isCollapsed && children}

      {/* Drop hint when collapsed and dragging over */}
      {isCollapsed && showDropHighlight && (
        <p className="text-xs text-international-orange font-medium py-1 animate-pulse">
          Drop here to link
        </p>
      )}
    </div>
  )
}

/**
 * Droppable zone for the "Unlinked Objectives" section.
 *
 * @description Dropping a card here unlinks it from any strategy.
 * Always visible during an active drag so users can unlink objectives.
 */
function DroppableUnlinkedSection({
  objectiveCount,
  isDragActive,
  children,
}: {
  objectiveCount: number
  isDragActive: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'unlinked',
    data: { strategyId: null },
  })

  const showDropHighlight = isOver && isDragActive

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'space-y-3 rounded-xl p-4 transition-all duration-200',
        showDropHighlight && 'ring-2 ring-muted-foreground/30 bg-muted/40 scale-[1.005]',
        isDragActive && !showDropHighlight && 'bg-muted/20',
      )}
    >
      <div className="flex items-center gap-2">
        <div className="h-4 w-4" />
        <span className="text-sm font-semibold text-muted-foreground">
          Unlinked Objectives
        </span>
        {objectiveCount > 0 && (
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
            {objectiveCount}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── Board View ───────────────────────────────────────────────────

/**
 * Board view: 3-tier hierarchy — Strategy > Objectives > Tasks (via cards).
 *
 * @description Groups objectives under their linked strategic objectives
 * with drag-and-drop support. Users can drag objective cards between
 * strategy sections (or to "Unlinked") to change their strategic linkage.
 */
function BoardView({
  objectives,
  strategicObjectives,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onCreateNew,
}: {
  objectives: ObjectiveWithTasks[]
  strategicObjectives: StrategicObjective[]
  selectedId: string | null
  onSelect: (id: string) => void
  onEdit?: (objective: ObjectiveWithTasks) => void
  onDelete?: (objectiveId: string) => void
  onCreateNew?: () => void
}) {
  const [collapsedStrategies, setCollapsedStrategies] = useState<Set<string>>(new Set())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [pendingLinks, setPendingLinks] = useState<Map<string, string | null>>(new Map())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const toggleCollapse = useCallback((strategyId: string) => {
    setCollapsedStrategies(prev => {
      const next = new Set(prev)
      if (next.has(strategyId)) next.delete(strategyId)
      else next.add(strategyId)
      return next
    })
  }, [])

  // Apply optimistic overrides for pending link operations
  const effectiveObjectives = useMemo(() => {
    if (pendingLinks.size === 0) return objectives
    return objectives.map(obj => {
      const override = pendingLinks.get(obj.id)
      if (override !== undefined) {
        return { ...obj, parent_objective_id: override }
      }
      return obj
    })
  }, [objectives, pendingLinks])

  // Group objectives by strategy (using effective/optimistic data)
  const { grouped, unlinked } = useMemo(() => {
    const result: { strategy: StrategicObjective; objectives: ObjectiveWithTasks[] }[] = []
    const orphaned: ObjectiveWithTasks[] = []

    const stratMap = new Map<string, ObjectiveWithTasks[]>()
    for (const obj of effectiveObjectives) {
      if (obj.parent_objective_id && strategicObjectives.some(s => s.id === obj.parent_objective_id)) {
        const existing = stratMap.get(obj.parent_objective_id) || []
        existing.push(obj)
        stratMap.set(obj.parent_objective_id, existing)
      } else {
        orphaned.push(obj)
      }
    }

    for (const strat of strategicObjectives) {
      result.push({
        strategy: strat,
        objectives: stratMap.get(strat.id) || [],
      })
    }

    return { grouped: result, unlinked: orphaned }
  }, [effectiveObjectives, strategicObjectives])

  // Find the active objective for DragOverlay
  const activeObjective = activeId ? objectives.find(o => o.id === activeId) ?? null : null

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (!over) return

    const objectiveId = active.id as string
    const objective = objectives.find(o => o.id === objectiveId)
    if (!objective) return

    // Determine target strategy ID from droppable ID
    const droppableId = over.id as string
    let targetStrategyId: string | null = null

    if (droppableId === 'unlinked') {
      targetStrategyId = null
    } else if (droppableId.startsWith('strategy-')) {
      targetStrategyId = droppableId.replace('strategy-', '')
    } else {
      return
    }

    // Determine current strategy (null if unlinked)
    const currentStrategyId =
      objective.parent_objective_id &&
      strategicObjectives.some(s => s.id === objective.parent_objective_id)
        ? objective.parent_objective_id
        : null

    // No change — skip server call
    if (targetStrategyId === currentStrategyId) return

    // Optimistic update — move card immediately
    setPendingLinks(prev => new Map(prev).set(objectiveId, targetStrategyId))

    const result = await linkObjectiveToStrategic(objectiveId, targetStrategyId)

    // Clear optimistic override (revalidated server data takes over)
    setPendingLinks(prev => {
      const next = new Map(prev)
      next.delete(objectiveId)
      return next
    })

    if (result.error) {
      toast.error(result.error)
    } else {
      const targetName = targetStrategyId
        ? strategicObjectives.find(s => s.id === targetStrategyId)?.title
        : null
      toast.success(targetName ? `Linked to "${targetName}"` : 'Unlinked from strategy')
    }
  }, [objectives, strategicObjectives])

  // ─── Empty state ─────────────────────────────────────

  if (objectives.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
          <Target className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">Goals that move the needle</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Objectives break your strategy into measurable milestones. Create your first to start tracking real progress toward what matters most.
        </p>
        {onCreateNew && (
          <Button onClick={onCreateNew} className="mt-4 bg-international-orange hover:bg-international-orange-hover">
            <Plus className="h-4 w-4 mr-2" />
            Create Objective
          </Button>
        )}
      </div>
    )
  }

  // ─── Flat grid when no strategies exist (no DnD needed) ──────────

  if (strategicObjectives.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {objectives.map(obj => (
          <ObjectiveCard
            key={obj.id}
            objective={obj}
            strategicObjectives={strategicObjectives}
            isSelected={selectedId === obj.id}
            onSelect={onSelect}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    )
  }

  // ─── Strategy-grouped board with drag-and-drop ───────────────────

  const isDragActive = activeId !== null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="space-y-6">
        {/* Strategy color legend */}
        {grouped.length > 1 && (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-muted-foreground font-medium text-xs">Strategies:</span>
            {grouped.map(({ strategy }, index) => {
              const color = getStrategyColor(index)
              return (
                <div key={strategy.id} className="flex items-center gap-2">
                  <div className={cn('h-2 w-8 rounded-full', color.swatch)} />
                  <span className="text-muted-foreground text-xs">{strategy.title}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Strategy sections — each is a droppable zone */}
        {grouped.map(({ strategy, objectives: stratObjectives }, index) => (
          <DroppableStrategySection
            key={strategy.id}
            strategy={strategy}
            index={index}
            isCollapsed={collapsedStrategies.has(strategy.id)}
            onToggleCollapse={() => toggleCollapse(strategy.id)}
            objectiveCount={stratObjectives.length}
            isDragActive={isDragActive}
          >
            {stratObjectives.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {stratObjectives.map(obj => (
                  <DraggableObjectiveCard
                    key={obj.id}
                    objective={obj}
                    strategicObjectives={strategicObjectives}
                    isSelected={selectedId === obj.id}
                    onSelect={onSelect}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-2">
                {isDragActive ? 'Drop here to link' : 'No objectives linked to this strategy yet.'}
              </p>
            )}
          </DroppableStrategySection>
        ))}

        {/* Unlinked objectives — always visible during drag for unlinking */}
        {(unlinked.length > 0 || isDragActive) && (
          <DroppableUnlinkedSection
            objectiveCount={unlinked.length}
            isDragActive={isDragActive}
          >
            {unlinked.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {unlinked.map(obj => (
                  <DraggableObjectiveCard
                    key={obj.id}
                    objective={obj}
                    strategicObjectives={strategicObjectives}
                    isSelected={selectedId === obj.id}
                    onSelect={onSelect}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-2">
                Drop here to unlink from strategy
              </p>
            )}
          </DroppableUnlinkedSection>
        )}
      </div>

      {/* Drag overlay — follows cursor during drag */}
      <DragOverlay dropAnimation={null}>
        {activeObjective ? (
          <div className="w-80">
            <ObjectiveCard
              objective={activeObjective}
              strategicObjectives={strategicObjectives}
              isSelected={false}
              onSelect={() => {}}
              isDragOverlay
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

