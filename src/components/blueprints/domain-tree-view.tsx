'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CoverageIndicator } from './coverage-indicator'
import type { DomainCoverageWithDetails, CoverageStatus, DomainCategory } from '@/types/blueprints'
import { DOMAIN_CATEGORY_COLORS } from '@/types/blueprints'
import {
  ChevronRight,
  ChevronDown,
  Users,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
} from 'lucide-react'

interface DomainTreeItemProps {
  coverage: DomainCoverageWithDetails
  depth: number
  children?: DomainCoverageWithDetails[]
  onSelect?: (coverage: DomainCoverageWithDetails) => void
  selected?: string
  showAllDomains?: boolean
}

function DomainTreeItem({
  coverage,
  depth,
  children = [],
  onSelect,
  selected,
  showAllDomains = false,
}: DomainTreeItemProps) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = children.length > 0
  const domain = coverage.domain!

  const category = domain.category as DomainCategory | null
  const categoryColors = category ? DOMAIN_CATEGORY_COLORS[category] : null

  // Get status icon
  const StatusIcon = {
    covered: CheckCircle2,
    partial: CircleDashed,
    gap: AlertTriangle,
    not_needed: CircleDashed,
  }[coverage.status]

  const expertiseCount = coverage.expertise?.length || 0

  // Hide not_needed items unless showing all
  if (!showAllDomains && coverage.status === 'not_needed') {
    return null
  }

  return (
    <div className="select-none">
      <div
        className={cn(
          'group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors cursor-pointer',
          'hover:bg-muted',
          selected === coverage.id && 'bg-muted ring-1 ring-international-orange'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect?.(coverage)}
      >
        {/* Expand/collapse */}
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <div className="w-5" />
        )}

        {/* Status indicator */}
        <StatusIcon
          className={cn(
            'h-4 w-4 flex-shrink-0',
            coverage.status === 'covered' && 'text-emerald-500',
            coverage.status === 'partial' && 'text-amber-500',
            coverage.status === 'gap' && 'text-rose-500',
            coverage.status === 'not_needed' && 'text-muted-foreground'
          )}
        />

        {/* Domain name */}
        <span className={cn(
          'flex-1 truncate text-sm',
          coverage.status === 'not_needed' && 'text-muted-foreground'
        )}>
          {domain.name}
        </span>

        {/* Category badge (depth 0 only) */}
        {depth === 0 && category && categoryColors && (
          <Badge
            variant="outline"
            className={cn('text-xs', categoryColors.text, categoryColors.bg, categoryColors.border)}
          >
            {category}
          </Badge>
        )}

        {/* Critical indicator */}
        {coverage.is_critical && coverage.status === 'gap' && (
          <Badge variant="destructive" className="text-xs">
            Critical
          </Badge>
        )}

        {/* Expertise count */}
        {expertiseCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />
            <span>{expertiseCount}</span>
          </div>
        )}
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {children.map((child) => (
            <DomainTreeItem
              key={child.id}
              coverage={child}
              depth={depth + 1}
              children={[]} // Would need to pass nested children
              onSelect={onSelect}
              selected={selected}
              showAllDomains={showAllDomains}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface DomainTreeViewProps {
  coverage: DomainCoverageWithDetails[]
  onSelect?: (coverage: DomainCoverageWithDetails) => void
  selected?: string
  showAllDomains?: boolean
  filterStatus?: CoverageStatus
  className?: string
}

export function DomainTreeView({
  coverage,
  onSelect,
  selected,
  showAllDomains = false,
  filterStatus,
  className,
}: DomainTreeViewProps) {
  // Build tree structure from flat coverage list
  const buildTree = () => {
    const domainMap = new Map<string, DomainCoverageWithDetails>()
    const childrenMap = new Map<string, DomainCoverageWithDetails[]>()
    const rootItems: DomainCoverageWithDetails[] = []

    // First pass: index all items
    for (const item of coverage) {
      if (!item.domain) continue
      domainMap.set(item.domain.id, item)
      
      const parentId = item.domain.parent_id
      if (parentId) {
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, [])
        }
        childrenMap.get(parentId)!.push(item)
      } else {
        rootItems.push(item)
      }
    }

    return { rootItems, childrenMap }
  }

  const { rootItems, childrenMap } = buildTree()

  // Apply status filter
  let filteredRoots = rootItems
  if (filterStatus) {
    filteredRoots = rootItems.filter(item => item.status === filterStatus)
  }

  // Sort: gaps first, then by category
  filteredRoots.sort((a, b) => {
    // Critical gaps first
    if (a.is_critical && a.status === 'gap' && !(b.is_critical && b.status === 'gap')) return -1
    if (!(a.is_critical && a.status === 'gap') && b.is_critical && b.status === 'gap') return 1
    
    // Then gaps
    if (a.status === 'gap' && b.status !== 'gap') return -1
    if (a.status !== 'gap' && b.status === 'gap') return 1
    
    // Then by category
    const catA = a.domain?.category || ''
    const catB = b.domain?.category || ''
    return catA.localeCompare(catB)
  })

  if (filteredRoots.length === 0) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        No domains match the current filter.
      </div>
    )
  }

  return (
    <div className={cn('space-y-1', className)}>
      {filteredRoots.map((item) => (
        <DomainTreeItem
          key={item.id}
          coverage={item}
          depth={0}
          children={childrenMap.get(item.domain!.id) || []}
          onSelect={onSelect}
          selected={selected}
          showAllDomains={showAllDomains}
        />
      ))}
    </div>
  )
}

// Simple flat list view as an alternative
interface DomainListViewProps {
  coverage: DomainCoverageWithDetails[]
  onSelect?: (coverage: DomainCoverageWithDetails) => void
  className?: string
}

export function DomainListView({ coverage, onSelect, className }: DomainListViewProps) {
  // Group by status
  const gaps = coverage.filter(c => c.status === 'gap')
  const partial = coverage.filter(c => c.status === 'partial')
  const covered = coverage.filter(c => c.status === 'covered')

  const renderGroup = (items: DomainCoverageWithDetails[], title: string) => {
    if (items.length === 0) return null

    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
              onClick={() => onSelect?.(item)}
            >
              <CoverageIndicator status={item.status} size="sm" showLabel={false} />
              <span className="flex-1 text-sm">{item.domain?.name || item.domain_name}</span>
              {item.is_critical && item.status === 'gap' && (
                <Badge variant="destructive" className="text-xs">Critical</Badge>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {renderGroup(gaps.filter(g => g.is_critical), 'Critical Gaps')}
      {renderGroup(gaps.filter(g => !g.is_critical), 'Gaps')}
      {renderGroup(partial, 'Partial Coverage')}
      {renderGroup(covered, 'Covered')}
    </div>
  )
}
