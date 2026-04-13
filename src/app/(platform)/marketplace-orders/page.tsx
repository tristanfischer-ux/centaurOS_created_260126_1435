import type { Metadata } from 'next'
import { ComingSoon } from '@/components/coming-soon'

export const metadata: Metadata = {
  title: 'Orders',
  description: 'View and manage your marketplace orders',
}

export default function OrdersPage() {
  return (
    <ComingSoon
      title="Orders"
      description="View and manage your marketplace orders, track deliverables, and handle payments. Coming soon."
    />
  )
}
