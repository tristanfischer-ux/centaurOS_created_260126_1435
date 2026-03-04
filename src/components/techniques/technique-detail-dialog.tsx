'use client'

/**
 * TechniqueDetailDialog — Full detail view for a manufacturing technique.
 *
 * @description Displays all metadata for a technique including description,
 * how it works, materials, tolerances, pros/cons, applications, and related
 * techniques. Includes CTAs to find suppliers, find experts, start an RFQ,
 * compare techniques, and save/favourite.
 *
 * @component
 *
 * @example
 * <TechniqueDetailDialog
 *   technique={selectedTechnique}
 *   open={!!selectedTechnique}
 *   onOpenChange={(open) => !open && setSelected(null)}
 *   onViewRelated={setSelected}
 *   onCompare={handleCompare}
 *   isSaved={isSaved(technique.id)}
 *   onSaveToggle={toggleSaved}
 * />
 */

import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  FileText,
  Search,
  Briefcase,
  ArrowLeftRight,
  Heart,
  PoundSterling,
  Clock,
  Ruler,
  Layers,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import type { ManufacturingTechnique, CostTier } from '@/lib/manufacturing-techniques/types'
import { CATEGORY_LABELS } from '@/lib/manufacturing-techniques/types'
import { getTechniqueById } from '@/lib/manufacturing-techniques'
import { CATEGORY_ICONS, CATEGORY_COLORS } from './technique-card'

// ---------------------------------------------------------------------------
// Cost display
// ---------------------------------------------------------------------------

const COST_LABELS: Record<CostTier, string> = {
  low: 'Low Cost',
  medium: 'Medium Cost',
  high: 'High Cost',
  'very-high': 'Very High Cost',
}

function CostDisplay({ tier }: { tier: CostTier }) {
  const filled =
    tier === 'low' ? 1 : tier === 'medium' ? 2 : tier === 'high' ? 3 : 4
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4].map(i => (
          <PoundSterling
            key={i}
            className={cn(
              'h-3.5 w-3.5',
              i <= filled
                ? 'text-international-orange'
                : 'text-muted-foreground/30',
            )}
          />
        ))}
      </div>
      <span className="text-sm text-muted-foreground">{COST_LABELS[tier]}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// TechniqueDetailDialog
// ---------------------------------------------------------------------------

interface TechniqueDetailDialogProps {
  /** The technique to display. null = dialog closed. */
  technique: ManufacturingTechnique | null
  /** Controlled open state */
  open: boolean
  /** Called when dialog open state changes */
  onOpenChange: (open: boolean) => void
  /** Called when user clicks a related technique */
  onViewRelated?: (technique: ManufacturingTechnique) => void
  /** Called when user wants to compare this technique with others */
  onCompare?: (technique: ManufacturingTechnique) => void
  /** Whether this technique is saved/favourited */
  isSaved?: boolean
  /** Called to toggle save state. Receives technique ID. */
  onSaveToggle?: (techniqueId: string) => void
}

