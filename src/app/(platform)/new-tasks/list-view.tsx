'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { getStatusBadgeClass } from '@/lib/status-colors'
import {
  ArrowUpDown, ArrowUp, ArrowDown, CheckCircle2, Circle,
  AlertTriangle, MessageSquare, Paperclip, ChevronDown, ChevronRight,
} from 'lucide-react'
import type { TaskWithData } from './types'

interface ListViewProps {
  tasks: TaskWithData[]
  selectedId: string | null
  onSelect: (id: string) => void
  groupBy: 'none' | 'objective' | 'status' | 'assignee'
}

type SortField = 'title' | 'status' | 'end_date' | 'created_at' | 'risk_level'
type SortDir = 'asc' | 'desc'

function SortHeader({
  label,
  field,
  currentField,
  currentDir,
  onSort,
  className,
}: {
  label: string
  field: SortField
  currentField: SortField
  currentDir: SortDir
  onSort: (field: SortField) => void
  className?: string
}) {
  const isActive = currentField === field
  return (
    <button
      onClick={() => onSort(field)}
      className={cn('inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider hover:text-foreground transition-colors', className, isActive ? 'text-foreground' : 'text-muted-foreground')}
    >
      {label}
      {isActive ? (
        currentDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  )
}

export function ListView({ tasks, selectedId, onSelect, groupBy }: ListViewProps) {
  const [sortField, setSortField] = useState<SortField>('end_date')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Sort tasks
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortField) {
        case 'title':
          return dir * a.title.localeCompare(b.title)
        case 'status':
          return dir * (a.status || '').localeCompare(b.status || '')
        case 'end_date': {
          const dateA = a.end_date ? new Date(a.end_date).getTime() : Infinity
          const dateB = b.end_date ? new Date(b.end_date).getTime() : Infinity
          return dir * (dateA - dateB)
        }
        case 'created_at':
          return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        case 'risk_level': {
          const riskOrder: Record<string, number> = { High: 3, Medium: 2, Low: 1 }
          return dir * ((riskOrder[a.risk_level || 'Low'] || 0) - (riskOrder[b.risk_level || 'Low'] || 0))
        }
        default:
          return 0
      }
    })
  }, [tasks, sortField, sortDir])

  // Group tasks
  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: '', tasks: sortedTasks }]
    }

    const map = new Map<string, TaskWithData[]>()
    sortedTasks.forEach(task => {
      let key: string
      switch (groupBy) {
        case 'objective':
          key = task.objective?.title || 'No Objective'
          break
        case 'status':
          key = task.status.replace(/_/g, ' ')
          break
        case 'assignee':
          key = task.assignee?.full_name || 'Unassigned'
          break
        default:
          key = 'all'
      }
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(task)
    })

    return Array.from(map.entries()).map(([key, tasks]) => ({ key, label: key, tasks }))
  }, [sortedTasks, groupBy])

  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
      {/* Table header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 bg-muted/30">
        <div className="w-5" /> {/* Status icon column */}
        <SortHeader label="Title" field="title" currentField={sortField} currentDir={sortDir} onSort={handleSort} className="flex-1" />
        <div className="w-24 hidden md:block">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Objective</span>
        </div>
        <div className="w-20 hidden sm:block">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Assignee</span>
        </div>
        <SortHeader label="Due" field="end_date" currentField={sortField} currentDir={sortDir} onSort={handleSort} className="w-20 text-right" />
        <SortHeader label="Risk" field="risk_level" currentField={sortField} currentDir={sortDir} onSort={handleSort} className="w-16 hidden lg:flex" />
        <SortHeader label="Status" field="status" currentField={sortField} currentDir={sortDir} onSort={handleSort} className="w-28" />
      </div>

      {/* Table body */}
      <div className="divide-y divide-slate-50">
        {groups.map(group => (
          <div key={group.key}>
            {/* Group header */}
            {groupBy !== 'none' && (
              <button
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center gap-2 px-4 py-2 bg-muted/20 hover:bg-muted/40 transition-colors"
              >
                {collapsedGroups.has(group.key) ? (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="text-xs font-semibold text-foreground">{group.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">({group.tasks.length})</span>
              </button>
            )}

            {/* Rows */}
            {!collapsedGroups.has(group.key) && group.tasks.map(task => {
              const isOverdue = task.end_date && task.status !== 'Completed' && task.status !== 'Rejected' && new Date(task.end_date) < new Date()
              const statusBadge = getStatusBadgeClass(task.status)

              return (
                <button
                  key={task.id}
                  onClick={() => onSelect(task.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all duration-150',
                    'hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    selectedId === task.id && 'bg-international-orange/5',
                  )}
                >
                  {/* Status icon */}
                  {task.status === 'Completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-status-success flex-shrink-0" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/30 flex-shrink-0" />
                  )}

                  {/* Title + indicators */}
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className={cn(
                      'text-sm truncate',
                      task.status === 'Completed' ? 'text-muted-foreground line-through' : 'text-foreground'
                    )}>
                      {task.title}
                    </span>
                    {task.message_count > 0 && (
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-0.5">
                        <MessageSquare className="h-3 w-3" />
                        {task.message_count}
                      </span>
                    )}
                    {task.task_files.length > 0 && (
                      <Paperclip className="h-3 w-3 text-muted-foreground" />
                    )}
                  </div>

                  {/* Objective */}
                  <div className="w-24 hidden md:block">
                    {task.objective && (
                      <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full truncate block">
                        {task.objective.title}
                      </span>
                    )}
                  </div>

                  {/* Assignee */}
                  <div className="w-20 hidden sm:flex items-center gap-1.5">
                    {task.assignee?.full_name && (
                      <>
                        <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[8px] font-semibold text-muted-foreground flex-shrink-0">
                          {task.assignee.full_name[0].toUpperCase()}
                        </div>
                        <span className="text-xs text-muted-foreground truncate">
                          {task.assignee.full_name.split(' ')[0]}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Due date */}
                  <div className="w-20 text-right">
                    {task.end_date && (
                      <span className={cn(
                        'text-[11px] tabular-nums inline-flex items-center gap-0.5 justify-end',
                        isOverdue ? 'text-status-error font-medium' : 'text-muted-foreground'
                      )}>
                        {isOverdue && <AlertTriangle className="h-3 w-3" />}
                        {new Date(task.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>

                  {/* Risk */}
                  <div className="w-16 hidden lg:block">
                    {task.risk_level && task.risk_level !== 'Low' && (
                      <Badge variant="outline" className={cn(
                        'text-[9px] px-1.5',
                        task.risk_level === 'High' ? 'border-status-error/30 text-status-error' : 'border-status-warning/30 text-status-warning'
                      )}>
                        {task.risk_level}
                      </Badge>
                    )}
                  </div>

                  {/* Status */}
                  <div className="w-28">
                    <Badge className={cn('text-[10px]', statusBadge)}>
                      {task.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
