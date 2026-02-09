'use client'

/**
 * TeamPageView — main Team page client component with header + view toggle.
 *
 * @description Renders the shared page header (with orange accent bar,
 * sub-tabs for Members/Workload/Teams, and a List/Orbit toggle) then
 * conditionally renders either the ListView or OrbitalView.
 */

import { useState } from 'react'
import { RefreshCw, UserPlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { typography } from '@/lib/design-system'
import { cn } from '@/lib/utils'
import { ListView } from './components/list-view'
import { OrbitalView } from './components/orbital-view'
import type { TeamViewMode } from './types'

export function TeamPageView() {
  const [view, setView] = useState<TeamViewMode>('list')

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] sm:h-[calc(100vh-3rem)] lg:h-[calc(100vh-4rem)] -m-4 sm:-m-6 lg:-m-8 overflow-hidden">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="bg-background border-b border-slate-100 shrink-0 px-8 pt-5">
        {/* Top row: title + actions */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className={typography.pageHeader}>
              <div className={typography.pageHeaderAccent} />
              <h1 className={typography.h1}>Team</h1>
            </div>
            <p className={typography.pageSubtitle}>
              Manage your people, build teams, and track performance
            </p>
          </div>
          <div className="flex gap-2.5">
            <Button variant="secondary" size="default">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="secondary" size="default">
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Member
            </Button>
            <Button variant="default" size="default">
              <Plus className="h-4 w-4 mr-2" />
              New Team
            </Button>
          </div>
        </div>

        {/* Bottom row: sub-tabs + view toggle */}
        <div className="flex justify-between items-center">
          {/* Sub-tabs */}
          <div className="flex">
            {['Members', 'Workload', 'Teams'].map((tab, i) => (
              <button
                key={tab}
                className={cn(
                  'text-[13px] px-5 py-2.5 border-none bg-transparent cursor-pointer transition-colors',
                  i === 0
                    ? 'font-bold text-foreground border-b-2 border-b-international-orange'
                    : 'font-medium text-muted-foreground hover:text-foreground border-b-2 border-b-transparent'
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex bg-muted rounded-xl p-[3px] gap-0.5">
            <button
              onClick={() => setView('list')}
              className={cn(
                'text-xs font-bold px-4 py-[7px] rounded-lg border-none cursor-pointer transition-all duration-150',
                view === 'list'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'bg-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              ☰ List
            </button>
            <button
              onClick={() => setView('orbit')}
              className={cn(
                'text-xs font-bold px-4 py-[7px] rounded-lg border-none cursor-pointer transition-all duration-150',
                view === 'orbit'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'bg-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              ◎ Orbit
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">
        {view === 'list' ? (
          <div className="flex-1 overflow-y-auto py-6">
            <ListView />
          </div>
        ) : (
          <OrbitalView />
        )}
      </div>
    </div>
  )
}
