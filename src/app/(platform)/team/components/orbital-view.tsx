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

// ── Primary specialist per function (one per slice for clean orbital ring) ───
// Only these 7 specialists appear on the diagram; others remain on /agents.
const PRIMARY_SPECIALIST_MAP: Record<string, FunctionId> = {
  'strategist':       'product',     // Sage — most senior for Product
  'chief-of-staff':   'operations',  // Cal — most senior for Operations
  'finance-lead':     'finance',     // Finn — most senior for Finance
  'legal-counsel':    'legal',       // Leo — most senior for Legal
  'sales-lead':       'sales',       // Sal — sole Sales specialist
  'growth-marketer':  'marketing',   // Mia — sole Marketing specialist
  'hiring-team':      'hr',          // Harper — sole HR specialist
}

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
 * @param name - A short name like "Sage" or "Priya"
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

  /** Map primary specialists only to orbit nodes (one per function). */
  const specialistNodes: SpecialistNode[] = useMemo(
    () =>
      SPECIALISTS.filter((s) => s.id in PRIMARY_SPECIALIST_MAP).map((s) => ({
        id: s.id,
        name: s.name,
        initials: nameToInitials(s.name),
        title: s.title,
        functionId: PRIMARY_SPECIALIST_MAP[s.id],
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
    <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
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

      {/* Side Panel — full-width bottom sheet on mobile, 340px sidebar on desktop */}
      <div className="w-full md:w-[340px] max-h-[40vh] md:max-h-none border-t md:border-t-0 md:border-l border-border overflow-y-auto bg-muted/30">
        <OrbitSidePanel
          selected={selected}
          functions={functions}
          teamCoverage={teamData.coverageByFunction}
          marketplaceCandidates={
            Object.values(teamData.marketplaceByFunction).flat()
          }
          marketplaceListingMap={teamData.marketplaceListingMap}
          teamData={teamData}
          specialists={specialistNodes}
          onViewProfile={onViewProfile}
          onSpecialistClick={handleSpecialistClick}
        />
      </div>
    </div>
  )
}
