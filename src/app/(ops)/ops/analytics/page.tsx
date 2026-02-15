"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import { Skeleton } from "@/components/ui/skeleton"
import { getAdminAnalytics } from "@/actions/analytics"

const AdminDashboard = dynamic(
  () => import("@/components/analytics/AdminDashboard").then((m) => ({ default: m.AdminDashboard })),
  { ssr: false, loading: () => <Skeleton className="w-full h-[600px] rounded-lg" /> },
)
import { PlatformAnalytics, AnalyticsPeriod } from "@/types/analytics"

export default function AdminAnalyticsPage() {
  const router = useRouter()
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null)
  const [period, setPeriod] = useState<AnalyticsPeriod>('month')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAnalytics = useCallback(async (selectedPeriod: AnalyticsPeriod) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await getAdminAnalytics(selectedPeriod)
      
      if (result.error) {
        // If not authorized, redirect
        if (result.error === 'Not authorized') {
          router.push('/updates')
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
      <AdminDashboard
        analytics={analytics}
        period={period}
        onPeriodChange={handlePeriodChange}
        isLoading={isLoading}
        error={error || undefined}
      />
    </div>
  )
}
