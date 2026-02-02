"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { SupplierDashboard as SupplierAnalyticsDashboard } from "@/components/analytics/SupplierDashboard"
import { getSupplierDashboardAnalytics } from "@/actions/analytics"
import { SupplierAnalytics, AnalyticsPeriod } from "@/types/analytics"
import { typography } from "@/lib/design-system"

export default function SupplierAnalyticsPage() {
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
        if (result.error === 'Provider profile not found') {
          router.push('/supplier-portal/listing')
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="min-w-0 flex-1">
          <div className={typography.pageHeader}>
            <div className={typography.pageHeaderAccent} />
            <h1 className={typography.h1}>Analytics</h1>
          </div>
          <p className={typography.pageSubtitle}>
            Track your performance and earnings
          </p>
        </div>
      </div>

      <SupplierAnalyticsDashboard
        analytics={analytics}
        period={period}
        onPeriodChange={handlePeriodChange}
        isLoading={isLoading}
        error={error || undefined}
      />
    </div>
  )
}
