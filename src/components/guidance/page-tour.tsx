'use client'

import { FeatureTour } from './feature-tour'
import { TOUR_DEFINITIONS } from './tour-definitions'

export function PageTour({ page }: { page: string }) {
  const def = TOUR_DEFINITIONS[page]
  if (!def) return null
  return <FeatureTour tourId={def.tourId} steps={def.steps} />
}
