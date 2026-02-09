'use client'

/**
 * @file canvas-shell.tsx
 *
 * @description Client-side shell for the Canvas page. Provides tab switching
 * between the Strategic Timeline and Whiteboards, with consistent navigation.
 *
 * @related
 * - strategic-canvas-view.tsx — ReactFlow-based timeline
 * - components/whiteboard-list.tsx — whiteboard CRUD list
 */

import React, { useState } from 'react'
import { Waypoints, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

import { StrategicCanvasView } from './strategic-canvas-view'
import type { StrategicGoal } from '@/types/canvas'

// ============================================================================
// TYPES
// ============================================================================

type CanvasTab = 'timeline' | 'whiteboards'

interface CanvasShellProps {
  /** Pre-fetched strategic goals from the server component */
  initialGoals: StrategicGoal[]
  /** Server-rendered whiteboard list */
  whiteboardList: React.ReactNode
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TABS: { id: CanvasTab; label: string; icon: React.ElementType }[] = [
  { id: 'timeline', label: 'Strategic Timeline', icon: Waypoints },
  { id: 'whiteboards', label: 'Whiteboards', icon: Pencil },
]

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * @description Shell component that manages the Timeline / Whiteboards tabs
 * and renders the appropriate content for each.
 */
export function CanvasShell({
  initialGoals,
  whiteboardList,
}: CanvasShellProps) {
  const [activeTab, setActiveTab] = useState<CanvasTab>('timeline')

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
      <div className={activeTab === 'timeline' ? 'block' : 'hidden'}>
        <StrategicCanvasView
          initialGoals={initialGoals}
          onOpenWhiteboards={() => setActiveTab('whiteboards')}
        />
      </div>
      <div className={activeTab === 'whiteboards' ? 'block' : 'hidden'}>
        {whiteboardList}
      </div>
    </div>
  )
}
