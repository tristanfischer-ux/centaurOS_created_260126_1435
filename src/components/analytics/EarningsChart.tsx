"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, AreaChart } from "recharts"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"
import { TimeSeriesDataPoint, AnalyticsPeriod } from "@/types/analytics"
import { cn } from "@/lib/utils"

interface EarningsChartProps {
  data: TimeSeriesDataPoint[]
  currency?: string
  period: AnalyticsPeriod
  onPeriodChange?: (period: AnalyticsPeriod) => void
  previousPeriodData?: TimeSeriesDataPoint[]
  totalEarnings?: number
  previousTotalEarnings?: number
  title?: string
  className?: string
}

export function EarningsChart({
  data,
  currency = 'GBP',
  period,
  onPeriodChange,
  previousPeriodData,
  totalEarnings,
  previousTotalEarnings,
  title = "Earnings",
  className
}: EarningsChartProps) {
  // Calculate period change
  const change = totalEarnings !== undefined && previousTotalEarnings !== undefined && previousTotalEarnings > 0
    ? ((totalEarnings - previousTotalEarnings) / previousTotalEarnings) * 100
    : null
  
  const isPositive = change !== null && change >= 0
  
  // Format currency value
  const formatValue = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }
  
  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean
    payload?: Array<{ value: number; name: string; color: string }>
    label?: string
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 p-3 border rounded-lg shadow-lg">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm font-semibold" style={{ color: entry.color }}>
              {entry.name}: {formatValue(entry.value)}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>
            {period === 'week' && 'Last 7 days'}
            {period === 'month' && 'Last 30 days'}
            {period === 'quarter' && 'Last 3 months'}
            {period === 'year' && 'Last 12 months'}
            {period === 'all' && 'All time'}
          </CardDescription>
        </div>
        <div className="flex items-center gap-4">
          {change !== null && (
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium",
              isPositive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            )}>
              {isPositive ? (
                <TrendingUp className="h-4 w-4" />
              ) : change === 0 ? (
                <Minus className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              {Math.abs(change).toFixed(1)}%
            </div>
          )}
          {onPeriodChange && (
            <Select value={period} onValueChange={(v) => onPeriodChange(v as AnalyticsPeriod)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="quarter">Quarter</SelectItem>
                <SelectItem value="year">Year</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary */}
        {totalEarnings !== undefined && (
          <div className="mb-4">
            <p className="text-3xl font-bold">{formatValue(totalEarnings)}</p>
            <p className="text-sm text-muted-foreground">
              {previousTotalEarnings !== undefined && (
                <>vs {formatValue(previousTotalEarnings)} previous period</>
              )}
            </p>
          </div>
        )}
        
        {/* Chart */}
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart 
              data={data}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="earningsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="previousGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => formatValue(value)}
              />
              <Tooltip content={<CustomTooltip />} />
              {previousPeriodData && (
                <Area
                  type="monotone"
                  dataKey="value"
                  data={previousPeriodData}
                  name="Previous Period"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  fill="url(#previousGradient)"
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                name="Current Period"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#earningsGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export default EarningsChart
