import type { Metadata } from 'next'
import { ComingSoon } from '@/components/coming-soon'

export const metadata: Metadata = {
  title: 'Guild',
  description: 'Community hub for events, networking, and apprentice pool',
}

export default function GuildPage() {
  return (
    <ComingSoon
      title="Guild"
      description="Your community hub for events, networking, and the apprentice pool. Coming soon."
    />
  )
}
