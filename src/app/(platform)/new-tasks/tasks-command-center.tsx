'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/design-system'
import { Button } from '@/components/ui/button'
import { HelpTooltip } from '@/components/ui/help-tooltip'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Crosshair, LayoutGrid, List, GanttChartSquare, Search,
  X, Group, Filter, Waypoints, ChevronRight, Sparkles,
} from 'lucide-react'
import { SmartSummary } from './smart-summary'
import { FocusView } from './focus-view'
import { BoardView } from './board-view'
import { ListView } from './list-view'
import { TaskDetailPanel } from './task-detail-panel'
import { CreateTaskDialog } from '../tasks/create-task-dialog'
import dynamic from 'next/dynamic'
import { EditTaskDialog } from '@/components/tasks/edit-task-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useRegisterScreenContext } from '@/contexts/screen-context'
import { DelegationProgressModal } from '@/components/tasks/delegation-progress-modal'

const TasksGanttView = dynamic(
  () => import('./gantt-view').then((m) => ({ default: m.TasksGanttView })),
  { ssr: false, loading: () => <Skeleton className="w-full h-[500px] rounded-lg" /> },
)
import type { TaskWithData, Member, Team } from './types'

const LARGE_BREAKPOINT = 1280

interface TasksCommandCenterProps {
  tasks: TaskWithData[]
  objectives: { id: string; title: string }[]
  /** Strategic objectives (pillars) for the strategy filter */
  strategicObjectives?: { id: string; title: string }[]
  members: Member[]
  teams: Team[]
  currentUserId: string
  currentUserRole: string | null
  initialTaskId?: string
  /** Products available for the Create Task dialog's optional product tag. */
  products?: { id: string; name: string }[]
}

type ViewMode = 'focus' | 'board' | 'list' | 'timeline'
type GroupBy = 'none' | 'objective' | 'status' | 'assignee' | 'strategy'

