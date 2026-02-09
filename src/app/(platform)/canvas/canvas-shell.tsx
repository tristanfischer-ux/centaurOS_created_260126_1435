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

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Waypoints, Pencil, Banknote, Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'

import StrategyRiver from '@/components/canvas/StrategyRiver'
import { goalBundlesToRiverData } from '@/lib/canvas/strategy-river-adapter'
import { NodeDetailsDialog } from '@/components/canvas/node-details-dialog'
import { MoneyMapClient } from '../money-map/money-map-client'
import { CostOfDelayView } from '@/components/tools/cost-of-delay/cost-of-delay-view'
import { EmptyState } from '@/components/ui/empty-state'
import type { GoalBundle } from '@/types/canvas'
import type { MilestoneOption } from '@/types/canvas'

// ============================================================================
// TYPES
// ============================================================================

type CanvasTab = 'river' | 'whiteboards' | 'money-map' | 'cost-of-delay'

interface CanvasShellProps {
  /** Pre-fetched goal bundles for the Strategy River */
  initialBundles: GoalBundle[]
  /** Server-rendered whiteboard list */
  whiteboardList: React.ReactNode
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TABS: { id: CanvasTab; label: string; icon: React.ElementType }[] = [
  { id: 'river', label: 'Strategy River', icon: Waypoints },
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
  whiteboardList,
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

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 sm:px-6 lg:px-8 py-2 border-b border-slate-100 bg-background">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                isActive
                  ? 'bg-orange-50 text-international-orange'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className={activeTab === 'river' ? 'block' : 'hidden'}>
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
          />
        )}
      </div>
      <div className={activeTab === 'whiteboards' ? 'block' : 'hidden'}>
        {whiteboardList}
      </div>
      <div className={activeTab === 'money-map' ? 'block' : 'hidden'}>
        <MoneyMapClient hideHeader={true} />
      </div>
      <div className={activeTab === 'cost-of-delay' ? 'block' : 'hidden'}>
        <CostOfDelayView />
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
    </div>
  )
}
