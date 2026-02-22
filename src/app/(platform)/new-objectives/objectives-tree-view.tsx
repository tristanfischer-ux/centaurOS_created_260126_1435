'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ProgressRing, getHealthVariant } from '@/components/ui/progress-ring'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ChevronRight, ChevronDown, ListChecks, AlertTriangle, Pencil, Trash, Flag, Target, Plus } from 'lucide-react'
import type { ObjectiveWithTasks, StrategicObjective } from './types'
import { getStrategyColor, type StrategyColor } from './strategy-colors'

interface ObjectivesTreeViewProps {
  objectives: ObjectiveWithTasks[]
  strategicObjectives?: StrategicObjective[]
  selectedId: string | null
  onSelect: (id: string) => void
  onEdit?: (objective: ObjectiveWithTasks) => void
  onDelete?: (objectiveId: string) => void
  onCreateNew?: () => void
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
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10">
        {onEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 bg-background hover:bg-muted"
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
            className="h-7 w-7 bg-background hover:bg-destructive/10 hover:text-destructive"
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
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
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
          <ListChecks className="h-3 w-3 hidden sm:block" />
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
        <div className="hidden sm:block flex-shrink-0">
          <ProgressRing progress={objective.progress} size={32} strokeWidth={3} variant={variant} showLabel={false} />
        </div>

        {/* Progress text */}
        <span className="text-xs font-medium tabular-nums text-foreground w-8 text-right flex-shrink-0 hidden sm:inline">
          {objective.progress}%
        </span>
      </button>

      {/* Children */}
      {hasChildren && expanded && (
        <div className="relative">
          {/* Vertical alignment line */}
          <div
            className="absolute top-0 bottom-0 w-px bg-border"
            style={{ left: `${depth * 16 + 24}px` }}
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

/**
 * Strategy section header row in the tree view.
 */
function StrategyRow({
  strategy,
  objectiveCount,
  expanded,
  onToggle,
  color,
}: {
  strategy: StrategicObjective
  objectiveCount: number
  expanded: boolean
  onToggle: () => void
  color: StrategyColor
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors hover:bg-muted/50 font-semibold"
    >
      {expanded ? (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
      <Flag className={cn('h-3.5 w-3.5', color.icon)} />
      <span className="text-sm text-foreground">{strategy.title}</span>
      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded tabular-nums">
        {objectiveCount}
      </span>
    </button>
  )
}

export function ObjectivesTreeView({ objectives, strategicObjectives = [], selectedId, onSelect, onEdit, onDelete, onCreateNew }: ObjectivesTreeViewProps) {
  const [collapsedStrategies, setCollapsedStrategies] = useState<Set<string>>(new Set())

  const toggleStrategy = (strategyId: string) => {
    setCollapsedStrategies(prev => {
      const next = new Set(prev)
      if (next.has(strategyId)) next.delete(strategyId)
      else next.add(strategyId)
      return next
    })
  }

  // Group objectives by strategy
  const { grouped, unlinked } = useMemo(() => {
    if (strategicObjectives.length === 0) {
      return { grouped: [], unlinked: objectives }
    }

    const stratMap = new Map<string, ObjectiveWithTasks[]>()
    const unlinked: ObjectiveWithTasks[] = []

    for (const obj of objectives) {
      if (obj.parent_objective_id && strategicObjectives.some(s => s.id === obj.parent_objective_id)) {
        const existing = stratMap.get(obj.parent_objective_id) || []
        existing.push(obj)
        stratMap.set(obj.parent_objective_id, existing)
      } else {
        unlinked.push(obj)
      }
    }

    const grouped = strategicObjectives.map(s => ({
      strategy: s,
      objectives: stratMap.get(s.id) || [],
    }))

    return { grouped, unlinked }
  }, [objectives, strategicObjectives])

  if (objectives.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <Target className="h-8 w-8 text-muted-foreground/40" />
        </div>
        <h3 className="text-base font-semibold text-foreground mb-1">Your strategy tree starts here</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Create objectives to see how they branch from your strategic goals into actionable milestones.
        </p>
        {onCreateNew && (
          <Button onClick={onCreateNew} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Create Objective
          </Button>
        )}
      </div>
    )
  }

  // No strategies — render flat tree
  if (strategicObjectives.length === 0) {
    const tree = buildTree(objectives)
    return (
      <div className="space-y-0.5 bg-background rounded-xl border border-slate-100 p-2">
        <TreeHeader />
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

  return (
    <div className="space-y-2">
      {/* Strategy color legend */}
      {grouped.length > 1 && (
        <div className="flex flex-wrap items-center gap-4 text-sm px-2">
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

      <div className="space-y-0.5 bg-background rounded-xl border p-2">
        <TreeHeader />
        <Separator />

        {/* Strategy sections */}
        {grouped.map(({ strategy, objectives: stratObjectives }, index) => {
          const isCollapsed = collapsedStrategies.has(strategy.id)
          const tree = buildTree(stratObjectives)
          const color = getStrategyColor(index)

          return (
            <div
              key={strategy.id}
              className={cn(
                'rounded-lg border-l-4 my-1',
                color.border,
                color.bg,
              )}
            >
              <StrategyRow
                strategy={strategy}
                objectiveCount={stratObjectives.length}
                expanded={!isCollapsed}
                onToggle={() => toggleStrategy(strategy.id)}
                color={color}
              />
              {!isCollapsed && tree.map(node => (
                <TreeItem
                  key={node.objective.id}
                  node={node}
                  depth={1}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )
        })}

        {/* Unlinked */}
        {unlinked.length > 0 && (
          <div>
            <div className="flex items-center gap-3 py-2.5 px-3 text-sm font-semibold text-muted-foreground">
              <div className="w-4" />
              <span>Unlinked Objectives</span>
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded tabular-nums">
                {unlinked.length}
              </span>
            </div>
            {buildTree(unlinked).map(node => (
              <TreeItem
                key={node.objective.id}
                node={node}
                depth={1}
                selectedId={selectedId}
                onSelect={onSelect}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Header row for the tree table */
function TreeHeader() {
  return (
    <div className="flex items-center gap-2 sm:gap-3 py-2 px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
      <div className="w-[18px]" />
      <div className="w-2.5" />
      <div className="flex-1">Objective</div>
      <div className="w-16 text-center hidden sm:block">Tasks</div>
      <div className="w-8 hidden sm:block" />
      <div className="w-8 text-right hidden sm:block">Progress</div>
    </div>
  )
}

