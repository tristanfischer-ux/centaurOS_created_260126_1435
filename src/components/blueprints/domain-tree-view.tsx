'use client'

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CoverageIndicator } from './coverage-indicator'
import type { DomainCoverageWithDetails, CoverageStatus, DomainCategory } from '@/types/blueprints'
import { DOMAIN_CATEGORY_COLORS, COVERAGE_STATUS_COLORS } from '@/types/blueprints'
import {
  ChevronRight,
  ChevronDown,
  Users,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
} from 'lucide-react'

// Get status border color for visual hierarchy
const getStatusBorderColor = (status: CoverageStatus): string => {
  switch (status) {
    case 'covered': return 'border-l-status-success'
    case 'partial': return 'border-l-status-warning'
    case 'gap': return 'border-l-destructive'
    case 'not_needed': return 'border-l-muted'
    default: return 'border-l-muted'
  }
}

interface DomainTreeItemProps {
  coverage: DomainCoverageWithDetails
  depth: number
  childItems?: DomainCoverageWithDetails[]
  onSelect?: (coverage: DomainCoverageWithDetails) => void
  selected?: string
  showAllDomains?: boolean
}

function DomainTreeItem({
  coverage,
  depth,
  childItems = [],
  onSelect,
  selected,
  showAllDomains = false,
}: DomainTreeItemProps) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = childItems.length > 0
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

  // Handle keyboard selection — must be above early return to satisfy rules-of-hooks
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect?.(coverage)
    }
  }, [coverage, onSelect])

  // Hide not_needed items unless showing all
  if (!showAllDomains && coverage.status === 'not_needed') {
    return null
  }

  return (
    <div className="select-none">
      <div
        role="button"
        tabIndex={0}
        className={cn(
          'group flex items-center gap-2 rounded-md px-2 py-2 transition-all cursor-pointer',
          'hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          // Add left border for depth 0 items based on status
          depth === 0 && 'border-l-4',
          depth === 0 && getStatusBorderColor(coverage.status),
          // Selected state
          selected === coverage.id && 'bg-accent/10 ring-1 ring-accent'
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => onSelect?.(coverage)}
        onKeyDown={handleKeyDown}
      >
        {/* Expand/collapse */}
        {hasChildren ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 p-0 hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <div className="w-6" />
        )}

        {/* Status indicator */}
        <StatusIcon
          className={cn(
            'h-4 w-4 flex-shrink-0',
            coverage.status === 'covered' && 'text-status-success',
            coverage.status === 'partial' && 'text-status-warning',
            coverage.status === 'gap' && 'text-destructive',
            coverage.status === 'not_needed' && 'text-muted-foreground'
          )}
          aria-hidden="true"
        />

        {/* Domain name */}
        <span className={cn(
          'flex-1 truncate text-sm font-medium',
          coverage.status === 'not_needed' && 'text-muted-foreground font-normal',
          depth > 0 && 'font-normal'
        )}>
          {domain.name}
        </span>

        {/* Category badge (depth 0 only) */}
        {depth === 0 && category && (
          <Badge variant="info" className="text-xs">
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
            <Users className="h-3 w-3" aria-hidden="true" />
            <span>{expertiseCount}</span>
          </div>
        )}
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div className="ml-3 border-l border-muted">
          {childItems.map((child) => (
            <DomainTreeItem
              key={child.id}
              coverage={child}
              depth={depth + 1}
              childItems={[]} // Would need to pass nested children
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
          childItems={childrenMap.get(item.domain!.id) || []}
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

  const renderGroup = (items: DomainCoverageWithDetails[], title: string, borderColor: string) => {
    if (items.length === 0) return null

    return (
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">{title}</h4>
        <div className="space-y-1">
          {items.map((item) => (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              className={cn(
                'flex items-center gap-3 p-3 rounded-md border-l-4 transition-all cursor-pointer',
                'hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                borderColor
              )}
              onClick={() => onSelect?.(item)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect?.(item)
                }
              }}
            >
              <CoverageIndicator status={item.status} size="sm" showLabel={false} />
              <span className="flex-1 text-sm font-medium">{item.domain?.name || item.domain_name}</span>
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
      {renderGroup(gaps.filter(g => g.is_critical), 'Critical Gaps', 'border-l-destructive bg-status-error-light/30')}
      {renderGroup(gaps.filter(g => !g.is_critical), 'Gaps', 'border-l-destructive')}
      {renderGroup(partial, 'Partial Coverage', 'border-l-status-warning')}
      {renderGroup(covered, 'Covered', 'border-l-status-success')}
    </div>
  )
}
