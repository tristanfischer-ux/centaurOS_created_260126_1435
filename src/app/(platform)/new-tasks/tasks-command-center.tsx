'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/design-system'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  Crosshair, LayoutGrid, List, GanttChartSquare, Search,
  X, Group,
} from 'lucide-react'
import { SmartSummary } from './smart-summary'
import { FocusView } from './focus-view'
import { BoardView } from './board-view'
import { ListView } from './list-view'
import { TaskDetailPanel } from './task-detail-panel'
import { CreateTaskDialog } from '../tasks/create-task-dialog'
import { EditTaskDialog } from '@/components/tasks/edit-task-dialog'
import { TasksGanttView } from './gantt-view'
import type { TaskWithData, Member, Team } from './types'

const LARGE_BREAKPOINT = 1280

interface TasksCommandCenterProps {
  tasks: TaskWithData[]
  objectives: { id: string; title: string }[]
  members: Member[]
  teams: Team[]
  currentUserId: string
  currentUserRole: string | null
  initialTaskId?: string
}

type ViewMode = 'focus' | 'board' | 'list' | 'timeline'
type GroupBy = 'none' | 'objective' | 'status' | 'assignee'

export function TasksCommandCenter({
  tasks,
  objectives,
  members,
  teams,
  currentUserId,
  currentUserRole,
  initialTaskId,
}: TasksCommandCenterProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('focus')
  const [quickFilter, setQuickFilter] = useState<string | null>('my-tasks')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId || null)
  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1400)
  const [editingTask, setEditingTask] = useState<TaskWithData | null>(null)

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
  }, [tasks, quickFilter, searchQuery, currentUserId])

  const filteredTasks = useMemo(() => getFilteredTasks(), [getFilteredTasks])

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
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Tasks</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Your personal command center for getting things done
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CreateTaskDialog
            objectives={objectives}
            members={members.map(m => ({ ...m, role: m.role || 'Member' }))}
            teams={teams}
            currentUserId={currentUserId}
          />
        </div>
      </div>

      {/* Smart Summary Pills */}
      <SmartSummary
        totalTasks={stats.totalTasks}
        dueToday={stats.dueToday}
        overdue={stats.overdue}
        needsReview={stats.needsReview}
        myActiveTasks={stats.myActiveTasks}
        activeFilter={quickFilter}
        onFilterChange={setQuickFilter}
      />

      {/* Toolbar: View tabs + Search + Group By */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList className="h-9">
            <TabsTrigger value="focus" className="text-xs gap-1.5 px-3">
              <Crosshair className="h-3.5 w-3.5" />
              Focus
            </TabsTrigger>
            <TabsTrigger value="board" className="text-xs gap-1.5 px-3">
              <LayoutGrid className="h-3.5 w-3.5" />
              Board
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

        <div className="flex items-center gap-2">
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

      {/* Results count */}
      <div className="text-xs text-muted-foreground">
        Showing {filteredTasks.length} of {tasks.length} tasks
        {searchQuery && <span> matching &quot;{searchQuery}&quot;</span>}
      </div>

      {/* Main Content Area */}
      <div className="flex gap-6">
        {/* Left: View content */}
        <div className={cn('flex-1 min-w-0', showDetailPanel && 'max-w-[calc(100%-380px)]')}>
          {viewMode === 'focus' && (
            <FocusView
              tasks={filteredTasks}
              selectedId={selectedId}
              onSelect={handleSelect}
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
            />
          )}
        </div>

        {/* Right: Detail panel */}
        {showDetailPanel && (
          <div className="w-[360px] flex-shrink-0 rounded-xl border overflow-hidden h-[calc(100dvh-340px)] sticky top-8">
            <TaskDetailPanel
              task={selectedTask}
              onClose={() => setSelectedId(null)}
              onEdit={setEditingTask}
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
    </div>
  )
}


