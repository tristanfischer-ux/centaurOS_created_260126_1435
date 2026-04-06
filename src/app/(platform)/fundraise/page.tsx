import type { Metadata } from 'next'
import { ComingSoon } from '@/components/coming-soon'

export const metadata: Metadata = {
  title: 'Fundraise | ForgeOS',
  description: 'Track your fundraise pipeline',
}

export default function FundraisePage() {
  return (
    <ComingSoon
      title="Fundraise"
      description="Track your fundraise pipeline, manage investor outreach, and close your round. Coming soon."
    />
  )
}
