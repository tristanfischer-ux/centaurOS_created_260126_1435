import type { ReactNode } from 'react'
import { RaiseSubNav } from './raise-sub-nav'
import { ViewCapBanner } from './_shared/view-cap-banner'
import { ViewCapBadge } from './_shared/view-cap-badge'

export default function RaiseLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <ViewCapBanner />
      <RaiseSubNav trailingSlot={<ViewCapBadge />} />
      {children}
    </div>
  )
}
