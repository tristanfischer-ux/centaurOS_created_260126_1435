"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { SupplierDashboard } from "@/components/analytics/SupplierDashboard"
import { getSupplierDashboardAnalytics } from "@/actions/analytics"
import { SupplierAnalytics, AnalyticsPeriod } from "@/types/analytics"

export default function ProviderAnalyticsPage() {
  const router = useRouter()
  const [analytics, setAnalytics] = useState<SupplierAnalytics | null>(null)
  const [period, setPeriod] = useState<AnalyticsPeriod>('month')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAnalytics = useCallback(async (selectedPeriod: AnalyticsPeriod) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await getSupplierDashboardAnalytics(selectedPeriod)
      
      if (result.error) {
        // If not a provider, redirect
        if (result.error === 'Provider profile not found') {
          router.push('/provider-portal/apply')
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

  const handlePeriodChange = (newPeriod: AnalyticsPeriod) => {
    setPeriod(newPeriod)
  }

  return (
    <div className="space-y-6">
      <SupplierDashboard
        analytics={analytics}
        period={period}
        onPeriodChange={handlePeriodChange}
        isLoading={isLoading}
        error={error || undefined}
      />
    </div>
  )
}
