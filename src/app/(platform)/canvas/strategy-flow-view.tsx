'use client'

/**
 * @file strategy-flow-view.tsx
 *
 * @description Strategy Flow view — a Sankey-inspired visualization of the
 * strategic hierarchy. Two modes:
 *   - Overview: all strategic goals → task status distribution
 *   - Detail: single goal → milestones → objectives → task status
 *
 * Uses the custom Sankey layout engine (src/lib/canvas/sankey-layout.ts)
 * and SVG chart renderer (src/components/canvas/strategy-flow-chart.tsx).
 *
 * @related
 * - Layout engine: src/lib/canvas/sankey-layout.ts
 * - Chart component: src/components/canvas/strategy-flow-chart.tsx
 * - Canvas shell: src/app/(platform)/canvas/canvas-shell.tsx
 * - Types: src/types/canvas.ts
 */

import React, { useState, useMemo, useTransition, useCallback } from 'react'
import { ArrowLeft, Target, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { StrategyFlowChart } from '@/components/canvas/strategy-flow-chart'
import {
  computeOverviewLayout,
  computeDetailLayout,
} from '@/lib/canvas/sankey-layout'
import { getGoalBundle } from '@/actions/canvas'

import type { StrategicGoal, GoalBundle } from '@/types/canvas'
import type { SankeyNode } from '@/lib/canvas/sankey-layout'

// ============================================================================
// TYPES
// ============================================================================

type ViewMode = 'overview' | 'detail'

interface StrategyFlowViewProps {
  /** Pre-fetched strategic goals */
  initialGoals: StrategicGoal[]
  /** Pre-fetched goal bundles (parallel to initialGoals) */
  initialBundles: GoalBundle[]
  /** Callback to open the Goal Wizard for creating new goals */
  onCreateGoal?: () => void
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * StrategyFlowView — Main view component for the Strategy Flow tab.
 *
 * @description Manages the overview/detail mode switching and data fetching
 * for the Sankey flow visualization.
 *
 * @param initialGoals - Strategic goals from server
 * @param initialBundles - Goal bundles from server (for overview task counts)
 * @param onCreateGoal - Opens the goal creation wizard
 */
export function StrategyFlowView({
  initialGoals,
  initialBundles,
  onCreateGoal,
}: StrategyFlowViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('overview')
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null)
  const [detailBundle, setDetailBundle] = useState<GoalBundle | null>(null)
  const [isPending, startTransition] = useTransition()

  // Compute overview layout from initial data
  const overviewLayout = useMemo(
    () => computeOverviewLayout(initialGoals, initialBundles),
    [initialGoals, initialBundles]
  )

  // Compute detail layout when a goal is selected
  const detailLayout = useMemo(() => {
    if (!detailBundle) return null
    return computeDetailLayout(detailBundle)
  }, [detailBundle])

  /**
   * Handle clicking a goal node to drill down into its details.
   *
   * @param node - The clicked Sankey node
   */
  const handleNodeClick = useCallback(
    (node: SankeyNode) => {
      if (node.metadata.type !== 'goal' || !node.metadata.goalId) return

      const goalId = node.metadata.goalId

      // Check if we already have this bundle from initial data
      const existingBundle = initialBundles.find(
        (b) => b.goal.id === goalId
      )

      if (existingBundle) {
        setDetailBundle(existingBundle)
        setSelectedGoalId(goalId)
        setViewMode('detail')
        return
      }

      // Fetch the bundle if not preloaded
      startTransition(async () => {
        const result = await getGoalBundle(goalId)
        if ('data' in result) {
          setDetailBundle(result.data)
          setSelectedGoalId(goalId)
          setViewMode('detail')
        }
      })
    },
    [initialBundles]
  )

  /**
   * Return to the overview from detail view.
   */
  const handleBack = useCallback(() => {
    setViewMode('overview')
    setSelectedGoalId(null)
    setDetailBundle(null)
  }, [])

  // Find the selected goal's title for the detail header
  const selectedGoal = initialGoals.find((g) => g.id === selectedGoalId)

  // Empty state: no strategic goals exist
  if (initialGoals.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px] p-8">
        <EmptyState
          title="No strategic goals yet"
          description="Create your first strategic goal to see the strategy flow visualization. Goals decompose into milestones, objectives, and tasks."
          action={
            onCreateGoal ? (
              <Button onClick={onCreateGoal}>
                <Target className="h-4 w-4 mr-2" />
                Create Strategic Goal
              </Button>
            ) : undefined
          }
        />
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {viewMode === 'detail' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" />
              All Goals
            </Button>
          )}
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {viewMode === 'overview'
                ? 'Strategy Overview'
                : selectedGoal?.title ?? 'Goal Detail'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {viewMode === 'overview'
                ? `${initialGoals.length} strategic goal${initialGoals.length !== 1 ? 's' : ''} — click a goal to drill down`
                : 'Goal → Milestones → Objectives → Task Status'}
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-6 rounded-full bg-international-orange" />
            Goals
          </span>
          {viewMode === 'detail' && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-6 rounded-full bg-electric-blue" />
                Milestones
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-6 rounded-full bg-muted-foreground" />
                Objectives
              </span>
            </>
          )}
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-6 rounded-full bg-status-success" />
            Completed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-6 rounded-full bg-status-warning" />
            In Progress
          </span>
        </div>
      </div>

      {/* Loading state */}
      {isPending && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">
            Loading goal details...
          </span>
        </div>
      )}

      {/* Sankey chart */}
      {!isPending && viewMode === 'overview' && (
        <StrategyFlowChart
          layout={overviewLayout}
          onNodeClick={handleNodeClick}
        />
      )}

      {!isPending && viewMode === 'detail' && detailLayout && (
        <StrategyFlowChart layout={detailLayout} />
      )}
    </div>
  )
}
