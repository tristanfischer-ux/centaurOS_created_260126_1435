'use client'

/**
 * @file canvas-shell.tsx
 *
 * @description Client-side shell for the Strategy page. Provides tab switching
 * between Strategy River, Whiteboards, Money Map, and Cost of Delay.
 *
 * @related
 * - StrategyRiver: src/components/canvas/StrategyRiver.tsx
 * - Adapter: src/lib/canvas/strategy-river-adapter.ts
 * - components/whiteboard-list.tsx — whiteboard CRUD list
 * - money-map-client.tsx — Money Map financial visualization
 * - cost-of-delay-view.tsx — Cost of Delay calculator
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Waypoints, Pencil, Banknote, Calculator, Link2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StatusBadge } from '@/components/ui/status-badge'

import StrategyRiver, { computeRiverStats } from '@/components/canvas/StrategyRiver'
import { goalBundlesToRiverData } from '@/lib/canvas/strategy-river-adapter'
import { NodeDetailsDialog } from '@/components/canvas/node-details-dialog'
import { MoneyMapClient } from '../money-map/money-map-client'
import { CostOfDelayView } from '@/components/tools/cost-of-delay/cost-of-delay-view'
import { StrategyLinkView } from './strategy-link-view'
import { WhiteboardList } from './components/whiteboard-list'
import { CompanyPurposeWrapper } from '@/components/objectives/company-purpose-wrapper'
import { AddToRiverDialog } from '@/components/canvas/add-to-river-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { typography } from '@/lib/design-system/typography'
import type { GoalBundle } from '@/types/canvas'
import type { MilestoneOption } from '@/types/canvas'
import type { StrategicObjective } from '../new-objectives/types'
import type { FoundryPurposeData } from '@/types/foundry'
import type { WhiteboardRow } from '@/actions/whiteboards'

// ============================================================================
// TYPES
// ============================================================================

type CanvasTab = 'river' | 'link-objectives' | 'whiteboards' | 'money-map' | 'cost-of-delay'

/** Minimal objective data for the link view */
export interface RegularObjective {
  id: string
  title: string
  parent_objective_id: string | null
  status: string | null
  progress: number
}

interface CanvasShellProps {
  /** Pre-fetched goal bundles for the Strategy River */
  initialBundles: GoalBundle[]
  /** Strategic objectives for the CRUD manager and link view */
  strategicObjectives: StrategicObjective[]
  /** Regular objectives for the link view */
  regularObjectives: RegularObjective[]
  /** Pre-fetched whiteboard rows */
  whiteboards: WhiteboardRow[]
  /** Objectives for whiteboard linking */
  whiteboardObjectives: { id: string; title: string }[]
  /** Company purpose data for strategic context display */
  purposeData: FoundryPurposeData | null
  /** Whether current user is a founder (can edit purpose) */
  isFounder: boolean
  /** Foundry ID for purpose editing */
  foundryId: string
  /** Current user ID for purpose editing */
  userId: string
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TABS: { id: CanvasTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'river', label: 'Strategy River', icon: Waypoints },
  { id: 'link-objectives', label: 'Link Objectives', icon: Link2 },
  { id: 'whiteboards', label: 'Whiteboards', icon: Pencil },
  { id: 'money-map', label: 'Money Map', icon: Banknote },
  { id: 'cost-of-delay', label: 'Cost of Delay', icon: Calculator },
]

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * @description Shell component that manages the Strategy River / Whiteboards /
 * Money Map / Cost of Delay tabs and renders the appropriate content for each.
 */
