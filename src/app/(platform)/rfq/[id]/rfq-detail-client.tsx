'use client'

import { useEffect, useState, useCallback } from 'react'
import { RFQDetail } from '@/components/rfq/RFQDetail'
import { RFQWithDetails } from '@/types/rfq'
import { useRFQSubscription } from '@/hooks/useRFQFeed'
import { getRFQDetail } from '@/actions/rfq'

interface RFQDetailClientProps {
  rfq: RFQWithDetails
  isOwner: boolean
  hasResponded: boolean
}

export function RFQDetailClient({
  rfq: initialRfq,
  isOwner,
  hasResponded,
}: RFQDetailClientProps) {
  const [rfq, setRfq] = useState(initialRfq)

  // Refresh RFQ data
  const refreshRfq = useCallback(async () => {
    const { data } = await getRFQDetail(rfq.id)
    if (data) {
      setRfq(data)
    }
  }, [rfq.id])

  // Subscribe to real-time updates
  useRFQSubscription(rfq.id, {
    onUpdate: () => {
      refreshRfq()
    },
    onNewResponse: () => {
      refreshRfq()
    },
  })

  // Auto-refresh on status changes
  useEffect(() => {
    // Set up polling for priority hold countdown
    if (rfq.status === 'priority_hold' && rfq.priority_hold_expires_at) {
      const expiresAt = new Date(rfq.priority_hold_expires_at).getTime()
      const checkExpiry = () => {
        if (Date.now() >= expiresAt) {
          refreshRfq()
        }
      }

      const interval = setInterval(checkExpiry, 5000)
      return () => clearInterval(interval)
    }
  }, [rfq.status, rfq.priority_hold_expires_at, refreshRfq])

  return (
    <RFQDetail
      rfq={rfq}
      isOwner={isOwner}
      hasResponded={hasResponded}
    />
  )
}
