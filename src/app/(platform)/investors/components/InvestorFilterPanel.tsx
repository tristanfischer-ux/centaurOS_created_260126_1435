/**
 * @file InvestorFilterPanel.tsx
 *
 * @description Expandable advanced filter panel for the investor directory.
 * Stage multi-select, sector multi-select, geo badges, cheque range,
 * quality threshold, BVCA toggle, hardware fit slider.
 */

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { SlidersHorizontal, X, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdvancedFilters {
  stages: string[]
  sectors: string[]
  geoFocus: string[]
  chequeMin: number | undefined
  chequeMax: number | undefined
  minQuality: number | undefined
  minHardwareFit: number | undefined
  bvcaOnly: boolean
}

interface InvestorFilterPanelProps {
  filters: AdvancedFilters
  onChange: (filters: AdvancedFilters) => void
  onClear: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAGE_OPTIONS = ['Pre-Seed', 'Seed', 'Series A', 'Series B', 'Growth', 'Late Stage']
const SECTOR_OPTIONS = [
  'Deep Tech', 'SaaS', 'Fintech', 'Health', 'Climate', 'AI', 'Robotics',
  'Hardware', 'Defence', 'Space', 'Energy', 'Biotech', 'Manufacturing',
]
const GEO_OPTIONS = ['UK', 'Europe', 'US', 'Global']

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InvestorFilterPanel({ filters, onChange, onClear }: InvestorFilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false)

  const activeCount = [
    filters.stages.length > 0,
    filters.sectors.length > 0,
    filters.geoFocus.length > 0,
    filters.chequeMin != null,
    filters.chequeMax != null,
    filters.minQuality != null,
    filters.minHardwareFit != null,
    filters.bvcaOnly,
  ].filter(Boolean).length

  const toggleArrayItem = (key: 'stages' | 'sectors' | 'geoFocus', item: string) => {
    const current = filters[key]
    const next = current.includes(item)
      ? current.filter(v => v !== item)
      : [...current, item]
    onChange({ ...filters, [key]: next })
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className={cn(
          'flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-200',
          activeCount > 0
            ? 'bg-international-orange/10 text-international-orange border-international-orange/40'
            : 'bg-background text-muted-foreground border-border hover:border-foreground/40'
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        {activeCount > 0 ? `${activeCount} filter${activeCount > 1 ? 's' : ''} active` : 'Advanced filters'}
        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {isOpen && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          {/* Stage multi-select */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Stage Focus</Label>
            <div className="flex flex-wrap gap-1.5">
              {STAGE_OPTIONS.map(s => (
                <Badge
                  key={s}
                  variant={filters.stages.includes(s) ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer transition-colors',
                    filters.stages.includes(s) && 'bg-foreground text-background'
                  )}
                  onClick={() => toggleArrayItem('stages', s)}
                >
                  {s}
                </Badge>
              ))}
            </div>
          </div>

          {/* Sector multi-select */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Sectors</Label>
            <div className="flex flex-wrap gap-1.5">
              {SECTOR_OPTIONS.map(s => (
                <Badge
                  key={s}
                  variant={filters.sectors.includes(s) ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer transition-colors',
                    filters.sectors.includes(s) && 'bg-foreground text-background'
                  )}
                  onClick={() => toggleArrayItem('sectors', s)}
                >
                  {s}
                </Badge>
              ))}
            </div>
          </div>

          {/* Geo focus */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Geography</Label>
            <div className="flex flex-wrap gap-1.5">
              {GEO_OPTIONS.map(g => (
                <Badge
                  key={g}
                  variant={filters.geoFocus.includes(g) ? 'default' : 'outline'}
                  className={cn(
                    'cursor-pointer transition-colors',
                    filters.geoFocus.includes(g) && 'bg-foreground text-background'
                  )}
                  onClick={() => toggleArrayItem('geoFocus', g)}
                >
                  {g}
                </Badge>
              ))}
            </div>
          </div>

          {/* Cheque range + Quality + Hardware fit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Min Cheque (£)</Label>
              <Input
                type="number"
                placeholder="e.g. 500000"
                min={0}
                value={filters.chequeMin ?? ''}
                onChange={e => {
                  const raw = e.target.value ? Math.max(0, Number(e.target.value)) : undefined
                  const v = raw != null && isNaN(raw) ? undefined : raw
                  onChange({ ...filters, chequeMin: v })
                }}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Max Cheque (£)</Label>
              <Input
                type="number"
                placeholder="e.g. 5000000"
                min={0}
                value={filters.chequeMax ?? ''}
                onChange={e => {
                  const raw = e.target.value ? Math.max(0, Number(e.target.value)) : undefined
                  const v = raw != null && isNaN(raw) ? undefined : raw
                  onChange({ ...filters, chequeMax: v })
                }}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Min Quality (0-10)</Label>
              <Input
                type="number"
                placeholder="e.g. 7"
                min={0}
                max={10}
                step={0.5}
                value={filters.minQuality ?? ''}
                onChange={e => {
                  const raw = e.target.value ? Math.min(10, Math.max(0, Number(e.target.value))) : undefined
                  const v = raw != null && isNaN(raw) ? undefined : raw
                  onChange({ ...filters, minQuality: v })
                }}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Min Hardware Fit (0-10)</Label>
              <Input
                type="number"
                placeholder="e.g. 5"
                min={0}
                max={10}
                step={0.5}
                value={filters.minHardwareFit ?? ''}
                onChange={e => {
                  const raw = e.target.value ? Math.min(10, Math.max(0, Number(e.target.value))) : undefined
                  const v = raw != null && isNaN(raw) ? undefined : raw
                  onChange({ ...filters, minHardwareFit: v })
                }}
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* BVCA toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Switch
                checked={filters.bvcaOnly}
                onCheckedChange={v => onChange({ ...filters, bvcaOnly: v })}
              />
              <Label className="text-sm">BVCA members only</Label>
            </div>
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" onClick={onClear} className="text-xs">
                <X className="h-3.5 w-3.5 mr-1" />
                Clear all filters
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
