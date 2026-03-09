'use client'

/**
 * AssemblerCompareDialog — Side-by-side comparison of matched assembly companies.
 *
 * @description Displays 2-4 assemblers in a grid, comparing match score,
 * score breakdown, location, lead time, capabilities, certifications, and website.
 * Highlights best values for match score (highest) and lead time (lowest).
 *
 * Follows the same grid pattern as TechniqueCompareDialog.
 */

import { useMemo } from 'react'
import {
  X,
  ShieldCheck,
  MapPin,
  Clock,
  ExternalLink,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { AssemblyCompanyMatch } from '@/lib/assembly-utils'

// ---------------------------------------------------------------------------
// Helper: find assembler with best value for a numeric metric
// ---------------------------------------------------------------------------

type BestResult = { id: string; value: number } | null

function findBest(
  assemblers: AssemblyCompanyMatch[],
  getValue: (a: AssemblyCompanyMatch) => number | null,
  direction: 'lower' | 'higher',
): BestResult {
  const values: { id: string; value: number }[] = []
  for (const a of assemblers) {
    const v = getValue(a)
    if (v !== null) values.push({ id: a.id, value: v })
  }
  if (values.length < 2) return null

  const sorted = [...values].sort((a, b) =>
    direction === 'lower' ? a.value - b.value : b.value - a.value,
  )
  if (sorted[0].value === sorted[1].value) return null
  return sorted[0]
}

// ---------------------------------------------------------------------------
// Grid class helper (avoids repeating ternary everywhere)
// ---------------------------------------------------------------------------

function gridCols(count: number): string {
  if (count <= 2) return 'grid-cols-1 sm:grid-cols-2'
  if (count === 3) return 'grid-cols-1 sm:grid-cols-3'
  return 'grid-cols-2 sm:grid-cols-4'
}

// ---------------------------------------------------------------------------
// AssemblerCompareDialog
// ---------------------------------------------------------------------------

interface AssemblerCompareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assemblers: AssemblyCompanyMatch[]
  onRemove: (id: string) => void
}

