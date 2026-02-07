'use client'

/**
 * TechniqueCompareDialog — Side-by-side comparison of manufacturing techniques.
 *
 * @description Displays 2-4 techniques in a grid, comparing key specs
 * (cost, lead time, tolerance, batch size, surface finish, materials,
 * pros/cons). Highlights the best value for each comparable metric.
 *
 * @component
 *
 * @example
 * <TechniqueCompareDialog
 *   open={showCompare}
 *   onOpenChange={setShowCompare}
 *   initialTechniques={[selectedTechnique]}
 * />
 */

import { useState, useMemo, useCallback } from 'react'
import {
  X,
  Plus,
  PoundSterling,
  Clock,
  Ruler,
  Layers,
  CheckCircle2,
  XCircle,
  Search,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  ALL_TECHNIQUES,
  searchTechniques,
} from '@/lib/manufacturing-techniques'
import type { ManufacturingTechnique, CostTier } from '@/lib/manufacturing-techniques/types'
import { CATEGORY_LABELS } from '@/lib/manufacturing-techniques/types'
import { CATEGORY_ICONS, CATEGORY_COLORS } from './technique-card'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_COMPARE = 4

/** Numeric cost tiers for comparison (lower = cheaper = better for cost). */
const COST_ORDER: Record<CostTier, number> = {
  low: 1,
  medium: 2,
  high: 3,
  'very-high': 4,
}

const COST_LABELS: Record<CostTier, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  'very-high': 'Very High',
}

const BATCH_ORDER: Record<string, number> = {
  prototype: 0,
  low: 1,
  medium: 2,
  high: 3,
}

// ---------------------------------------------------------------------------
// Helper: determine "best" for a metric across techniques
// ---------------------------------------------------------------------------

type BestResult = { techId: string; value: number } | null

/**
 * Find the technique with the best value for a numeric metric.
 *
 * @param techniques - Techniques to compare
 * @param getValue - Extract numeric value from technique
 * @param direction - Whether lower or higher is better
 * @returns The technique ID with the best value, or null if no clear winner
 */
function findBest(
  techniques: ManufacturingTechnique[],
  getValue: (t: ManufacturingTechnique) => number | null,
  direction: 'lower' | 'higher',
): BestResult {
  const values: { techId: string; value: number }[] = []
  for (const t of techniques) {
    const v = getValue(t)
    if (v !== null) values.push({ techId: t.id, value: v })
  }
  if (values.length < 2) return null

  const sorted = [...values].sort((a, b) =>
    direction === 'lower' ? a.value - b.value : b.value - a.value,
  )
  // Only highlight if there's a meaningful difference
  if (sorted[0].value === sorted[1].value) return null
  return sorted[0]
}

// ---------------------------------------------------------------------------
// Technique Picker (inline search)
// ---------------------------------------------------------------------------

