"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { BuyerDashboard } from "@/components/analytics/BuyerDashboard"
import { getBuyerDashboardAnalytics } from "@/actions/analytics"
import { BuyerAnalytics, AnalyticsPeriod } from "@/types/analytics"

/**
 * Platform Analytics Page
 * 
 * @description Shows analytics dashboard for authenticated platform users.
 * Uses the BuyerDashboard component which displays spending trends,
 * provider performance, and ROI metrics.
 * 
 * @security Requires authentication (platform layout redirects to login).
 * Data access controlled by RLS policies in analytics queries.
 */
export default function AnalyticsPage(): React.JSX.Element {
  const router = useRouter()
  const [analytics, setAnalytics] = useState<BuyerAnalytics | null>(null)
  const [period, setPeriod] = useState<AnalyticsPeriod>('month')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAnalytics = useCallback(async (selectedPeriod: AnalyticsPeriod) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await getBuyerDashboardAnalytics(selectedPeriod)
      
      if (result.error) {
        if (result.error === 'Not authenticated') {
          router.push('/login?redirect=/analytics')
          return
        }
        setError(result.error)
      } else {
        setAnalytics(result.data)
      }
    } catch {
      setError('Failed to load analytics')
    } finally {
      setIsLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchAnalytics(period)
  }, [period, fetchAnalytics])

  const handlePeriodChange = (newPeriod: AnalyticsPeriod): void => {
    setPeriod(newPeriod)
  }

  return (
    <div className="max-w-6xl mx-auto">
      <BuyerDashboard
        analytics={analytics}
        period={period}
        onPeriodChange={handlePeriodChange}
        isLoading={isLoading}
        error={error || undefined}
      />
    </div>
  )
}
