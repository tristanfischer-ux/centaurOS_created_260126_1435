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

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { PanZoomCanvas } from './pan-zoom-canvas'
import { OrbitSVG } from './orbit-svg'
import { OrbitSidePanel } from './orbit-side-panel'
import { SPECIALISTS } from '../../agents/specialists-data'
import type { FunctionId, BusinessFunction, SpecialistNode } from '../types'
import type { TeamDataResult } from '../hooks/use-team-data'

interface OrbitalViewProps {
  /** Pre-computed team data from useTeamData */
  teamData: TeamDataResult
  /** Business function definitions (custom or default) */
  functions: BusinessFunction[]
  /** Callback to open real profile modal (for internal members) */
  onViewProfile?: (memberId: string) => void
}

/**
 * Derives a two-letter initial from a single first name.
 *
 * @param name - A short name like "Sam" or "Priya"
 * @returns The first letter capitalised (e.g. "Sa", "Pr")
 */
function nameToInitials(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length <= 2) return trimmed.toUpperCase()
  return trimmed.slice(0, 2).toUpperCase()
}

export function OrbitalView({
  teamData,
  functions,
  onViewProfile,
}: OrbitalViewProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<FunctionId | null>(null)

  const handleSelect = useCallback((id: FunctionId) => {
    setSelected((prev) => (prev === id ? null : id))
  }, [])

  const handleDeselect = useCallback(() => {
    setSelected(null)
  }, [])

  /** Map the static specialist roster to lightweight orbit nodes */
  const specialistNodes: SpecialistNode[] = useMemo(
    () =>
      SPECIALISTS.map((s) => ({
        id: s.id,
        name: s.name,
        initials: nameToInitials(s.name),
        title: s.title,
      })),
    []
  )

  const handleSpecialistClick = useCallback(
    (specialistId: string) => {
      router.push(`/agents?specialist=${specialistId}`)
    },
    [router]
  )

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
          specialists={specialistNodes}
          onSpecialistClick={handleSpecialistClick}
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