export function AssemblerCompareDialog({
  open,
  onOpenChange,
  assemblers,
  onRemove,
}: AssemblerCompareDialogProps) {
  const bestScore = useMemo(
    () => findBest(assemblers, (a) => a.matchScore, 'higher'),
    [assemblers],
  )

  const bestLeadTime = useMemo(
    () => findBest(assemblers, (a) => a.typicalLeadDays, 'lower'),
    [assemblers],
  )

  const bestCerts = useMemo(
    () => findBest(assemblers, (a) => a.certifications.length, 'higher'),
    [assemblers],
  )

  const cols = gridCols(assemblers.length)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-xl font-semibold">
            Compare Assemblers
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {assemblers.length} assembler{assemblers.length !== 1 ? 's' : ''} selected for comparison.
          </p>
        </DialogHeader>

        <Separator />

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-4">
            {/* ── Headers ── */}
            <div className={cn('grid gap-4', cols)}>
              {assemblers.map((a) => (
                <div key={a.id} className="relative p-3 rounded-lg border bg-card">
                  <button
                    onClick={() => onRemove(a.id)}
                    className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted transition-colors"
                    aria-label={`Remove ${a.name}`}
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <div className="flex items-center gap-2 pr-6">
                    <p className="text-sm font-semibold truncate">{a.name}</p>
                    {a.isVerified && (
                      <ShieldCheck className="h-3.5 w-3.5 text-success shrink-0" />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Match Score ── */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                Match Score
              </p>
              <div className={cn('grid gap-2', cols)}>
                {assemblers.map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      'flex items-center gap-2 p-2 rounded-md',
                      bestScore?.id === a.id && 'bg-status-success-light',
                    )}
                  >
                    <span className={cn(
                      'text-sm font-semibold font-mono px-2 py-0.5 rounded-full',
                      a.matchScore >= 50
                        ? 'bg-success/10 text-success'
                        : a.matchScore >= 30
                          ? 'bg-warning/10 text-warning'
                          : 'bg-muted text-muted-foreground',
                    )}>
                      {Math.round(a.matchScore)}
                    </span>
                    <span className="text-xs text-muted-foreground">/ 100</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Score Breakdown ── */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                Score Breakdown
              </p>
              <div className={cn('grid gap-4', cols)}>
                {assemblers.map((a) => {
                  const items = [
                    { label: 'S', value: a.scoreBreakdown.semantic, max: 30 },
                    { label: 'C', value: a.scoreBreakdown.capability, max: 25 },
                    { label: 'F', value: a.scoreBreakdown.capacity, max: 15 },
                    { label: 'Q', value: a.scoreBreakdown.quality, max: 15 },
                    { label: 'K', value: a.scoreBreakdown.keyword, max: 15 },
                  ]
                  return (
                    <div key={a.id} className="space-y-1 p-2 rounded-md">
                      {items.map(({ label, value, max }) => (
                        <div key={label} className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold text-muted-foreground w-3 text-right">{label}</span>
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${(value / max) * 100}%`,
                                backgroundColor: value > max * 0.5 ? '#059669' : value > 0 ? '#d97706' : '#94a3b8',
                              }}
                            />
                          </div>
                          <span className="text-[9px] text-muted-foreground font-mono w-7 text-right">{value}/{max}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Location ── */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                Location
              </p>
              <div className={cn('grid gap-2', cols)}>
                {assemblers.map((a) => (
                  <div key={a.id} className="flex items-center gap-1.5 p-2 rounded-md">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">{a.locationCountry ?? 'Unknown'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Lead Time ── */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                Lead Time
              </p>
              <div className={cn('grid gap-2', cols)}>
                {assemblers.map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      'flex items-center gap-1.5 p-2 rounded-md',
                      bestLeadTime?.id === a.id && 'bg-status-success-light',
                    )}
                  >
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">
                      {a.typicalLeadDays != null ? `${a.typicalLeadDays} days` : 'N/A'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Capabilities ── */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                Capabilities
              </p>
              <div className={cn('grid gap-4', cols)}>
                {assemblers.map((a) => (
                  <div key={a.id} className="flex flex-wrap gap-1 p-2 rounded-md">
                    {a.capabilities.length > 0 ? a.capabilities.map((c) => (
                      <Badge key={c} variant="secondary" className="text-[10px]">
                        {c.replace(/_/g, ' ')}
                      </Badge>
                    )) : (
                      <span className="text-xs text-muted-foreground">None listed</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* ── Certifications ── */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                Certifications
              </p>
              <div className={cn('grid gap-4', cols)}>
                {assemblers.map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      'flex flex-wrap gap-1 p-2 rounded-md',
                      bestCerts?.id === a.id && 'bg-status-success-light',
                    )}
                  >
                    {a.certifications.length > 0 ? a.certifications.map((cert) => (
                      <Badge key={cert} variant="success" className="text-[10px]">
                        {cert}
                      </Badge>
                    )) : (
                      <span className="text-xs text-muted-foreground">None</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Website ── */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                Website
              </p>
              <div className={cn('grid gap-2', cols)}>
                {assemblers.map((a) => (
                  <div key={a.id} className="p-2 rounded-md">
                    {a.websiteUrl ? (
                      <a
                        href={a.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-info hover:text-info/80 transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {a.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">N/A</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Match Reasons ── */}
            <Separator />
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                Match Reasons
              </p>
              <div className={cn('grid gap-4', cols)}>
                {assemblers.map((a) => (
                  <ul key={a.id} className="space-y-1 p-2 rounded-md">
                    {a.matchReasons.length > 0 ? a.matchReasons.map((reason, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        {reason}
                      </li>
                    )) : (
                      <li className="text-xs text-muted-foreground">No reasons listed</li>
                    )}
                  </ul>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
