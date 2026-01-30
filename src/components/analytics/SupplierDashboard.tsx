"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { 
  Download, 
  RefreshCw, 
  DollarSign, 
  ShoppingCart, 
  TrendingUp,
  Users,
  User,
  Zap
} from "lucide-react"
import { SupplierAnalytics, AnalyticsPeriod, CategoryDataPoint } from "@/types/analytics"
import { EarningsChart } from "./EarningsChart"
import { SupplierPerformanceMetrics, ComparisonMetrics } from "./PerformanceMetrics"
import { exportAnalytics, refreshProviderAnalytics } from "@/actions/analytics"
import { cn } from "@/lib/utils"
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts"

interface SupplierDashboardProps {
  analytics: SupplierAnalytics | null
  period: AnalyticsPeriod
  onPeriodChange: (period: AnalyticsPeriod) => void
  isLoading?: boolean
  error?: string
  className?: string
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#10b981',
  'in progress': '#3b82f6',
  pending: '#f59e0b',
  accepted: '#8b5cf6',
  cancelled: '#ef4444',
  disputed: '#f97316',
}

export function SupplierDashboard({
  analytics,
  period,
  onPeriodChange,
  isLoading,
  error,
  className
}: SupplierDashboardProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  // Format currency
  const formatCurrency = (value: number, currency: string = 'GBP') => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }
  
  // Handle export
  const handleExport = async (format: 'csv' | 'json') => {
    setIsExporting(true)
    try {
      const result = await exportAnalytics('supplier', period, format)
      if (result.data && result.filename) {
        // Create download
        const blob = new Blob([result.data], { type: format === 'csv' ? 'text/csv' : 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = result.filename
        a.click()
        URL.revokeObjectURL(url)
      }
    } finally {
      setIsExporting(false)
    }
  }
  
  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refreshProviderAnalytics()
      // Trigger parent to refetch
      onPeriodChange(period)
    } finally {
      setIsRefreshing(false)
    }
  }
  
  if (isLoading) {
    return <SupplierDashboardSkeleton />
  }
  
  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <Button onClick={() => onPeriodChange(period)}>Retry</Button>
          </div>
        </CardContent>
      </Card>
    )
  }
  
  if (!analytics) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">No analytics data available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
          <p className="text-muted-foreground">Track your performance and earnings</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => onPeriodChange(v as AnalyticsPeriod)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="quarter">Quarter</SelectItem>
              <SelectItem value="year">Year</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="secondary"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          </Button>
          <Button
            variant="secondary"
            onClick={() => handleExport('csv')}
            disabled={isExporting}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Lifetime GMV</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(analytics.lifetimeGmv, analytics.currency)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <ShoppingCart className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-2xl font-bold">{analytics.totalOrders}</p>
                <p className="text-xs text-muted-foreground">
                  {analytics.completedOrders} completed
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Avg Order Value</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(analytics.averageOrderValue, analytics.currency)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Repeat Clients</p>
                <p className="text-2xl font-bold">{analytics.repeatClientRate.toFixed(1)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Earnings Chart */}
        <EarningsChart
          data={analytics.earningsTrend}
          currency={analytics.currency}
          period={period}
          totalEarnings={analytics.earningsThisMonth}
          previousTotalEarnings={analytics.earningsPreviousMonth}
          title="Earnings"
        />

        {/* Orders Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Orders Trend</CardTitle>
            <CardDescription>Orders over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.ordersTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Orders" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      <SupplierPerformanceMetrics
        completionRate={analytics.completionRate}
        responseRate={analytics.responseRate}
        avgResponseTime={analytics.averageResponseTimeHours}
        avgRating={analytics.averageRating}
        totalReviews={analytics.totalReviews}
        repeatClientRate={analytics.repeatClientRate}
      />

      {/* Additional Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Orders by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.ordersByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    dataKey="value"
                    nameKey="category"
                    label={({ name }) => name}
                  >
                    {analytics.ordersByStatus.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={STATUS_COLORS[entry.category.toLowerCase()] || '#94a3b8'}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top Clients */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Top Clients
            </CardTitle>
            <CardDescription>Your best customers by spend</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.topClients.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No client data yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {analytics.topClients.map((client) => (
                  <div 
                    key={client.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={client.avatarUrl} />
                        <AvatarFallback>
                          <User className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{client.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {client.totalOrders} orders
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">
                        {formatCurrency(client.totalSpend, analytics.currency)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Total spend
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trending Skills (if available) */}
      {analytics.trendingSkills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-600" />
              Trending Skills Demand
            </CardTitle>
            <CardDescription>Skills in high demand right now</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {analytics.trendingSkills.map((skill, index) => (
                <Badge 
                  key={index}
                  variant="secondary"
                  className={cn(
                    "px-3 py-1",
                    skill.trend === 'up' && "bg-green-100 text-green-700",
                    skill.trend === 'down' && "bg-red-100 text-red-700"
                  )}
                >
                  {skill.skill}
                  {skill.trend === 'up' && <TrendingUp className="h-3 w-3 ml-1" />}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Period Comparison */}
      <ComparisonMetrics
        comparisons={[
          analytics.periodComparison.orders,
          analytics.periodComparison.revenue,
          analytics.periodComparison.rating,
        ]}
        title="Period Comparison"
      />
    </div>
  )
}

function SupplierDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-64" />
    </div>
  )
}

export default SupplierDashboard
