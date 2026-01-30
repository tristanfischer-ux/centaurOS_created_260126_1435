"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { 
  Download, 
  RefreshCw, 
  ShoppingCart, 
  TrendingUp,
  TrendingDown,
  Star,
  User,
  Wallet,
  PiggyBank,
  BarChart3
} from "lucide-react"
import { BuyerAnalytics, AnalyticsPeriod } from "@/types/analytics"
import { SpendChart } from "./SpendChart"
import { ComparisonMetrics } from "./PerformanceMetrics"
import { exportAnalytics, refreshBuyerAnalytics } from "@/actions/analytics"
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

interface BuyerDashboardProps {
  analytics: BuyerAnalytics | null
  period: AnalyticsPeriod
  onPeriodChange: (period: AnalyticsPeriod) => void
  isLoading?: boolean
  error?: string
  className?: string
}

const CATEGORY_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ef4444',
  '#ec4899',
]

export function BuyerDashboard({
  analytics,
  period,
  onPeriodChange,
  isLoading,
  error,
  className
}: BuyerDashboardProps) {
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
      const result = await exportAnalytics('buyer', period, format)
      if (result.data && result.filename) {
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
      await refreshBuyerAnalytics()
      onPeriodChange(period)
    } finally {
      setIsRefreshing(false)
    }
  }
  
  // Calculate spend change
  const spendChange = analytics?.spendPreviousMonth && analytics.spendPreviousMonth > 0
    ? ((analytics.spendThisMonth - analytics.spendPreviousMonth) / analytics.spendPreviousMonth) * 100
    : null
  
  if (isLoading) {
    return <BuyerDashboardSkeleton />
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
          <h2 className="text-2xl font-bold">Buyer Analytics</h2>
          <p className="text-muted-foreground">Track your spending and orders</p>
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
              <div className="p-2 rounded-lg bg-blue-50">
                <Wallet className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Spend</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(analytics.totalSpend, analytics.currency)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-50">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">This Period</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(analytics.spendThisMonth, analytics.currency)}
                </p>
                {spendChange !== null && (
                  <p className={cn(
                    "text-xs flex items-center gap-1",
                    spendChange >= 0 ? "text-amber-600" : "text-green-600"
                  )}>
                    {spendChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(spendChange).toFixed(1)}% vs last period
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-50">
                <ShoppingCart className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-2xl font-bold">{analytics.totalOrders}</p>
                <p className="text-xs text-muted-foreground">
                  {analytics.activeOrders} active
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50">
                <PiggyBank className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Savings</p>
                <p className="text-2xl font-bold">
                  {formatCurrency(analytics.totalSavings, analytics.currency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Via Centaur discounts
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Budget Tracking (if budget set) */}
      {analytics.budgetAmount && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              Budget Tracking
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {formatCurrency(analytics.budgetUsed || 0, analytics.currency)} of {formatCurrency(analytics.budgetAmount, analytics.currency)}
                </span>
                <span className="text-sm font-medium">
                  {analytics.budgetAmount > 0 
                    ? Math.round(((analytics.budgetUsed || 0) / analytics.budgetAmount) * 100)
                    : 0}% used
                </span>
              </div>
              <Progress 
                value={analytics.budgetAmount > 0 
                  ? Math.min(((analytics.budgetUsed || 0) / analytics.budgetAmount) * 100, 100)
                  : 0
                }
                className="h-3"
              />
              <div className="flex justify-between text-sm">
                <span className="text-green-600">
                  {formatCurrency(analytics.budgetRemaining || 0, analytics.currency)} remaining
                </span>
                <span className="text-muted-foreground">
                  Budget resets monthly
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spend Chart */}
        <SpendChart
          trendData={analytics.spendTrend}
          categoryData={analytics.spendByCategory}
          currency={analytics.currency}
          period={period}
          totalSpend={analytics.spendThisMonth}
          previousTotalSpend={analytics.spendPreviousMonth}
          budgetAmount={analytics.budgetAmount}
          title="Spending Analysis"
        />

        {/* Orders Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Orders Trend</CardTitle>
            <CardDescription>Your ordering activity over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.ordersTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" name="Orders" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown and Top Providers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spend by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Spend by Category</CardTitle>
            <CardDescription>Where your money goes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.spendByCategory}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    nameKey="category"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {analytics.spendByCategory.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value, analytics.currency)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Category list */}
            <div className="mt-4 space-y-2">
              {analytics.spendByCategory.slice(0, 5).map((category, index) => (
                <div key={category.category} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                    />
                    <span className="text-sm">{category.category}</span>
                  </div>
                  <span className="text-sm font-medium">
                    {formatCurrency(category.value, analytics.currency)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Providers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500" />
              Top Providers
            </CardTitle>
            <CardDescription>Your most-used providers</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.topProviders.length === 0 ? (
              <div className="text-center py-8">
                <User className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No provider data yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {analytics.topProviders.map((provider) => (
                  <div 
                    key={provider.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={provider.avatarUrl} />
                        <AvatarFallback>
                          <User className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{provider.name}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{provider.totalOrders} orders</span>
                          {provider.averageRating > 0 && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                {provider.averageRating.toFixed(1)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">
                        {formatCurrency(provider.totalSpend, analytics.currency)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Period Comparison */}
      <ComparisonMetrics
        comparisons={[
          analytics.periodComparison.orders,
          analytics.periodComparison.spend,
          analytics.periodComparison.savings,
        ]}
        title="Period Comparison"
      />
    </div>
  )
}

function BuyerDashboardSkeleton() {
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
    </div>
  )
}

export default BuyerDashboard