export function TasksCommandCenter({
  tasks,
  objectives,
  strategicObjectives = [],
  members,
  teams,
  currentUserId,
  currentUserRole,
  initialTaskId,
  products = [],
}: TasksCommandCenterProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('focus')
  const [quickFilter, setQuickFilter] = useState<string | null>(initialTaskId ? null : 'my-tasks')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId || null)
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [strategyFilter, setStrategyFilter] = useState<string | null>(null)
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1400)
  const [editingTask, setEditingTask] = useState<TaskWithData | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [delegationOpen, setDelegationOpen] = useState(false)
  const router = useRouter()

  // Pending task IDs for batch delegation
  const pendingTaskIds = useMemo(
    () => tasks.filter((t) => t.status === 'Pending').map((t) => t.id),
    [tasks],
  )

  // Track window width
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Refs for keyboard handler to avoid stale closures
  const filteredTasksRef = useRef<TaskWithData[]>([])
  const showSearchRef = useRef(showSearch)
  const selectedIdRef = useRef(selectedId)

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setShowSearch(true)
      }
      if (e.key === 'Escape') {
        if (showSearchRef.current) { setShowSearch(false); setSearchQuery('') }
        else if (selectedIdRef.current) setSelectedId(null)
      }
      // Cmd+N / Ctrl+N — open create task dialog
      if (e.key === 'n' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCreateDialogOpen(true)
      }
      // J/K navigation — uses ref to always have fresh filtered list
      if ((e.key === 'j' || e.key === 'k') && !e.metaKey && !e.ctrlKey) {
        const filtered = filteredTasksRef.current
        if (filtered.length === 0) return
        const currentIdx = filtered.findIndex(t => t.id === selectedIdRef.current)
        if (e.key === 'j') {
          const next = currentIdx < filtered.length - 1 ? currentIdx + 1 : 0
          setSelectedId(filtered[next].id)
        } else {
          const prev = currentIdx > 0 ? currentIdx - 1 : filtered.length - 1
          setSelectedId(filtered[prev].id)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Compute summary stats
  const stats = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const myTasks = tasks.filter(t =>
      t.status !== 'Completed' && t.status !== 'Rejected' &&
      (t.assignee_id === currentUserId || t.assignees?.some(a => a.id === currentUserId))
    )
    const dueToday = tasks.filter(t => {
      if (!t.end_date || t.status === 'Completed' || t.status === 'Rejected') return false
      const d = new Date(t.end_date)
      return d >= today && d < tomorrow
    })
    const overdue = tasks.filter(t => {
      if (!t.end_date || t.status === 'Completed' || t.status === 'Rejected') return false
      return new Date(t.end_date) < today
    })
    const needsReview = tasks.filter(t =>
      t.status === 'Pending_Peer_Review' || t.status === 'Pending_Executive_Approval'
    )

    return {
      totalTasks: tasks.length,
      myActiveTasks: myTasks.length,
      dueToday: dueToday.length,
      overdue: overdue.length,
      needsReview: needsReview.length,
    }
  }, [tasks, currentUserId])

  // Strategic context — how tasks connect to the bigger picture
  const strategicContext = useMemo(() => {
    const uniqueObjectives = new Set(tasks.filter(t => t.objective).map(t => t.objective!.id))
    const uniqueStrategies = new Set(tasks.filter(t => t.strategy).map(t => t.strategy!.id))
    return {
      objectiveCount: uniqueObjectives.size,
      strategyCount: uniqueStrategies.size,
    }
  }, [tasks])

  // Filter tasks
  const getFilteredTasks = useCallback(() => {
    let result = tasks
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Quick filter
    if (quickFilter === 'my-tasks') {
      result = result.filter(t =>
        t.status !== 'Completed' && t.status !== 'Rejected' &&
        (t.assignee_id === currentUserId || t.assignees?.some(a => a.id === currentUserId))
      )
    } else if (quickFilter === 'due-today') {
      result = result.filter(t => {
        if (!t.end_date || t.status === 'Completed' || t.status === 'Rejected') return false
        const d = new Date(t.end_date)
        return d >= today && d < tomorrow
      })
    } else if (quickFilter === 'overdue') {
      result = result.filter(t => {
        if (!t.end_date || t.status === 'Completed' || t.status === 'Rejected') return false
        return new Date(t.end_date) < today
      })
    } else if (quickFilter === 'needs-review') {
      result = result.filter(t =>
        t.status === 'Pending_Peer_Review' || t.status === 'Pending_Executive_Approval'
      )
    }

    // Strategy filter
    if (strategyFilter === '__unlinked__') {
      result = result.filter(t => !t.strategy)
    } else if (strategyFilter) {
      result = result.filter(t => t.strategy?.id === strategyFilter)
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.objective?.title?.toLowerCase().includes(q)
      )
    }

    return result
  }, [tasks, quickFilter, searchQuery, strategyFilter, currentUserId])

  const filteredTasks = useMemo(() => getFilteredTasks(), [getFilteredTasks])

  // Register screen context so specialists know what the user is viewing
  const taskStats = useMemo(() => {
    const todo = tasks.filter(t => t.status === 'To Do').length
    const inProgress = tasks.filter(t => t.status === 'In Progress').length
    const done = tasks.filter(t => t.status === 'Done').length
    const blocked = tasks.filter(t => t.status === 'Blocked').length
    return { total: tasks.length, todo, inProgress, done, blocked }
  }, [tasks])

  useRegisterScreenContext(useMemo(() => ({
    pageTitle: 'Tasks',
    summary: `Viewing ${taskStats.total} tasks. ${taskStats.inProgress} in progress, ${taskStats.todo} to do, ${taskStats.done} done, ${taskStats.blocked} blocked.${selectedId ? ` Currently focused on task "${tasks.find(t => t.id === selectedId)?.title ?? 'Unknown'}".` : ''} ${quickFilter === 'my-tasks' ? 'Filtered to my tasks.' : ''}`,
    entities: filteredTasks.slice(0, 20).map(t => ({
      type: 'task',
      title: t.title,
      status: t.status,
      progress: t.progress ?? undefined,
    })),
  }), [taskStats, tasks, filteredTasks, selectedId, quickFilter]))

  // Keep refs in sync for keyboard handler (avoids stale closures)
  filteredTasksRef.current = filteredTasks
  showSearchRef.current = showSearch
  selectedIdRef.current = selectedId

  const selectedTask = useMemo(
    () => tasks.find(t => t.id === selectedId) || null,
    [tasks, selectedId]
  )

  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id)
  }, [])

  const isLarge = windowWidth >= LARGE_BREAKPOINT
  const showDetailPanel = selectedTask && isLarge

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          {/* Cascade breadcrumb */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <Link href="/plan" className="hover:text-foreground transition-colors">Plan</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">Tasks</span>
          </nav>
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Tasks</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Your personal command center for getting things done
          </p>
          {/* Strategic context — shows how tasks connect to the bigger picture */}
          {strategicContext.strategyCount > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {stats.totalTasks} task{stats.totalTasks !== 1 ? 's' : ''} across{' '}
              {strategicContext.objectiveCount} objective{strategicContext.objectiveCount !== 1 ? 's' : ''} supporting{' '}
              {strategicContext.strategyCount} strateg{strategicContext.strategyCount !== 1 ? 'ies' : 'y'}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {strategicContext.strategyCount > 0 && (
            <Link
              href="/strategy"
              className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-international-orange transition-colors"
            >
              <Waypoints className="h-3.5 w-3.5" />
              Strategy River
            </Link>
          )}
          {pendingTaskIds.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDelegationOpen(true)}
              className="gap-1.5"
            >
              <Sparkles className="h-4 w-4" />
              Delegate to Specialists
            </Button>
          )}
          <div data-tour="tasks-create">
            <CreateTaskDialog
              objectives={objectives}
              members={members.map(m => ({ ...m, role: m.role || 'Member' }))}
              teams={teams}
              currentUserId={currentUserId}
              externalOpen={createDialogOpen}
              onExternalOpenChange={setCreateDialogOpen}
              products={products}
            />
          </div>
        </div>
      </div>

      {/* Smart Summary Pills */}
      <div data-tour="tasks-summary">
        <SmartSummary
          totalTasks={stats.totalTasks}
          dueToday={stats.dueToday}
          overdue={stats.overdue}
          needsReview={stats.needsReview}
          myActiveTasks={stats.myActiveTasks}
          activeFilter={quickFilter}
          onFilterChange={setQuickFilter}
        />
      </div>

      {/* Toolbar: View tabs + Search + Group By */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div data-tour="tasks-views">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="h-9">
              <TabsTrigger value="focus" className="text-xs gap-1.5 px-3">
                <Crosshair className="h-3.5 w-3.5" />
                Focus
              </TabsTrigger>
              <TabsTrigger value="board" className="text-xs gap-1.5 px-3">
                <LayoutGrid className="h-3.5 w-3.5" />
                Board
                <HelpTooltip content="Drag tasks between columns to change their status. Cards are ordered by priority." side="bottom" focusable={false} />
              </TabsTrigger>
              <TabsTrigger value="list" className="text-xs gap-1.5 px-3">
                <List className="h-3.5 w-3.5" />
                List
              </TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs gap-1.5 px-3">
                <GanttChartSquare className="h-3.5 w-3.5" />
                Timeline
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex items-center gap-2">
          {/* Strategy filter */}
          {strategicObjectives.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
                  <Waypoints className="h-3.5 w-3.5 mr-1.5" />
                  Strategy
                  {strategyFilter && (
                    <span className="ml-1 text-international-orange">
                      : {strategyFilter === '__unlinked__' ? 'Unlinked' : strategicObjectives.find(s => s.id === strategyFilter)?.title?.slice(0, 16) || ''}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-[11px]">Filter by Strategy</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setStrategyFilter(null)} className={!strategyFilter ? 'font-semibold' : ''}>
                  All Strategies
                </DropdownMenuItem>
                {strategicObjectives.map(so => (
                  <DropdownMenuItem
                    key={so.id}
                    onClick={() => setStrategyFilter(so.id)}
                    className={strategyFilter === so.id ? 'font-semibold' : ''}
                  >
                    {so.title}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setStrategyFilter('__unlinked__')}
                  className={strategyFilter === '__unlinked__' ? 'font-semibold' : ''}
                >
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-status-warning" />
                  Unlinked Tasks
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Group by (list view only) */}
          {viewMode === 'list' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground">
                  <Group className="h-3.5 w-3.5 mr-1.5" />
                  Group
                  {groupBy !== 'none' && (
                    <span className="ml-1 text-international-orange">: {groupBy}</span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-[11px]">Group Tasks By</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setGroupBy('none')} className={groupBy === 'none' ? 'font-semibold' : ''}>
                  No Grouping
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setGroupBy('objective')} className={groupBy === 'objective' ? 'font-semibold' : ''}>
                  Objective
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setGroupBy('status')} className={groupBy === 'status' ? 'font-semibold' : ''}>
                  Status
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setGroupBy('assignee')} className={groupBy === 'assignee' ? 'font-semibold' : ''}>
                  Assignee
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setGroupBy('strategy')} className={groupBy === 'strategy' ? 'font-semibold' : ''}>
                  Strategy
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Search */}
          {showSearch ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                placeholder="Search tasks..."
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
              <kbd className="ml-2 text-[10px] bg-muted px-1 py-0.5 rounded">/</kbd>
            </Button>
          )}
        </div>
      </div>

      {/* Results count */}
      <div className="text-xs text-muted-foreground">
        Showing {filteredTasks.length} of {tasks.length} tasks
        {strategyFilter && strategyFilter !== '__unlinked__' && (
          <span> in <span className="text-international-orange font-medium">{strategicObjectives.find(s => s.id === strategyFilter)?.title}</span></span>
        )}
        {strategyFilter === '__unlinked__' && <span> with <span className="text-status-warning font-medium">no strategic link</span></span>}
        {searchQuery && <span> matching &quot;{searchQuery}&quot;</span>}
      </div>

      {/* Main Content Area */}
      <div className="flex gap-6">
        {/* Left: View content */}
        <div className={cn('flex-1 min-w-0', showDetailPanel && 'max-w-[calc(100%-560px)]')}>
          {viewMode === 'focus' && (
            <FocusView
              tasks={filteredTasks}
              selectedId={selectedId}
              onSelect={handleSelect}
              onCreateNew={() => setCreateDialogOpen(true)}
            />
          )}
          {viewMode === 'board' && (
            <BoardView
              tasks={filteredTasks}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
          )}
          {viewMode === 'list' && (
            <ListView
              tasks={filteredTasks}
              selectedId={selectedId}
              onSelect={handleSelect}
              groupBy={groupBy}
            />
          )}
          {viewMode === 'timeline' && (
            <TasksGanttView
              tasks={filteredTasks}
              selectedId={selectedId}
              onSelect={handleSelect}
              onCreateNew={() => setCreateDialogOpen(true)}
            />
          )}
        </div>

        {/* Right: Detail panel */}
        {showDetailPanel && (
          <div className="hidden lg:block w-[540px] max-w-[540px] flex-shrink-0 rounded-xl border overflow-hidden h-[calc(100dvh-340px)] sticky top-8">
            <TaskDetailPanel
              task={selectedTask}
              onClose={() => setSelectedId(null)}
              onEdit={setEditingTask}
              members={members}
            />
          </div>
        )}
      </div>

      {/* Mobile detail: Full-screen overlay */}
      {selectedTask && !isLarge && (
        <div className="fixed inset-0 z-50 bg-background">
          <TaskDetailPanel
            task={selectedTask}
            onClose={() => setSelectedId(null)}
            onEdit={setEditingTask}
            members={members}
          />
        </div>
      )}

      {/* Edit Task Dialog */}
      {editingTask && (
        <EditTaskDialog
          open={!!editingTask}
          onOpenChange={(open) => { if (!open) setEditingTask(null) }}
          task={editingTask as any}
          members={members.map(m => ({ id: m.id, full_name: m.full_name, role: m.role || 'Member' }))}
        />
      )}


      {/* Batch Delegation Modal */}
      <DelegationProgressModal
        open={delegationOpen}
        taskIds={pendingTaskIds}
        onClose={() => setDelegationOpen(false)}
        onComplete={() => router.refresh()}
      />
    </div>
  )
}