function TechniquePicker({
  onSelect,
  excludeIds,
}: {
  onSelect: (technique: ManufacturingTechnique) => void
  excludeIds: Set<string>
}) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const searched = query.trim()
      ? searchTechniques(query)
      : ALL_TECHNIQUES.slice(0, 20)
    return searched.filter(t => !excludeIds.has(t.id)).slice(0, 8)
  }, [query, excludeIds])

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search techniques..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="pl-9"
          autoFocus
        />
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {results.map(t => {
          const Icon = CATEGORY_ICONS[t.category]
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm',
                'hover:bg-muted transition-colors text-left',
              )}
            >
              <div
                className={cn(
                  'flex items-center justify-center rounded h-6 w-6 shrink-0',
                  CATEGORY_COLORS[t.category],
                )}
              >
                <Icon className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{t.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {CATEGORY_LABELS[t.category]}
                </p>
              </div>
            </button>
          )
        })}
        {results.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No techniques found
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Comparison row components
// ---------------------------------------------------------------------------

function CostCell({
  tier,
  isBest,
}: {
  tier: CostTier
  isBest: boolean
}) {
  const filled = COST_ORDER[tier]
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 p-2 rounded-md',
        isBest && 'bg-status-success-light',
      )}
    >
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4].map(i => (
          <PoundSterling
            key={i}
            className={cn(
              'h-3 w-3',
              i <= filled ? 'text-international-orange' : 'text-muted-foreground/30',
            )}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{COST_LABELS[tier]}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TechniqueCompareDialog
// ---------------------------------------------------------------------------

interface TechniqueCompareDialogProps {
  /** Controlled open state */
  open: boolean
  /** Called when dialog open state changes */
  onOpenChange: (open: boolean) => void
  /** Techniques to pre-load into the comparison */
  initialTechniques?: ManufacturingTechnique[]
}

export function TechniqueCompareDialog({
  open,
  onOpenChange,
  initialTechniques = [],
}: TechniqueCompareDialogProps) {
  const [techniques, setTechniques] = useState<ManufacturingTechnique[]>(initialTechniques)
  const [showPicker, setShowPicker] = useState(false)

  // Reset when dialog opens with new initial techniques
  // (handled by parent re-mounting or passing key)

  const excludeIds = useMemo(
    () => new Set(techniques.map(t => t.id)),
    [techniques],
  )

  const handleAddTechnique = useCallback(
    (t: ManufacturingTechnique) => {
      setTechniques(prev => [...prev, t])
      setShowPicker(false)
    },
    [],
  )

  const handleRemoveTechnique = useCallback((id: string) => {
    setTechniques(prev => prev.filter(t => t.id !== id))
  }, [])

  // Compute "best" values
  const bestCost = useMemo(
    () =>
      findBest(techniques, t => COST_ORDER[t.costTier], 'lower'),
    [techniques],
  )

  const bestTolerance = useMemo(
    () =>
      findBest(
        techniques,
        t => {
          if (!t.toleranceRange) return null
          // Extract first number from tolerance, e.g. "±0.05mm" -> 0.05
          const match = t.toleranceRange.match(/([\d.]+)/)
          return match ? parseFloat(match[1]) : null
        },
        'lower', // tighter tolerance = better
      ),
    [techniques],
  )

  const bestBatchMax = useMemo(
    () =>
      findBest(
        techniques,
        t => BATCH_ORDER[t.batchSize.max] ?? 0,
        'higher', // higher max batch = more scalable
      ),
    [techniques],
  )

  const canAdd = techniques.length < MAX_COMPARE
  const hasEnough = techniques.length >= 2

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0"
      >
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-xl font-semibold">
            Compare Techniques
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Select {MAX_COMPARE > 2 ? `up to ${MAX_COMPARE}` : '2'} techniques to compare side by side.
          </p>
        </DialogHeader>

        <Separator />

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-6">
            {/* ---------------------------------------------------------- */}
            {/* Technique headers                                         */}
            {/* ---------------------------------------------------------- */}
            <div className={cn(
              'grid gap-4',
              techniques.length <= 2
                ? 'grid-cols-1 sm:grid-cols-2'
                : techniques.length === 3
                  ? 'grid-cols-1 sm:grid-cols-3'
                  : 'grid-cols-2 sm:grid-cols-4',
            )}>
              {techniques.map(t => {
                const Icon = CATEGORY_ICONS[t.category]
                return (
                  <div
                    key={t.id}
                    className="relative p-3 rounded-lg border bg-card"
                  >
                    <button
                      onClick={() => handleRemoveTechnique(t.id)}
                      className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted transition-colors"
                      aria-label={`Remove ${t.name}`}
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <div className="flex items-center gap-2 mb-2 pr-6">
                      <div
                        className={cn(
                          'flex items-center justify-center rounded-lg h-8 w-8 shrink-0',
                          CATEGORY_COLORS[t.category],
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{t.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {CATEGORY_LABELS[t.category]}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Add technique slot */}
              {canAdd && (
                <div className="relative">
                  {showPicker ? (
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          Add technique
                        </p>
                        <button
                          onClick={() => setShowPicker(false)}
                          className="p-1 rounded-full hover:bg-muted"
                        >
                          <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      </div>
                      <TechniquePicker
                        onSelect={handleAddTechnique}
                        excludeIds={excludeIds}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowPicker(true)}
                      className={cn(
                        'w-full h-full min-h-[80px] rounded-lg border-2 border-dashed',
                        'flex flex-col items-center justify-center gap-2 p-3',
                        'text-muted-foreground hover:text-foreground hover:border-international-orange/30',
                        'transition-colors',
                      )}
                    >
                      <Plus className="h-5 w-5" />
                      <span className="text-xs font-medium">Add Technique</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ---------------------------------------------------------- */}
            {/* Comparison grid (only when 2+ techniques selected)         */}
            {/* ---------------------------------------------------------- */}
            {hasEnough && (
              <div className="space-y-4">
                {/* Cost Tier */}
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                    Cost Tier
                  </p>
                  <div className={cn(
                    'grid gap-2',
                    techniques.length === 2
                      ? 'grid-cols-2'
                      : techniques.length === 3
                        ? 'grid-cols-3'
                        : 'grid-cols-2 sm:grid-cols-4',
                  )}>
                    {techniques.map(t => (
                      <CostCell
                        key={t.id}
                        tier={t.costTier}
                        isBest={bestCost?.techId === t.id}
                      />
                    ))}
                  </div>
                </div>

                {/* Lead Time */}
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                    Lead Time
                  </p>
                  <div className={cn(
                    'grid gap-2',
                    techniques.length === 2
                      ? 'grid-cols-2'
                      : techniques.length === 3
                        ? 'grid-cols-3'
                        : 'grid-cols-2 sm:grid-cols-4',
                  )}>
                    {techniques.map(t => (
                      <div key={t.id} className="flex items-center gap-1.5 p-2 rounded-md">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">
                          {t.leadTime || 'Varies'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tolerance */}
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                    Tolerance
                  </p>
                  <div className={cn(
                    'grid gap-2',
                    techniques.length === 2
                      ? 'grid-cols-2'
                      : techniques.length === 3
                        ? 'grid-cols-3'
                        : 'grid-cols-2 sm:grid-cols-4',
                  )}>
                    {techniques.map(t => (
                      <div
                        key={t.id}
                        className={cn(
                          'flex items-center gap-1.5 p-2 rounded-md',
                          bestTolerance?.techId === t.id && 'bg-status-success-light',
                        )}
                      >
                        <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">
                          {t.toleranceRange || 'N/A'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Batch Size Range */}
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                    Batch Size
                  </p>
                  <div className={cn(
                    'grid gap-2',
                    techniques.length === 2
                      ? 'grid-cols-2'
                      : techniques.length === 3
                        ? 'grid-cols-3'
                        : 'grid-cols-2 sm:grid-cols-4',
                  )}>
                    {techniques.map(t => (
                      <div
                        key={t.id}
                        className={cn(
                          'flex items-center gap-1.5 p-2 rounded-md',
                          bestBatchMax?.techId === t.id && 'bg-status-success-light',
                        )}
                      >
                        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">
                          {t.batchSize.min === t.batchSize.max
                            ? t.batchSize.min
                            : `${t.batchSize.min} → ${t.batchSize.max}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Surface Finish */}
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                    Surface Finish
                  </p>
                  <div className={cn(
                    'grid gap-2',
                    techniques.length === 2
                      ? 'grid-cols-2'
                      : techniques.length === 3
                        ? 'grid-cols-3'
                        : 'grid-cols-2 sm:grid-cols-4',
                  )}>
                    {techniques.map(t => (
                      <div key={t.id} className="p-2 rounded-md">
                        <span className="text-sm text-muted-foreground">
                          {t.surfaceFinish || 'N/A'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Materials */}
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                    Materials
                  </p>
                  <div className={cn(
                    'grid gap-4',
                    techniques.length === 2
                      ? 'grid-cols-2'
                      : techniques.length === 3
                        ? 'grid-cols-3'
                        : 'grid-cols-2 sm:grid-cols-4',
                  )}>
                    {techniques.map(t => (
                      <div key={t.id} className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          {t.materials.length} materials
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {t.materials.slice(0, 5).map(mat => (
                            <Badge key={mat} variant="secondary" className="text-[10px]">
                              {mat}
                            </Badge>
                          ))}
                          {t.materials.length > 5 && (
                            <Badge variant="secondary" className="text-[10px]">
                              +{t.materials.length - 5}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Advantages */}
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-status-success mb-2">
                    Advantages
                  </p>
                  <div className={cn(
                    'grid gap-4',
                    techniques.length === 2
                      ? 'grid-cols-2'
                      : techniques.length === 3
                        ? 'grid-cols-3'
                        : 'grid-cols-2 sm:grid-cols-4',
                  )}>
                    {techniques.map(t => (
                      <ul key={t.id} className="space-y-1">
                        {t.pros.map((pro, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs">
                            <CheckCircle2 className="h-3 w-3 text-status-success shrink-0 mt-0.5" />
                            <span className="text-muted-foreground">{pro}</span>
                          </li>
                        ))}
                      </ul>
                    ))}
                  </div>
                </div>

                {/* Limitations */}
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-destructive mb-2">
                    Limitations
                  </p>
                  <div className={cn(
                    'grid gap-4',
                    techniques.length === 2
                      ? 'grid-cols-2'
                      : techniques.length === 3
                        ? 'grid-cols-3'
                        : 'grid-cols-2 sm:grid-cols-4',
                  )}>
                    {techniques.map(t => (
                      <ul key={t.id} className="space-y-1">
                        {t.cons.map((con, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs">
                            <XCircle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />
                            <span className="text-muted-foreground">{con}</span>
                          </li>
                        ))}
                      </ul>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Prompt when not enough selected */}
            {!hasEnough && (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">
                  Select at least 2 techniques to see the comparison.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