export function TechniqueDetailDialog({
  technique,
  open,
  onOpenChange,
  onViewRelated,
  onCompare,
  isSaved = false,
  onSaveToggle,
}: TechniqueDetailDialogProps) {
  if (!technique) return null

  const CategoryIcon = CATEGORY_ICONS[technique.category]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] flex flex-col gap-0 p-0">
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                          */}
        {/* ---------------------------------------------------------------- */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                'flex items-center justify-center rounded-xl h-12 w-12 shrink-0',
                CATEGORY_COLORS[technique.category],
              )}
            >
              <CategoryIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl font-semibold leading-tight mb-1">
                {technique.name}
              </DialogTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  {CATEGORY_LABELS[technique.category]}
                </Badge>
                {technique.subcategory && (
                  <Badge variant="outline" className="text-xs">
                    {technique.subcategory}
                  </Badge>
                )}
              </div>
            </div>
            {/* Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              {onSaveToggle && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={e => {
                    e.stopPropagation()
                    onSaveToggle(technique.id)
                  }}
                  aria-label={isSaved ? 'Unsave technique' : 'Save technique'}
                >
                  <Heart
                    className={cn(
                      'h-4 w-4 transition-colors',
                      isSaved
                        ? 'fill-international-orange text-international-orange'
                        : 'text-muted-foreground',
                    )}
                  />
                </Button>
              )}
              {onCompare && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCompare(technique)}
                >
                  <ArrowLeftRight className="h-4 w-4 mr-2" />
                  Compare
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <Separator />

        {/* ---------------------------------------------------------------- */}
        {/* Scrollable content                                               */}
        {/* ---------------------------------------------------------------- */}
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-6">
            {/* Description */}
            <div>
              <p className="text-sm text-foreground leading-relaxed">
                {technique.description}
              </p>
            </div>

            {/* How it works */}
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                How It Works
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {technique.howItWorks}
              </p>
            </div>

            {/* Key specs grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Cost Tier
                </p>
                <CostDisplay tier={technique.costTier} />
              </div>
              {technique.leadTime && (
                <div className="space-y-1">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Lead Time
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">{technique.leadTime}</span>
                  </div>
                </div>
              )}
              {technique.toleranceRange && (
                <div className="space-y-1">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Tolerance
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">{technique.toleranceRange}</span>
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Batch Size
                </p>
                <span className="text-sm">
                  {technique.batchSize.min === technique.batchSize.max
                    ? technique.batchSize.min
                    : `${technique.batchSize.min} → ${technique.batchSize.max}`}
                </span>
              </div>
            </div>

            {/* Surface finish */}
            {technique.surfaceFinish && (
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                  Surface Finish
                </p>
                <p className="text-sm text-muted-foreground">
                  {technique.surfaceFinish}
                </p>
              </div>
            )}

            {/* Materials */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                Materials
              </p>
              <div className="flex flex-wrap gap-1.5">
                {technique.materials.map(mat => (
                  <Badge key={mat} variant="secondary" className="text-xs">
                    {mat}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Pros and Cons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-status-success mb-2">
                  Advantages
                </p>
                <ul className="space-y-1.5">
                  {technique.pros.map((pro, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-status-success shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{pro}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-destructive mb-2">
                  Limitations
                </p>
                <ul className="space-y-1.5">
                  {technique.cons.map((con, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{con}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Applications */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                Common Applications
              </p>
              <div className="flex flex-wrap gap-1.5">
                {technique.applications.map(app => (
                  <Badge key={app} variant="outline" className="text-xs">
                    {app}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Related techniques */}
            {technique.relatedTechniques.length > 0 && (
              <div>
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                  Related Techniques
                </p>
                <div className="flex flex-wrap gap-2">
                  {technique.relatedTechniques.map(id => {
                    const related = getTechniqueById(id)
                    if (!related) return null
                    return (
                      <button
                        key={id}
                        onClick={() => onViewRelated?.(related)}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium',
                          'border transition-colors',
                          'hover:border-international-orange/30 hover:bg-international-orange/5',
                          'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {related.name}
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ---------------------------------------------------------------- */}
        {/* Footer CTAs                                                      */}
        {/* ---------------------------------------------------------------- */}
        <Separator />
        <div className="px-6 py-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Button asChild variant="default" className="flex-1 sm:flex-none">
            <Link href={`/marketplace?technique=${technique.slug}&q=${encodeURIComponent(technique.name)}`}>
              <Search className="h-4 w-4 mr-2" />
              Find Suppliers
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1 sm:flex-none">
            <Link href={`/recruits?q=${encodeURIComponent(technique.name)}`}>
              <Briefcase className="h-4 w-4 mr-2" />
              Find an Expert
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1 sm:flex-none">
            <Link href={`/rfq/create?technique=${technique.slug}`}>
              <FileText className="h-4 w-4 mr-2" />
              Start RFQ
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
