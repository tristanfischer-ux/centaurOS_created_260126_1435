'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/design-system'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  LayoutGrid, GitBranch, GanttChartSquare, Search, Target, X, Loader2,
  ChevronRight, ChevronDown, Flag, AlertTriangle,
} from 'lucide-react'
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
import { EditObjectiveDialog } from '@/components/objectives/edit-objective-dialog'
import { ObjectivesGanttView } from './gantt-view'
import { TaskDetailPanel } from '../new-tasks/task-detail-panel'
import { deleteObjective } from '@/actions/objectives'
import { toast } from 'sonner'
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
  const [isDeleting, setIsDeleting] = useState(false)

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
              onClick={handleDelete}
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

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Objectives</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Your objectives, grouped by strategy
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CreateObjectiveDialog />
        </div>
      </div>

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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
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
                className="h-8 w-48 text-sm"
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
              <kbd className="ml-2 text-[10px] bg-muted px-1 py-0.5 rounded">/</kbd>
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
            />
          )}
          {viewMode === 'timeline' && (
            <ObjectivesGanttView
              objectives={filteredObjectives}
              strategicObjectives={strategicObjectives}
              selectedId={selectedId}
              onSelect={handleSelect}
              onTaskSelect={handleTaskSelect}
            />
          )}
        </div>

        {/* Right: Detail panel */}
        {hasDetailPanel && (
          <div className="w-[360px] min-w-0 max-w-[360px] flex-shrink-0 rounded-xl border border-slate-100 overflow-hidden h-[calc(100dvh-300px)] sticky top-8">
            {selectedTaskData ? (
              <TaskDetailPanel
                task={selectedTaskData}
                onClose={() => setSelectedTaskId(null)}
              />
            ) : selectedObjective ? (
              <ObjectiveDetailPanel
                objective={selectedObjective}
                onClose={() => setSelectedId(null)}
              />
            ) : null}
          </div>
        )}
      </div>

      {/* Mobile detail: Full-screen overlay */}
      {selectedTaskData && !isLarge && (
        <div className="fixed inset-0 z-50 bg-white">
          <TaskDetailPanel
            task={selectedTaskData}
            onClose={() => setSelectedTaskId(null)}
          />
        </div>
      )}
      {selectedObjective && !selectedTaskData && !isLarge && (
        <div className="fixed inset-0 z-50 bg-white">
          <ObjectiveDetailPanel
            objective={selectedObjective}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}
    </div>
  )
}

// Board view: 3-tier hierarchy — Strategy > Objectives > Tasks (via cards)
function BoardView({
  objectives,
  strategicObjectives,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
}: {
  objectives: ObjectiveWithTasks[]
  strategicObjectives: StrategicObjective[]
  selectedId: string | null
  onSelect: (id: string) => void
  onEdit?: (objective: ObjectiveWithTasks) => void
  onDelete?: (objectiveId: string) => void
}) {
  const [collapsedStrategies, setCollapsedStrategies] = useState<Set<string>>(new Set())

  const toggleCollapse = useCallback((strategyId: string) => {
    setCollapsedStrategies(prev => {
      const next = new Set(prev)
      if (next.has(strategyId)) next.delete(strategyId)
      else next.add(strategyId)
      return next
    })
  }, [])

  // Group objectives by strategy
  const { grouped, unlinked } = useMemo(() => {
    const grouped: { strategy: StrategicObjective; objectives: ObjectiveWithTasks[] }[] = []
    const unlinked: ObjectiveWithTasks[] = []

    // Build a map of strategy ID → objectives
    const stratMap = new Map<string, ObjectiveWithTasks[]>()
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
      grouped.push({
        strategy: strat,
        objectives: stratMap.get(strat.id) || [],
      })
    }

    return { grouped, unlinked }
  }, [objectives, strategicObjectives])

  if (objectives.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <Target className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">No objectives found</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Create your first objective to start tracking progress.
        </p>
      </div>
    )
  }

  // If no strategies exist, render flat grid
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

  return (
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

      {/* Strategy sections */}
      {grouped.map(({ strategy, objectives: stratObjectives }, index) => {
        const isCollapsed = collapsedStrategies.has(strategy.id)
        const color = getStrategyColor(index)

        return (
          <div
            key={strategy.id}
            className={cn(
              'rounded-xl border-l-4 p-4 space-y-3 transition-colors',
              color.border,
              color.bg,
            )}
          >
            {/* Strategy header */}
            <button
              onClick={() => toggleCollapse(strategy.id)}
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
                {stratObjectives.length}
              </span>
            </button>

            {/* Objectives grid */}
            {!isCollapsed && (
              stratObjectives.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {stratObjectives.map(obj => (
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
              ) : (
                <p className="text-xs text-muted-foreground py-2">
                  No objectives linked to this strategy yet.
                </p>
              )
            )}
          </div>
        )
      })}

      {/* Unlinked objectives */}
      {unlinked.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4" /> {/* Spacer for alignment */}
            <span className="text-sm font-semibold text-muted-foreground">
              Unlinked Objectives
            </span>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
              {unlinked.length}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pl-6">
            {unlinked.map(obj => (
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
        </div>
      )}
    </div>
  )
}

