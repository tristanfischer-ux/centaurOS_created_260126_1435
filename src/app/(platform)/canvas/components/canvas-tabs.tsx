"use client"

import React, { useState } from "react"
import { Waypoints, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * @description Client-side tab switcher between the Spatial Data Canvas
 * and the Whiteboards list. Uses simple state rather than URL-based tabs
 * to avoid re-fetching data on tab switch.
 */

interface CanvasTabsProps {
  spatialCanvas: React.ReactNode
  whiteboardList: React.ReactNode
}

const TABS = [
  { id: 'spatial' as const, label: 'Spatial Map', icon: Waypoints },
  { id: 'whiteboards' as const, label: 'Whiteboards', icon: Pencil },
]

export function CanvasTabs({ spatialCanvas, whiteboardList }: CanvasTabsProps) {
  const [activeTab, setActiveTab] = useState<'spatial' | 'whiteboards'>('spatial')

  return (
    <div>
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 sm:px-6 lg:px-8 py-2 bg-white border-b border-border">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                isActive
                  ? "bg-orange-50 text-international-orange"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      <div className={activeTab === 'spatial' ? 'block' : 'hidden'}>
        {spatialCanvas}
      </div>
      <div className={activeTab === 'whiteboards' ? 'block' : 'hidden'}>
        {whiteboardList}
      </div>
    </div>
  )
}
