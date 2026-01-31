"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Download, 
  RefreshCw, 
  DollarSign, 
  Users,
  User,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Percent,
  Building,
  Star,
  Activity
} from "lucide-react"
import { PlatformAnalytics, AnalyticsPeriod } from "@/types/analytics"
import { exportAnalytics, refreshPlatformAnalytics } from "@/actions/analytics"
import { cn } from "@/lib/utils"
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area
} from "recharts"

interface AdminDashboardProps {
  analytics: PlatformAnalytics | null
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

export function AdminDashboard({
  analytics,
  period,
  onPeriodChange,
  isLoading,
  error,
  className
}: AdminDashboardProps) {
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
  
  // Format large numbers
  const formatNumber = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
    return value.toLocaleString()
  }
  
  // Handle export
  const handleExport = async (format: 'csv' | 'json') => {
    setIsExporting(true)
    try {
      const result = await exportAnalytics('platform', period, format)
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
      await refreshPlatformAnalytics()
      onPeriodChange(period)
    } finally {
      setIsRefreshing(false)
    }
  }
  
  // Calculate GMV change
  const gmvChange = analytics?.gmvPreviousMonth && analytics.gmvPreviousMonth > 0
    ? ((analytics.gmvThisMonth - analytics.gmvPreviousMonth) / analytics.gmvPreviousMonth) * 100
    : null
  
  if (isLoading) {
    return <AdminDashboardSkeleton />
  }
  
  if (error) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-destructive mb-4">{error}</p>
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
          <h2 className="text-2xl font-bold">Platform Analytics</h2>
          <p className="text-muted-foreground">Monitor marketplace performance</p>
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

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total GMV */}
        <Card className="bg-gradient-to-br from-status-info-light to-blue-100 border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-status-info-dark">Total GMV</p>
                <p className="text-3xl font-bold text-foreground">
                  {formatCurrency(analytics.totalGmv)}
                </p>
              </div>
              <DollarSign className="h-10 w-10 text-status-info opacity-80" />
            </div>
            {gmvChange !== null && (
              <div className={cn(
                "mt-2 flex items-center gap-1 text-sm",
                gmvChange >= 0 ? "text-status-success-dark" : "text-destructive"
              )}>
                {gmvChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                {Math.abs(gmvChange).toFixed(1)}% this period
              </div>
            )}
          </CardContent>
        </Card>

        {/* Take Rate */}
        <Card className="bg-gradient-to-br from-status-success-light to-emerald-100 border-status-success">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-status-success-dark">Take Rate</p>
                <p className="text-3xl font-bold text-foreground">
                  {analytics.takeRate.toFixed(2)}%
                </p>
              </div>
              <Percent className="h-10 w-10 text-status-success opacity-80" />
            </div>
            <p className="mt-2 text-sm text-status-success-dark">
              {formatCurrency(analytics.totalFees)} in fees
            </p>
          </CardContent>
        </Card>

        {/* Total Users */}
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-700">Total Users</p>
                <p className="text-3xl font-bold text-foreground">
                  {formatNumber(analytics.totalUsers)}
                </p>
              </div>
              <Users className="h-10 w-10 text-purple-600 opacity-80" />
            </div>
            <p className="mt-2 text-sm text-purple-700">
              +{analytics.newUsersThisMonth} new this period ({analytics.userGrowthRate.toFixed(1)}%)
            </p>
          </CardContent>
        </Card>

        {/* Total Orders */}
        <Card className="bg-gradient-to-br from-status-warning-light to-amber-100 border-status-warning">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-status-warning-dark">Total Orders</p>
                <p className="text-3xl font-bold text-foreground">
                  {formatNumber(analytics.totalOrders)}
                </p>
              </div>
              <ShoppingCart className="h-10 w-10 text-status-warning opacity-80" />
            </div>
            <p className="mt-2 text-sm text-status-warning-dark">
              {analytics.completedOrdersRate.toFixed(1)}% completion rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Providers</span>
            </div>
            <p className="text-xl font-bold mt-1">{analytics.totalProviders}</p>
            <p className="text-xs text-muted-foreground">
              {analytics.activeProvidersThisMonth} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Buyers</span>
            </div>
            <p className="text-xl font-bold mt-1">{analytics.totalBuyers}</p>
            <p className="text-xs text-muted-foreground">
              {analytics.activeBuyersThisMonth} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Avg Order Value</span>
            </div>
            <p className="text-xl font-bold mt-1">
              {formatCurrency(analytics.averageOrderValue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Dispute Rate</span>
            </div>
            <p className="text-xl font-bold mt-1">{analytics.disputeRate.toFixed(2)}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="gmv" className="w-full">
        <TabsList>
          <TabsTrigger value="gmv">GMV Trend</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>

        <TabsContent value="gmv">
          <Card>
            <CardHeader>
              <CardTitle>GMV Over Time</CardTitle>
              <CardDescription>Platform gross merchandise volume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.gmvTrend}>
                    <defs>
                      <linearGradient id="gmvGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => formatCurrency(value)}
                    />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      name="GMV"
                      stroke="#3b82f6"
                      fill="url(#gmvGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Orders Over Time</CardTitle>
              <CardDescription>Transaction volume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.ordersTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar 
                      dataKey="value" 
                      name="Orders"
                      fill="#8b5cf6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>User Growth</CardTitle>
              <CardDescription>Platform user acquisition</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.usersTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      name="Total Users"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Distribution & Top Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Category Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">GMV by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.categoryDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    dataKey="value"
                    nameKey="category"
                    label={({ name }) => name}
                  >
                    {analytics.categoryDistribution.map((_, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
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
            <CardDescription>By GMV</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.topProviders.slice(0, 5).map((provider, index) => (
                <div 
                  key={provider.id}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground w-4">
                      {index + 1}
                    </span>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={provider.avatarUrl} />
                      <AvatarFallback>
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{provider.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="text-xs px-1">
                          {provider.tier}
                        </Badge>
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          {provider.averageRating.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-bold">
                    {formatCurrency(provider.totalGmv)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Buyers */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-blue-500" />
              Top Buyers
            </CardTitle>
            <CardDescription>By spend</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.topBuyers.slice(0, 5).map((buyer, index) => (
                <div 
                  key={buyer.id}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground w-4">
                      {index + 1}
                    </span>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={buyer.avatarUrl} />
                      <AvatarFallback>
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{buyer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {buyer.totalOrders} orders
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-bold">
                    {formatCurrency(buyer.totalSpend)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function AdminDashboardSkeleton() {
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
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-[400px]" />
      <div className="grid grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-80" />
        ))}
      </div>
    </div>
  )
}

export default AdminDashboard
