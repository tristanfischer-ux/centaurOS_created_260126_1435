"use client"

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
  Area,
} from "recharts"
import { chartColors, getChartColor } from "@/lib/chart-colors"
import { cn } from "@/lib/utils"

export type ChartType = "bar" | "line" | "pie" | "area"

export interface ChartConfig {
  type: ChartType
  title?: string
  data: Array<Record<string, string | number>>
  dataKey: string
  xAxisKey?: string
  seriesKeys?: string[]
}

interface ChartBuilderProps {
  config: ChartConfig | null
  className?: string
}

export function ChartBuilder({ config, className }: ChartBuilderProps): React.ReactElement {
  if (!config || !config.data || config.data.length === 0) {
    return (
      <div className={cn("flex flex-1 items-center justify-center p-8", className)}>
        <p className="text-sm text-muted-foreground">
          Ask your specialist to create a chart. Data and visualizations will appear here.
        </p>
      </div>
    )
  }

  const { type, title, data, dataKey, xAxisKey, seriesKeys } = config
  const xKey = xAxisKey ?? (typeof data[0] === "object" && data[0] !== null ? Object.keys(data[0] as object)[0] : "name")

  return (
    <div className={cn("flex flex-1 flex-col min-h-0 p-4", className)}>
      {title && (
        <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
      )}
      <div className="flex-1 min-h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          {type === "bar" && (
            <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
              />
              {seriesKeys && seriesKeys.length > 0 ? (
                seriesKeys.map((key, i) => (
                  <Bar key={key} dataKey={key} fill={getChartColor(i)} radius={[4, 4, 0, 0]} />
                ))
              ) : (
                <Bar dataKey={dataKey} fill={chartColors[0]} radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          )}
          {type === "line" && (
            <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              />
              {seriesKeys && seriesKeys.length > 0 ? (
                seriesKeys.map((key, i) => (
                  <Line key={key} type="monotone" dataKey={key} stroke={getChartColor(i)} strokeWidth={2} dot={{ r: 4 }} />
                ))
              ) : (
                <Line type="monotone" dataKey={dataKey} stroke={chartColors[0]} strokeWidth={2} dot={{ r: 4 }} />
              )}
            </LineChart>
          )}
          {type === "area" && (
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey={xKey} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              />
              {seriesKeys && seriesKeys.length > 0 ? (
                seriesKeys.map((key, i) => (
                  <Area key={key} type="monotone" dataKey={key} fill={getChartColor(i)} stroke={getChartColor(i)} fillOpacity={0.6} />
                ))
              ) : (
                <Area type="monotone" dataKey={dataKey} fill={chartColors[0]} stroke={chartColors[0]} fillOpacity={0.6} />
              )}
            </AreaChart>
          )}
          {type === "pie" && (
            <PieChart>
              <Pie
                data={data}
                dataKey={dataKey}
                nameKey={xKey}
                cx="50%"
                cy="50%"
                outerRadius="80%"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={getChartColor(i)} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
