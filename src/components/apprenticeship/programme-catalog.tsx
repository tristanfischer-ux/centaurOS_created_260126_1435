'use client'

import { useState, useMemo } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ProgrammeDetailCard } from './programme-detail-card'
import { GraduationCap } from 'lucide-react'
import type { Programme } from './programme-detail-card'

interface ProgrammeCatalogProps {
  programmes: Programme[]
  /** Whether the user can enroll apprentices (Executive/Founder) */
  canEnroll?: boolean
  /** Called when "Enroll Apprentice" is clicked on a programme card */
  onEnroll?: (programmeId: string) => void
}

const LEVEL_FILTERS = [
  { value: 'all', label: 'All Levels' },
  { value: '3', label: 'Level 3' },
  { value: '4', label: 'Level 4' },
  { value: '5', label: 'Level 5' },
  { value: '6', label: 'Level 6' },
  { value: '7', label: 'Level 7' },
] as const

/**
 * Browsable catalogue of all available apprenticeship programmes.
 *
 * @description Displays programmes as rich cards with a level filter.
 * Used by both the Discover landing page (Programmes tab) and the
 * Admin dashboard (Programmes tab).
 */
export function ProgrammeCatalog({ programmes, canEnroll, onEnroll }: ProgrammeCatalogProps) {
  const [levelFilter, setLevelFilter] = useState('all')

  const filtered = useMemo(() => {
    if (levelFilter === 'all') return programmes
    return programmes.filter((p) => p.level === Number(levelFilter))
  }, [programmes, levelFilter])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-international-orange" />
          Programme Catalogue
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {programmes.length} UK-accredited apprenticeship programmes across Levels 3–7
        </p>
      </div>

      {/* Level Filter */}
      <Tabs value={levelFilter} onValueChange={setLevelFilter}>
        <TabsList>
          {LEVEL_FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Programme Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filtered.map((programme) => (
          <ProgrammeDetailCard
            key={programme.id}
            programme={programme}
            canEnroll={canEnroll}
            onEnroll={onEnroll}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12">
          <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">
            No programmes available at this level.
          </p>
        </div>
      )}
    </div>
  )
}
