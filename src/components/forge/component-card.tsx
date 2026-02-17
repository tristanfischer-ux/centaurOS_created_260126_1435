'use client'

import { Star, Shield, Link2, Package } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ComponentListItem } from '@/actions/component-library'

interface ComponentCardProps {
  component: ComponentListItem
  onClick: () => void
  className?: string
}

/**
 * ComponentCard - Displays a component in the library grid.
 *
 * @description Renders a card with component name, manufacturer, price range,
 * certification badges, star rating, and compatibility count. Follows the
 * same hover pattern as Marketplace and Assembly Builder cards.
 *
 * @component
 *
 * @example
 * <ComponentCard
 *   component={item}
 *   onClick={() => setSelected(item)}
 * />
 */
export function ComponentCard({ component, onClick, className }: ComponentCardProps) {
  const {
    name,
    manufacturer,
    price_min,
    price_max,
    currency,
    avg_rating,
    review_count,
    cert_count,
    compat_count,
    geometry_type_slug,
    verified,
  } = component

  const priceLabel = price_min != null && price_max != null
    ? price_min === price_max
      ? `$${price_min.toFixed(2)}`
      : `$${price_min.toFixed(2)} – $${price_max.toFixed(2)}`
    : null

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        'cursor-pointer transition-all duration-200',
        'hover:shadow-lg hover:-translate-y-0.5 hover:border-international-orange/30',
        'focus-within:ring-2 focus-within:ring-international-orange focus-within:outline-none',
        className
      )}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header: Name + Category */}
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
              {name}
            </h3>
            {verified && (
              <Badge variant="success" className="shrink-0 text-[10px]">Verified</Badge>
            )}
          </div>
          {manufacturer && (
            <p className="text-xs text-muted-foreground truncate">{manufacturer}</p>
          )}
        </div>

        {/* Price */}
        {priceLabel ? (
          <p className="text-sm font-semibold text-foreground">{priceLabel}</p>
        ) : (
          <p className="text-xs text-muted-foreground italic">Price TBC</p>
        )}

        {/* Certification badges */}
        {cert_count > 0 && (
          <div className="flex items-center gap-1.5">
            <Shield className="h-3 w-3 text-status-success shrink-0" />
            <span className="text-xs text-muted-foreground">
              {cert_count} certification{cert_count !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Bottom row: Rating + Compatibility */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-muted">
          {/* Rating */}
          {avg_rating != null && review_count > 0 ? (
            <div className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="text-xs font-medium text-foreground">
                {avg_rating.toFixed(1)}
              </span>
              <span className="text-xs text-muted-foreground">
                ({review_count})
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No reviews</span>
          )}

          {/* Compatibility */}
          {compat_count > 0 && (
            <div className="flex items-center gap-1">
              <Link2 className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {compat_count}
              </span>
            </div>
          )}
        </div>

        {/* Category tag */}
        {geometry_type_slug && (
          <Badge variant="secondary" className="text-[10px]">
            <Package className="h-2.5 w-2.5 mr-1" />
            {geometry_type_slug.replace(/_/g, ' ')}
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}
