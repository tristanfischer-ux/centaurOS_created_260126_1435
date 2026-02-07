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
  DollarSign,
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
        <DollarSign
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
  /** Additional CSS classes */
  className?: string
}

export function TechniqueCard({ technique, onClick, className }: TechniqueCardProps) {
  const Icon = CATEGORY_ICONS[technique.category]

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-200',
        'hover:shadow-lg hover:-translate-y-0.5',
        'border hover:border-international-orange/30',
        className,
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`View details for ${technique.name}`}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <CardContent className="p-4 space-y-3">
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
