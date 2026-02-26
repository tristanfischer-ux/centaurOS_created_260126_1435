'use client'

import { Badge } from '@/components/ui/badge'

interface RunwayBadgeProps {
  weeks: number | null
  className?: string
}

export function RunwayBadge({ weeks, className }: RunwayBadgeProps) {
  if (weeks === null) {
    return <Badge variant="success" className={className}>Sustainable</Badge>
  }

  const variant = weeks > 26 ? 'success' : weeks >= 13 ? 'warning' : 'destructive'
  return (
    <Badge variant={variant} className={className}>
      {weeks} week{weeks !== 1 ? 's' : ''}
    </Badge>
  )
}
