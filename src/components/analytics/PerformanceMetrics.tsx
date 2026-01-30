"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Star,
  Clock,
  CheckCircle,
  MessageCircle,
  Users,
  Target
} from "lucide-react"
import { MetricCardData, ComparisonDataPoint } from "@/types/analytics"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface PerformanceMetricsProps {
  metrics: MetricCardData[]
  title?: string
  description?: string
  columns?: 2 | 3 | 4
  showComparison?: boolean
  className?: string
}

// Icon mapping
const iconMap: Record<string, LucideIcon> = {
  star: Star,
  clock: Clock,
  checkCircle: CheckCircle,
  messageCircle: MessageCircle,
  users: Users,
  target: Target,
  trendingUp: TrendingUp,
  trendingDown: TrendingDown,
}

export function PerformanceMetrics({
  metrics,
  title = "Performance Metrics",
  description = "Key performance indicators",
  columns = 4,
  showComparison = true,
  className
}: PerformanceMetricsProps) {
  const gridClass = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  }[columns]

  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className={cn("grid gap-4", gridClass)}>
          {metrics.map((metric, index) => (
            <MetricCard 
              key={index} 
              metric={metric}
              showComparison={showComparison}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

interface MetricCardProps {
  metric: MetricCardData
  showComparison?: boolean
}

function MetricCard({ metric, showComparison }: MetricCardProps) {
  const Icon = metric.icon ? (iconMap[metric.icon] || Target) : Target
  
  const variantStyles = {
    default: {
      bg: 'bg-muted border-slate-100',
      icon: 'text-muted-foreground',
      value: 'text-foreground',
    },
    success: {
      bg: 'bg-green-50 border-green-100',
      icon: 'text-green-600',
      value: 'text-green-900',
    },
    warning: {
      bg: 'bg-amber-50 border-amber-100',
      icon: 'text-amber-600',
      value: 'text-amber-900',
    },
    danger: {
      bg: 'bg-red-50 border-red-100',
      icon: 'text-red-600',
      value: 'text-red-900',
    },
  }
  
  const styles = variantStyles[metric.variant || 'default']
  
  // Determine trend icon
  const TrendIcon = metric.trend?.direction === 'up' 
    ? TrendingUp 
    : metric.trend?.direction === 'down' 
    ? TrendingDown 
    : Minus
  
  // Determine trend color - context-aware (isPositive flag)
  const trendColor = metric.trend?.isPositive !== undefined
    ? metric.trend.isPositive 
      ? 'text-green-600' 
      : 'text-red-600'
    : metric.trend?.direction === 'up'
      ? 'text-green-600'
      : metric.trend?.direction === 'down'
        ? 'text-red-600'
        : 'text-muted-foreground'

  return (
    <div className={cn("p-4 rounded-lg border", styles.bg)}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded-md bg-white/80", styles.icon)}>
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-sm font-medium text-muted-foreground">
            {metric.label}
          </span>
        </div>
        {showComparison && metric.trend && (
          <div className={cn("flex items-center gap-1 text-xs font-medium", trendColor)}>
            <TrendIcon className="h-3 w-3" />
            <span>{metric.trend.value}</span>
          </div>
        )}
      </div>
      <p className={cn("text-2xl font-bold mt-2", styles.value)}>
        {metric.value}
      </p>
    </div>
  )
}

// ==========================================
// PRESET METRIC CARDS
// ==========================================

interface SupplierMetricsProps {
  completionRate: number
  responseRate: number
  avgResponseTime: number
  avgRating: number
  totalReviews: number
  repeatClientRate: number
  platformAvgCompletionRate?: number
  platformAvgResponseRate?: number
  platformAvgRating?: number
  className?: string
}

export function SupplierPerformanceMetrics({
  completionRate,
  responseRate,
  avgResponseTime,
  avgRating,
  totalReviews,
  repeatClientRate,
  platformAvgCompletionRate,
  platformAvgResponseRate,
  platformAvgRating,
  className
}: SupplierMetricsProps) {
  // Calculate comparison deltas
  const completionDelta = platformAvgCompletionRate 
    ? completionRate - platformAvgCompletionRate 
    : null
  const responseDelta = platformAvgResponseRate 
    ? responseRate - platformAvgResponseRate 
    : null
  const ratingDelta = platformAvgRating 
    ? avgRating - platformAvgRating 
    : null

  const metrics: MetricCardData[] = [
    {
      label: 'Completion Rate',
      value: `${completionRate.toFixed(1)}%`,
      icon: 'checkCircle',
      variant: completionRate >= 90 ? 'success' : completionRate >= 70 ? 'warning' : 'danger',
      trend: completionDelta !== null ? {
        direction: completionDelta >= 0 ? 'up' : 'down',
        value: `${completionDelta >= 0 ? '+' : ''}${completionDelta.toFixed(1)}% vs avg`,
        isPositive: completionDelta >= 0
      } : undefined
    },
    {
      label: 'Response Rate',
      value: `${responseRate.toFixed(1)}%`,
      icon: 'messageCircle',
      variant: responseRate >= 90 ? 'success' : responseRate >= 70 ? 'warning' : 'danger',
      trend: responseDelta !== null ? {
        direction: responseDelta >= 0 ? 'up' : 'down',
        value: `${responseDelta >= 0 ? '+' : ''}${responseDelta.toFixed(1)}% vs avg`,
        isPositive: responseDelta >= 0
      } : undefined
    },
    {
      label: 'Avg Response Time',
      value: avgResponseTime < 24 ? `${avgResponseTime.toFixed(1)}h` : `${(avgResponseTime / 24).toFixed(1)}d`,
      icon: 'clock',
      variant: avgResponseTime <= 4 ? 'success' : avgResponseTime <= 24 ? 'warning' : 'danger',
    },
    {
      label: 'Rating',
      value: `${avgRating.toFixed(1)} / 5`,
      icon: 'star',
      variant: avgRating >= 4.5 ? 'success' : avgRating >= 3.5 ? 'warning' : 'danger',
      trend: ratingDelta !== null ? {
        direction: ratingDelta >= 0 ? 'up' : 'down',
        value: `${ratingDelta >= 0 ? '+' : ''}${ratingDelta.toFixed(2)} vs avg`,
        isPositive: ratingDelta >= 0
      } : undefined
    },
    {
      label: 'Total Reviews',
      value: totalReviews.toLocaleString(),
      icon: 'users',
      variant: 'default',
    },
    {
      label: 'Repeat Client Rate',
      value: `${repeatClientRate.toFixed(1)}%`,
      icon: 'target',
      variant: repeatClientRate >= 30 ? 'success' : repeatClientRate >= 15 ? 'warning' : 'default',
    },
  ]

  return (
    <PerformanceMetrics
      metrics={metrics}
      title="Performance Metrics"
      description="Compare your performance to platform averages"
      columns={3}
      className={className}
    />
  )
}

// ==========================================
// COMPARISON METRICS COMPONENT
// ==========================================

interface ComparisonMetricsProps {
  comparisons: ComparisonDataPoint[]
  title?: string
  className?: string
}

export function ComparisonMetrics({
  comparisons,
  title = "Period Comparison",
  className
}: ComparisonMetricsProps) {
  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>Compare current vs previous period</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {comparisons.map((comparison, index) => (
            <div key={index} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{comparison.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">
                    {typeof comparison.current === 'number' 
                      ? comparison.current.toLocaleString()
                      : comparison.current}
                  </span>
                  <div className={cn(
                    "flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded",
                    comparison.changePercent >= 0 
                      ? "bg-green-100 text-green-700" 
                      : "bg-red-100 text-red-700"
                  )}>
                    {comparison.changePercent >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {Math.abs(comparison.changePercent).toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Progress 
                  value={comparison.previous > 0 
                    ? Math.min((comparison.current / comparison.previous) * 100, 100)
                    : 0
                  } 
                  className="h-2"
                />
                <span className="text-xs text-muted-foreground min-w-[60px] text-right">
                  vs {comparison.previous.toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default PerformanceMetrics
