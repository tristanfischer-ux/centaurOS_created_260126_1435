import type { Metadata } from 'next'
import { ComingSoon } from '@/components/coming-soon'

export const metadata: Metadata = {
  title: 'Apprenticeship | ForgeOS',
  description: 'Track apprenticeship progress and learning modules',
}

export default function ApprenticeshipPage() {
  return (
    <ComingSoon
      title="Apprenticeship"
      description="Track apprenticeship progress, on-the-job training hours, and learning modules. Coming soon."
    />
  )
}
