'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ProgressRing, getHealthVariant } from '@/components/ui/progress-ring'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ChevronRight, ChevronDown, ListChecks, AlertTriangle, Pencil, Trash } from 'lucide-react'
import type { ObjectiveWithTasks } from './types'

interface ObjectivesTreeViewProps {
  objectives: ObjectiveWithTasks[]
  selectedId: string | null
  onSelect: (id: string) => void
  onEdit?: (objective: ObjectiveWithTasks) => void
  onDelete?: (objectiveId: string) => void
}

const HEALTH_DOT: Record<string, string> = {
  'on-track': 'bg-status-success',
  'at-risk': 'bg-status-warning',
  'off-track': 'bg-status-error',
  'completed': 'bg-status-success',
  'not-started': 'bg-muted-foreground/30',
}

interface TreeNode {
  objective: ObjectiveWithTasks
  children: TreeNode[]
}

function buildTree(objectives: ObjectiveWithTasks[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  // Create nodes
  objectives.forEach(obj => {
    map.set(obj.id, { objective: obj, children: [] })
  })

  // Build hierarchy
  objectives.forEach(obj => {
    const node = map.get(obj.id)!
    if (obj.parent_objective_id && map.has(obj.parent_objective_id)) {
      map.get(obj.parent_objective_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })

  return roots
}

function TreeItem({
  node,
  depth,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
}: {
  node: TreeNode
  depth: number
  selectedId: string | null
  onSelect: (id: string) => void
  onEdit?: (objective: ObjectiveWithTasks) => void
  onDelete?: (objectiveId: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const { objective } = node
  const hasChildren = node.children.length > 0
  const variant = getHealthVariant(objective.progress)
  const isSelected = selectedId === objective.id

  return (
    <div className="group relative">
      {/* Action buttons - visible on hover */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-white hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation()
              onEdit(objective)
            }}
            aria-label="Edit objective"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-white hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(objective.id)
            }}
            aria-label="Delete objective"
          >
            <Trash className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <button
        onClick={() => onSelect(objective.id)}
        className={cn(
          'w-full flex items-center gap-3 py-2.5 px-3 rounded-lg transition-all duration-150',
          'hover:bg-muted/50',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isSelected && 'bg-international-orange/5 ring-1 ring-international-orange/20',
        )}
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
      >
        {/* Expand/collapse */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            className="p-0.5 hover:bg-muted rounded"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        ) : (
          <div className="w-[18px]" /> // Spacer
        )}

        {/* Health dot */}
        <div className={cn('h-2.5 w-2.5 rounded-full flex-shrink-0', HEALTH_DOT[objective.health])} />

        {/* Title */}
        <div className="flex-1 min-w-0 text-left">
          <span className="text-sm font-medium text-foreground truncate block">
            {objective.title}
          </span>
        </div>

        {/* Task count */}
        <span className="text-xs text-muted-foreground tabular-nums flex items-center gap-1 flex-shrink-0">
          <ListChecks className="h-3 w-3" />
          {objective.completedTasks}/{objective.totalTasks}
        </span>

        {/* Overdue indicator */}
        {objective.overdueTasks > 0 && (
          <span className="text-xs text-status-error tabular-nums flex items-center gap-0.5 flex-shrink-0">
            <AlertTriangle className="h-3 w-3" />
            {objective.overdueTasks}
          </span>
        )}

        {/* Progress ring */}
        <ProgressRing progress={objective.progress} size={32} strokeWidth={3} variant={variant} showLabel={false} />

        {/* Progress text */}
        <span className="text-xs font-medium tabular-nums text-foreground w-8 text-right flex-shrink-0">
          {objective.progress}%
        </span>
      </button>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="relative">
          {/* Vertical alignment line */}
          <div
            className="absolute top-0 bottom-0 w-px bg-slate-200"
            style={{ left: `${depth * 24 + 24}px` }}
          />
          {node.children.map(child => (
            <TreeItem
              key={child.objective.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ObjectivesTreeView({ objectives, selectedId, onSelect, onEdit, onDelete }: ObjectivesTreeViewProps) {
  const tree = buildTree(objectives)

  if (tree.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">No objectives yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-0.5 bg-white rounded-xl border border-slate-100 p-2">
      {/* Header row */}
      <div className="flex items-center gap-3 py-2 px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
        <div className="w-[18px]" />
        <div className="w-2.5" />
        <div className="flex-1">Objective</div>
        <div className="w-16 text-center">Tasks</div>
        <div className="w-8" />
        <div className="w-8 text-right">Progress</div>
      </div>

      <Separator />

      {tree.map(node => (
        <TreeItem
          key={node.objective.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

