import type { ReactNode } from 'react'
import { RaiseSubNav } from './raise-sub-nav'

export default function RaiseLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4">
      <RaiseSubNav />
      {children}
    </div>
  )
}
