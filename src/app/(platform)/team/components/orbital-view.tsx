'use client'

/**
 * OrbitalView — radial company health visualisation with side panel.
 *
 * @description Combines PanZoomCanvas (for drag/zoom interaction),
 * OrbitSVG (the visual diagram), and OrbitSidePanel (details on right).
 * Accepts real Supabase data and transforms it via useTeamData.
 *
 * @param props.founders - Founder profiles from page
 * @param props.executives - Executive profiles from page
 * @param props.apprentices - Apprentice profiles from page
 * @param props.marketplacePeople - Marketplace People listings
 * @param props.functionCategoryMap - business_function.id → category
 * @param props.coverageSummary - Coverage summary per function category
 * @param props.onViewProfile - Callback to open profile modal for real members
 */

import { useState, useCallback } from 'react'
import { PanZoomCanvas } from './pan-zoom-canvas'
import { OrbitSVG } from './orbit-svg'
import { OrbitSidePanel } from './orbit-side-panel'
import { useTeamData } from '../hooks/use-team-data'
import { FUNCTIONS } from '../constants'
import type { FunctionId, OrbitProfile, MarketplacePersonListing, CoverageSummaryEntry } from '../types'

interface OrbitalViewProps {
  founders: OrbitProfile[]
  executives: OrbitProfile[]
  apprentices: OrbitProfile[]
  marketplacePeople: MarketplacePersonListing[]
  functionCategoryMap: Record<string, string>
  coverageSummary: Record<string, CoverageSummaryEntry>
  /** Callback to open real profile modal (for internal members) */
  onViewProfile?: (memberId: string) => void
}

export function OrbitalView({
  founders,
  executives,
  apprentices,
  marketplacePeople,
  functionCategoryMap,
  coverageSummary,
  onViewProfile,
}: OrbitalViewProps) {
  const [selected, setSelected] = useState<FunctionId | null>(null)

  const handleSelect = useCallback((id: FunctionId) => {
    setSelected((prev) => (prev === id ? null : id))
  }, [])

  const handleDeselect = useCallback(() => {
    setSelected(null)
  }, [])

  // Transform real data into orbit-compatible shape
  const teamData = useTeamData({
    founders,
    executives,
    apprentices,
    marketplacePeople,
    functionCategoryMap,
    coverageSummary,
  })

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Pan + Zoom Canvas with Orbit SVG */}
      <PanZoomCanvas onBackgroundClick={handleDeselect}>
        <OrbitSVG
          selected={selected}
          onSelect={handleSelect}
          functions={FUNCTIONS}
          teamCoverage={teamData.coverageByFunction}
          founders={teamData.founders}
          marketplaceCandidates={
            Object.values(teamData.marketplaceByFunction).flat()
          }
        />
      </PanZoomCanvas>

      {/* Side Panel (340px) */}
      <div className="w-[340px] border-l border-border overflow-y-auto bg-muted/30">
        <OrbitSidePanel
          selected={selected}
          functions={FUNCTIONS}
          teamCoverage={teamData.coverageByFunction}
          marketplaceCandidates={
            Object.values(teamData.marketplaceByFunction).flat()
          }
          marketplaceListingMap={teamData.marketplaceListingMap}
          onViewProfile={onViewProfile}
        />
      </div>
    </div>
  )
}
