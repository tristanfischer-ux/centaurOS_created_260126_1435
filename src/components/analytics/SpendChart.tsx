"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  Cell,
  Legend
} from "recharts"
import { TrendingUp, TrendingDown } from "lucide-react"
import { TimeSeriesDataPoint, CategoryDataPoint, AnalyticsPeriod } from "@/types/analytics"
import { cn } from "@/lib/utils"

interface SpendChartProps {
  trendData: TimeSeriesDataPoint[]
  categoryData: CategoryDataPoint[]
  currency?: string
  period: AnalyticsPeriod
  onPeriodChange?: (period: AnalyticsPeriod) => void
  totalSpend?: number
  previousTotalSpend?: number
  budgetAmount?: number
  title?: string
  className?: string
}

// Color palette for categories
const COLORS = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#84cc16', // lime
]

export function SpendChart({
  trendData,
  categoryData,
  currency = 'GBP',
  period,
  onPeriodChange,
  totalSpend,
  previousTotalSpend,
  budgetAmount,
  title = "Spending",
  className
}: SpendChartProps) {
  // Calculate period change
  const change = totalSpend !== undefined && previousTotalSpend !== undefined && previousTotalSpend > 0
    ? ((totalSpend - previousTotalSpend) / previousTotalSpend) * 100
    : null
  
  // For spending, lower is usually better
  const isBetterTrend = change !== null && change <= 0
  
  // Budget tracking
  const budgetUsedPercent = budgetAmount && totalSpend 
    ? Math.min((totalSpend / budgetAmount) * 100, 100)
    : null
  
  // Format currency value
  const formatValue = (value: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }
  
  // Custom tooltip for bar chart
  const BarTooltip = ({ active, payload, label }: {
    active?: boolean
    payload?: Array<{ value: number }>
    label?: string
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background p-3 border rounded-lg shadow-lg">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-sm font-semibold text-blue-600">
            {formatValue(payload[0].value)}
          </p>
        </div>
      )
    }
    return null
  }
  
  // Custom tooltip for pie chart
  const PieTooltip = ({ active, payload }: {
    active?: boolean
    payload?: Array<{ name: string; value: number; payload: CategoryDataPoint }>
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0]
      return (
        <div className="bg-background p-3 border rounded-lg shadow-lg">
          <p className="text-sm font-medium">{data.name}</p>
          <p className="text-sm font-semibold">{formatValue(data.value)}</p>
          <p className="text-xs text-muted-foreground">
            {data.payload.percentage}% of total
          </p>
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
            Track your spending patterns
          </CardDescription>
        </div>
        <div className="flex items-center gap-4">
          {change !== null && (
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-sm font-medium",
              isBetterTrend ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            )}>
              {change >= 0 ? (
                <TrendingUp className="h-4 w-4" />
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
        {totalSpend !== undefined && (
          <div className="mb-4">
            <p className="text-3xl font-bold">{formatValue(totalSpend)}</p>
            {budgetAmount && budgetUsedPercent !== null && (
              <div className="mt-2">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Budget</span>
                  <span className="font-medium">{budgetUsedPercent.toFixed(0)}% used</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all",
                      budgetUsedPercent >= 90 ? "bg-red-500" :
                      budgetUsedPercent >= 75 ? "bg-amber-500" :
                      "bg-blue-500"
                    )}
                    style={{ width: `${budgetUsedPercent}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatValue(budgetAmount - (totalSpend || 0))} remaining of {formatValue(budgetAmount)}
                </p>
              </div>
            )}
          </div>
        )}
        
        {/* Charts in tabs */}
        <Tabs defaultValue="trend" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="trend">Trend</TabsTrigger>
            <TabsTrigger value="categories">By Category</TabsTrigger>
          </TabsList>
          
          <TabsContent value="trend">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={trendData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
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
                  <Tooltip content={<BarTooltip />} />
                  <Bar 
                    dataKey="value" 
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
          
          <TabsContent value="categories">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="category"
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={{ strokeWidth: 1 }}
                  >
                    {categoryData.map((_, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

export default SpendChart