export function CanvasShell({
  initialBundles,
  strategicObjectives,
  regularObjectives,
  whiteboards,
  whiteboardObjectives,
  purposeData,
  isFounder,
  foundryId,
  userId,
}: CanvasShellProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') as CanvasTab | null

  const [activeTab, setActiveTab] = useState<CanvasTab>(
    tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : 'river'
  )

  // ── Node details dialog state ──
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogNodeType, setDialogNodeType] = useState<'goal' | 'milestone' | 'objective' | 'task'>('task')
  const [dialogNodeId, setDialogNodeId] = useState('')

  // Convert goal bundles to river data format
  const riverData = useMemo(() => goalBundlesToRiverData(initialBundles), [initialBundles])

  // Compute task status counts for the tab bar badges
  const riverStats = useMemo(() => computeRiverStats(riverData), [riverData])

  // Compute linked/unlinked objective counts for link-objectives tab badge
  const linkStats = useMemo(() => {
    const linked = regularObjectives.filter((o) => o.parent_objective_id !== null).length
    const unlinked = regularObjectives.filter((o) => o.parent_objective_id === null).length
    return { linked, unlinked }
  }, [regularObjectives])

  // ── Milestone expansion state (controlled from manager pills → river) ──
  const [expandedObjectiveIds, setExpandedObjectiveIds] = useState<Set<string>>(() => {
    // Start with the first SO's milestones expanded
    if (riverData.length > 0) {
      return new Set(riverData[0].objectives.map((o) => o.id))
    }
    return new Set()
  })

  const handleExpandToggle = useCallback((id: string): void => {
    // Check if it's a strategic objective ID (toggle all its milestones)
    const so = riverData.find((s) => s.id === id)
    if (so) {
      const msIds = so.objectives.map((o) => o.id)
      setExpandedObjectiveIds((prev) => {
        const next = new Set(prev)
        const anyExpanded = msIds.some((mid) => next.has(mid))
        if (anyExpanded) {
          msIds.forEach((mid) => next.delete(mid))
        } else {
          msIds.forEach((mid) => next.add(mid))
        }
        return next
      })
    } else {
      // Single milestone toggle
      setExpandedObjectiveIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id); else next.add(id)
        return next
      })
    }
  }, [riverData])

  // ── Expand / Collapse all milestones ──
  const handleExpandAll = useCallback((): void => {
    const allIds = riverData.flatMap((so) => so.objectives.map((o) => o.id))
    setExpandedObjectiveIds(new Set(allIds))
  }, [riverData])

  const handleCollapseAll = useCallback((): void => {
    setExpandedObjectiveIds(new Set())
  }, [])

  // ── Add-to-river dialog state ──
  const [addToRiverGoalId, setAddToRiverGoalId] = useState<string | null>(null)

  const handleAddToRiver = useCallback((strategicObjectiveId: string): void => {
    setAddToRiverGoalId(strategicObjectiveId)
  }, [])

  // Build milestone options from bundles for the dialog
  const milestoneOptions: MilestoneOption[] = useMemo(() =>
    initialBundles.flatMap((bundle) =>
      bundle.milestones.map((ms) => ({
        id: ms.id,
        title: ms.title,
        goalTitle: bundle.goal.title,
        milestone_date: ms.milestone_date,
      }))
    ), [initialBundles])

  // ── Click handlers for StrategyRiver ──
  const handleTaskClick = useCallback((taskId: string): void => {
    setDialogNodeType('task')
    setDialogNodeId(taskId)
    setDialogOpen(true)
  }, [])

  const handleMilestoneClick = useCallback((milestoneId: string): void => {
    setDialogNodeType('milestone')
    setDialogNodeId(milestoneId)
    setDialogOpen(true)
  }, [])

  const handleGoalClick = useCallback((goalId: string): void => {
    setDialogNodeType('goal')
    setDialogNodeId(goalId)
    setDialogOpen(true)
  }, [])

  const handleDialogUpdate = useCallback((): void => {
    // Refresh the page to reload data from server
    router.refresh()
  }, [router])

  // Update URL when tab changes
  useEffect(() => {
    if (activeTab !== 'river') {
      router.replace(`/canvas?tab=${activeTab}`, { scroll: false })
    } else {
      router.replace('/canvas', { scroll: false })
    }
  }, [activeTab, router])

  // ── Toolbar slot ref ──
  // Child tab components portal their action buttons into this element
  const toolbarSlotRef = useRef<HTMLDivElement>(null)

  return (
    <div>
      {/* Page header with inline company purpose */}
      <div className="px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-3 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className={typography.pageHeader}>
              <div className={typography.pageHeaderAccent} />
              <h1 className={typography.h1}>Strategy</h1>
            </div>
            <p className={typography.pageSubtitle}>
              Define your high-level goals, then link objectives to them
            </p>
          </div>
          {/* Compact purpose CTA / summary in header */}
          <CompanyPurposeWrapper
            purposeData={purposeData}
            isFounder={isFounder}
            foundryId={foundryId}
            userId={userId}
            variant="inline"
          />
        </div>
      </div>

      {/* Tab bar with status badges + action-button slot */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as CanvasTab)}>
        <div className="flex items-center px-4 sm:px-6 lg:px-8 py-2 border-b border-slate-100 bg-background">
          <TabsList aria-label="Strategy views">
            {TABS.map((tab) => {
              const Icon = tab.icon
              return (
                <TabsTrigger key={tab.id} value={tab.id}>
                  <Icon className="h-4 w-4 mr-1.5" />
                  {tab.label}
                </TabsTrigger>
              )
            })}
          </TabsList>

          {/* Right side: status badges + action buttons portaled from child tabs */}
          <div className="ml-auto flex items-center gap-2">
            {activeTab === 'river' && riverData.length > 0 && (
              <>
                <StatusBadge status="success" size="sm" dot>
                  {riverStats.done} done
                </StatusBadge>
                <StatusBadge status="warning" size="sm" dot>
                  {riverStats.inProgress} in progress
                </StatusBadge>
                <StatusBadge status="pending" size="sm" dot>
                  {riverStats.notStarted} not started
                </StatusBadge>
              </>
            )}
            {activeTab === 'link-objectives' && regularObjectives.length > 0 && (
              <>
                <StatusBadge status="success" size="sm" dot>
                  {linkStats.linked} linked
                </StatusBadge>
                <StatusBadge status="pending" size="sm" dot>
                  {linkStats.unlinked} unlinked
                </StatusBadge>
              </>
            )}
            {activeTab === 'whiteboards' && (
              <StatusBadge status="info" size="sm" dot>
                {whiteboards.length} {whiteboards.length === 1 ? 'whiteboard' : 'whiteboards'}
              </StatusBadge>
            )}
            {/* Slot where child tab components portal their action buttons */}
            <div ref={toolbarSlotRef} className="flex items-center gap-2" />
          </div>
        </div>
      </Tabs>

      {/* Tab content */}
      <div id="tabpanel-river" role="tabpanel" aria-labelledby="tab-river" className={activeTab === 'river' ? 'block' : 'hidden'}>
        {riverData.length === 0 ? (
          <EmptyState
            title="No strategic objectives yet"
            description="Create a strategic objective to see your strategy river — a visual timeline of your goals, milestones, and tasks."
          />
        ) : (
          <StrategyRiver
            strategicObjectives={riverData}
            onTaskClick={handleTaskClick}
            onMilestoneClick={handleMilestoneClick}
            onGoalClick={handleGoalClick}
            onAddToRiver={handleAddToRiver}
            expandedObjectiveIds={expandedObjectiveIds}
            onExpandToggle={handleExpandToggle}
            onExpandAll={handleExpandAll}
            onCollapseAll={handleCollapseAll}
          />
        )}
      </div>
      <div id="tabpanel-link-objectives" role="tabpanel" aria-labelledby="tab-link-objectives" className={activeTab === 'link-objectives' ? 'block' : 'hidden'}>
        <StrategyLinkView
          strategicObjectives={strategicObjectives}
          regularObjectives={regularObjectives}
          toolbarPortalRef={activeTab === 'link-objectives' ? toolbarSlotRef : undefined}
        />
      </div>
      <div id="tabpanel-whiteboards" role="tabpanel" aria-labelledby="tab-whiteboards" className={activeTab === 'whiteboards' ? 'block' : 'hidden'}>
        <WhiteboardList
          whiteboards={whiteboards}
          objectives={whiteboardObjectives}
          toolbarPortalRef={activeTab === 'whiteboards' ? toolbarSlotRef : undefined}
        />
      </div>
      <div id="tabpanel-money-map" role="tabpanel" aria-labelledby="tab-money-map" className={activeTab === 'money-map' ? 'block' : 'hidden'}>
        <MoneyMapClient
          hideHeader={true}
          toolbarPortalRef={activeTab === 'money-map' ? toolbarSlotRef : undefined}
        />
      </div>
      <div id="tabpanel-cost-of-delay" role="tabpanel" aria-labelledby="tab-cost-of-delay" className={activeTab === 'cost-of-delay' ? 'block' : 'hidden'}>
        <CostOfDelayView
          toolbarPortalRef={activeTab === 'cost-of-delay' ? toolbarSlotRef : undefined}
        />
      </div>

      {/* Node details dialog — shared across all river clicks */}
      {dialogNodeId && (
        <NodeDetailsDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          nodeType={dialogNodeType}
          nodeId={dialogNodeId}
          isUnlinked={false}
          milestones={milestoneOptions}
          onUpdate={handleDialogUpdate}
        />
      )}

      {/* Add-to-river dialog — create milestone in a specific river lane */}
      <AddToRiverDialog
        open={!!addToRiverGoalId}
        onOpenChange={(open) => { if (!open) setAddToRiverGoalId(null) }}
        strategicObjectiveId={addToRiverGoalId ?? ''}
        strategicObjectiveTitle={
          strategicObjectives.find((so) => so.id === addToRiverGoalId)?.title ?? ''
        }
        onCreated={handleDialogUpdate}
      />
    </div>
  )
}
