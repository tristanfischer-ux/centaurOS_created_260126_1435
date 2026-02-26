'use client'

import { Badge } from '@/components/ui/badge'
import type { Frequency } from '@/types/cash-burn'

const frequencyLabels: Record<Frequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  annual: 'Annual',
  one_time: 'One-time',
}

interface FrequencyBadgeProps {
  frequency: Frequency
}

export function FrequencyBadge({ frequency }: FrequencyBadgeProps) {
  return (
    <Badge variant="outline" size="sm">
      {frequencyLabels[frequency]}
    </Badge>
  )
}
