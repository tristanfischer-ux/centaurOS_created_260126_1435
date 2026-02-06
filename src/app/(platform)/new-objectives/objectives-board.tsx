'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { typography } from '@/lib/design-system'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  LayoutGrid, GitBranch, GanttChartSquare, Search, Target, X,
} from 'lucide-react'
import { StrategyHealthBar } from './strategy-health-bar'
import { ObjectiveCard } from './objective-card'
import { ObjectiveDetailPanel } from './objective-detail-panel'
import { ObjectivesTreeView } from './objectives-tree-view'
import { CreateObjectiveDialog } from '../objectives/create-objective-dialog'
import { ObjectivesGanttView } from './gantt-view'
import { TaskDetailPanel } from '../new-tasks/task-detail-panel'
import type { ObjectiveWithTasks, ObjectiveTask, Member, Team } from './types'
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
  objectivesForDialog: { id: string; title: string }[]
  members: Member[]
  teams: Team[]
  currentUserId: string
  currentUserRole: string | null
}

type ViewMode = 'board' | 'tree' | 'timeline'

export function ObjectivesBoard({
  objectives,
  objectivesForDialog,
  members,
  teams,
  currentUserId,
  currentUserRole,
}: ObjectivesBoardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('board')
  const [healthFilter, setHealthFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1400)

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
  }, [objectives, healthFilter, searchQuery])

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
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Strategic Objectives</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Your strategic objectives and their progress
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

      {/* Toolbar: View tabs + Search */}
      <div className="flex items-center justify-between gap-4">
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
              selectedId={selectedId}
              onSelect={handleSelect}
            />
          )}
          {viewMode === 'tree' && (
            <ObjectivesTreeView
              objectives={filteredObjectives}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
          )}
          {viewMode === 'timeline' && (
            <ObjectivesGanttView
              objectives={filteredObjectives}
              selectedId={selectedId}
              onSelect={handleSelect}
              onTaskSelect={handleTaskSelect}
            />
          )}
        </div>

        {/* Right: Detail panel */}
        {hasDetailPanel && (
          <div className="w-[360px] min-w-0 max-w-[360px] flex-shrink-0 rounded-xl border border-slate-100 overflow-hidden h-[calc(100vh-300px)] sticky top-8">
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

// Board view: grid of cards
function BoardView({
  objectives,
  selectedId,
  onSelect,
}: {
  objectives: ObjectiveWithTasks[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  if (objectives.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <Target className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">No objectives found</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          {objectives.length === 0
            ? 'Create your first strategic objective to start tracking progress.'
            : 'No objectives match your current filters.'}
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {objectives.map(obj => (
        <ObjectiveCard
          key={obj.id}
          objective={obj}
          isSelected={selectedId === obj.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

