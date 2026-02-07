'use client'

/**
 * TechniqueCard — Displays a single manufacturing technique as an interactive
 * card in the Techniques Explorer grid.
 *
 * @description Shows the technique name, category, key metadata (cost,
 * batch size, materials), and a short description. Clicking opens the
 * full detail dialog.
 *
 * @component
 *
 * @example
 * <TechniqueCard technique={fdm} onClick={() => setSelected(fdm)} />
 */

import {
  Layers,
  Scissors,
  Box,
  FlaskConical,
  Link2,
  Paintbrush,
  Cpu,
  Shapes,
  Sparkles,
  Zap,
  PoundSterling,
  Check,
  Heart,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ManufacturingTechnique, TechniqueCategory, CostTier } from '@/lib/manufacturing-techniques/types'

// ---------------------------------------------------------------------------
// Category → icon mapping
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<TechniqueCategory, React.ElementType> = {
  additive: Layers,
  subtractive: Scissors,
  forming: Box,
  casting: FlaskConical,
  joining: Link2,
  surface: Paintbrush,
  composite: Shapes,
  electronics: Cpu,
  textile: Shapes,
  advanced: Sparkles,
}

const CATEGORY_COLORS: Record<TechniqueCategory, string> = {
  additive: 'bg-international-orange/10 text-international-orange',
  subtractive: 'bg-electric-blue/10 text-electric-blue',
  forming: 'bg-chart-3/10 text-chart-3',
  casting: 'bg-chart-4/10 text-chart-4',
  joining: 'bg-chart-5/10 text-chart-5',
  surface: 'bg-chart-6/10 text-chart-6',
  composite: 'bg-status-info/10 text-status-info',
  electronics: 'bg-status-success/10 text-status-success',
  textile: 'bg-chart-4/10 text-chart-4',
  advanced: 'bg-international-orange/10 text-international-orange',
}

// ---------------------------------------------------------------------------
// Cost tier indicator
// ---------------------------------------------------------------------------

function CostIndicator({ tier }: { tier: CostTier }) {
  const filled =
    tier === 'low' ? 1 : tier === 'medium' ? 2 : tier === 'high' ? 3 : 4
  return (
    <div className="flex items-center gap-0.5" title={`Cost: ${tier}`}>
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
  )
}

// ---------------------------------------------------------------------------
// TechniqueCard
// ---------------------------------------------------------------------------

interface TechniqueCardProps {
  /** The technique data to display */
  technique: ManufacturingTechnique
  /** Called when user clicks the card to view details */
  onClick: () => void
  /** Whether the card is in selectable (compare) mode */
  selectable?: boolean
  /** Whether the card is currently selected for comparison */
  selected?: boolean
  /** Called when selection changes in compare mode */
  onSelectionChange?: (selected: boolean) => void
  /** Whether this technique is saved/favourited */
  isSaved?: boolean
  /** Called to toggle save state. Receives technique ID. */
  onSaveToggle?: (techniqueId: string) => void
  /** Additional CSS classes */
  className?: string
}

export function TechniqueCard({
  technique,
  onClick,
  selectable = false,
  selected = false,
  onSelectionChange,
  isSaved = false,
  onSaveToggle,
  className,
}: TechniqueCardProps) {
  const Icon = CATEGORY_ICONS[technique.category]

  const handleClick = () => {
    if (selectable && onSelectionChange) {
      onSelectionChange(!selected)
    } else {
      onClick()
    }
  }

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200',
        'hover:shadow-lg hover:-translate-y-0.5',
        'border hover:border-international-orange/30',
        selectable && selected && 'border-international-orange ring-1 ring-international-orange/30',
        className,
      )}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={
        selectable
          ? `${selected ? 'Deselect' : 'Select'} ${technique.name} for comparison`
          : `View details for ${technique.name}`
      }
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick()
        }
      }}
    >
      <CardContent className="p-4 space-y-3 relative">
        {/* Top-right overlay: compare checkbox OR save heart */}
        {selectable ? (
          <div
            className={cn(
              'absolute top-2 right-2 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors',
              selected
                ? 'bg-international-orange border-international-orange text-white'
                : 'border-muted-foreground/30 bg-background',
            )}
          >
            {selected && <Check className="h-3 w-3" />}
          </div>
        ) : onSaveToggle ? (
          <button
            className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted transition-colors"
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
                  : 'text-muted-foreground/40 hover:text-muted-foreground',
              )}
            />
          </button>
        ) : null}

        {/* Header: icon + category badge */}
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              'flex items-center justify-center rounded-lg h-9 w-9 shrink-0',
              CATEGORY_COLORS[technique.category],
            )}
          >
            <Icon className="h-4.5 w-4.5" />
          </div>
          <CostIndicator tier={technique.costTier} />
        </div>

        {/* Name */}
        <h3 className="font-semibold text-sm text-foreground leading-tight line-clamp-2">
          {technique.name}
        </h3>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {technique.description}
        </p>

        {/* Materials (top 3) */}
        <div className="flex flex-wrap gap-1">
          {technique.materials.slice(0, 3).map(mat => (
            <Badge key={mat} variant="secondary" className="text-[10px] px-1.5 py-0">
              {mat}
            </Badge>
          ))}
          {technique.materials.length > 3 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              +{technique.materials.length - 3}
            </Badge>
          )}
        </div>

        {/* Footer: batch size + lead time */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-muted">
          <span>
            {technique.batchSize.min === technique.batchSize.max
              ? technique.batchSize.min
              : `${technique.batchSize.min} → ${technique.batchSize.max}`}
          </span>
          {technique.leadTime && <span>{technique.leadTime}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

export { CATEGORY_ICONS, CATEGORY_COLORS }
