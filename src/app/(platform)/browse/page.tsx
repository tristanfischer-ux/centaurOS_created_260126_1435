import type { Metadata } from 'next'
import { ComingSoon } from '@/components/coming-soon'

export const metadata: Metadata = {
  title: 'Browse',
  description: 'Browse the web with your specialist',
}

export default function BrowsePage() {
  return (
    <ComingSoon
      title="Browse"
      description="Browse the web with your specialist — get real-time guidance and analysis. Coming soon."
    />
  )
}
