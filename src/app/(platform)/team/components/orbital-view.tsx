'use client'

/**
 * OrbitalView — radial company health visualisation with side panel.
 *
 * @description Combines PanZoomCanvas (for drag/zoom interaction),
 * OrbitSVG (the visual diagram), and OrbitSidePanel (details on right).
 * Accepts pre-computed teamData from the parent component.
 *
 * @param props.teamData - Pre-computed team data from useTeamData hook
 * @param props.onViewProfile - Callback to open profile modal for real members
 */

import { useState, useCallback } from 'react'
import { PanZoomCanvas } from './pan-zoom-canvas'
import { OrbitSVG } from './orbit-svg'
import { OrbitSidePanel } from './orbit-side-panel'
import type { FunctionId, BusinessFunction } from '../types'
import type { TeamDataResult } from '../hooks/use-team-data'

interface OrbitalViewProps {
  /** Pre-computed team data from useTeamData */
  teamData: TeamDataResult
  /** Business function definitions (custom or default) */
  functions: BusinessFunction[]
  /** Callback to open real profile modal (for internal members) */
  onViewProfile?: (memberId: string) => void
}

export function OrbitalView({
  teamData,
  functions,
  onViewProfile,
}: OrbitalViewProps) {
  const [selected, setSelected] = useState<FunctionId | null>(null)

  const handleSelect = useCallback((id: FunctionId) => {
    setSelected((prev) => (prev === id ? null : id))
  }, [])

  const handleDeselect = useCallback(() => {
    setSelected(null)
  }, [])

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Pan + Zoom Canvas with Orbit SVG */}
      <PanZoomCanvas onBackgroundClick={handleDeselect}>
        <OrbitSVG
          selected={selected}
          onSelect={handleSelect}
          functions={functions}
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
          functions={functions}
          teamCoverage={teamData.coverageByFunction}
          marketplaceCandidates={
            Object.values(teamData.marketplaceByFunction).flat()
          }
          marketplaceListingMap={teamData.marketplaceListingMap}
          teamData={teamData}
          onViewProfile={onViewProfile}
        />
      </div>
    </div>
  )
}
