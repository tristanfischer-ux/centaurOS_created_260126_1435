'use client'

/**
 * @file canvas-shell.tsx
 *
 * @description Client-side shell for the Strategy page. Provides tab switching
 * between Strategy Flow, Strategic Timeline, Whiteboards, Money Map, and Cost of Delay.
 *
 * @related
 * - strategy-flow-view.tsx — Sankey-inspired flow visualization
 * - strategic-canvas-view.tsx — ReactFlow-based timeline
 * - components/whiteboard-list.tsx — whiteboard CRUD list
 * - money-map-client.tsx — Money Map financial visualization
 * - cost-of-delay-view.tsx — Cost of Delay calculator
 */

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Waypoints, Pencil, GitBranch, Banknote, Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'

import { StrategyFlowView } from './strategy-flow-view'
import { StrategicCanvasView } from './strategic-canvas-view'
import { MoneyMapClient } from '../money-map/money-map-client'
import { CostOfDelayView } from '@/components/tools/cost-of-delay/cost-of-delay-view'
import type { StrategicGoal, GoalBundle } from '@/types/canvas'

// ============================================================================
// TYPES
// ============================================================================

type CanvasTab = 'flow' | 'timeline' | 'whiteboards' | 'money-map' | 'cost-of-delay'

interface CanvasShellProps {
  /** Pre-fetched strategic goals from the server component */
  initialGoals: StrategicGoal[]
  /** Pre-fetched goal bundles (parallel to initialGoals) for flow view */
  initialBundles: GoalBundle[]
  /** Server-rendered whiteboard list */
  whiteboardList: React.ReactNode
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TABS: { id: CanvasTab; label: string; icon: React.ElementType }[] = [
  { id: 'flow', label: 'Strategy Flow', icon: GitBranch },
  { id: 'timeline', label: 'Strategic Timeline', icon: Waypoints },
  { id: 'whiteboards', label: 'Whiteboards', icon: Pencil },
  { id: 'money-map', label: 'Money Map', icon: Banknote },
  { id: 'cost-of-delay', label: 'Cost of Delay', icon: Calculator },
]

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * @description Shell component that manages the Strategy Flow / Timeline /
 * Whiteboards tabs and renders the appropriate content for each.
 */
export function CanvasShell({
  initialGoals,
  initialBundles,
  whiteboardList,
}: CanvasShellProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') as CanvasTab | null
  
  const [activeTab, setActiveTab] = useState<CanvasTab>(
    tabParam && TABS.some(t => t.id === tabParam) ? tabParam : 'flow'
  )

  // Update URL when tab changes
  useEffect(() => {
    if (activeTab !== 'flow') {
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
      <div className={activeTab === 'flow' ? 'block' : 'hidden'}>
        <StrategyFlowView
          initialGoals={initialGoals}
          initialBundles={initialBundles}
        />
      </div>
      <div className={activeTab === 'timeline' ? 'block' : 'hidden'}>
        <StrategicCanvasView
          initialGoals={initialGoals}
          onOpenWhiteboards={() => setActiveTab('whiteboards')}
        />
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
    </div>
  )
}
