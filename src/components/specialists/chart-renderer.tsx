"use client"

/**
 * @file chart-renderer.tsx — Generic chart renderer for specialist AI chart output.
 *
 * @description Renders a ChartSpec (parsed from <!-- CHART {...} --> blocks)
 * as a visual Recharts chart inside a Card. Supports bar, line, pie, and area types
 * with optional dual-series support.
 */

import {
    BarChart, Bar,
    LineChart, Line,
    PieChart, Pie,
    AreaChart, Area,
    XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getChartColor } from "@/lib/chart-colors"
import type { ChartSpec } from "@/lib/agents/tools/chart-spec"
import { cn } from "@/lib/utils"

interface ChartRendererProps {
    spec: ChartSpec
    className?: string
}

/**
 * Render a ChartSpec as a visual Recharts chart.
 *
 * @param props.spec - The validated chart specification
 * @param props.className - Optional additional CSS classes
 */
export function ChartRenderer({ spec, className }: ChartRendererProps) {
    const hasDualSeries = spec.data.some((d) => d.value2 !== undefined)
    const color1 = getChartColor(0)
    const color2 = getChartColor(1)

    const axisProps = {
        tick: { fontSize: 12, fill: "hsl(var(--muted-foreground))" },
        axisLine: { stroke: "hsl(var(--border))" },
        tickLine: false,
    }

    const renderChart = () => {
        switch (spec.type) {
            case "bar":
                return (
                    <BarChart data={spec.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" {...axisProps} />
                        <YAxis {...axisProps} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: 8,
                                fontSize: 12,
                            }}
                        />
                        <Bar
                            dataKey="value"
                            name={spec.seriesName ?? "Value"}
                            fill={color1}
                            radius={[4, 4, 0, 0]}
                        />
                        {hasDualSeries && (
                            <Bar
                                dataKey="value2"
                                name={spec.series2Name ?? "Value 2"}
                                fill={color2}
                                radius={[4, 4, 0, 0]}
                            />
                        )}
                    </BarChart>
                )
            case "line":
                return (
                    <LineChart data={spec.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" {...axisProps} />
                        <YAxis {...axisProps} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: 8,
                                fontSize: 12,
                            }}
                        />
                        <Line
                            type="monotone"
                            dataKey="value"
                            name={spec.seriesName ?? "Value"}
                            stroke={color1}
                            strokeWidth={2}
                            dot={{ r: 4, fill: color1 }}
                        />
                        {hasDualSeries && (
                            <Line
                                type="monotone"
                                dataKey="value2"
                                name={spec.series2Name ?? "Value 2"}
                                stroke={color2}
                                strokeWidth={2}
                                dot={{ r: 4, fill: color2 }}
                            />
                        )}
                    </LineChart>
                )
            case "pie":
                return (
                    <PieChart>
                        <Pie
                            data={spec.data}
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            innerRadius={50}
                            dataKey="value"
                            nameKey="label"
                            paddingAngle={2}
                            strokeWidth={0}
                        >
                            {spec.data.map((_, index) => (
                                <Cell key={`cell-${index}`} fill={getChartColor(index)} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: 8,
                                fontSize: 12,
                            }}
                        />
                    </PieChart>
                )
            case "area":
                return (
                    <AreaChart data={spec.data}>
                        <defs>
                            <linearGradient id="areaGrad1" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color1} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={color1} stopOpacity={0} />
                            </linearGradient>
                            {hasDualSeries && (
                                <linearGradient id="areaGrad2" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={color2} stopOpacity={0.3} />
                                    <stop offset="95%" stopColor={color2} stopOpacity={0} />
                                </linearGradient>
                            )}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" {...axisProps} />
                        <YAxis {...axisProps} />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "hsl(var(--card))",
                                border: "1px solid hsl(var(--border))",
                                borderRadius: 8,
                                fontSize: 12,
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="value"
                            name={spec.seriesName ?? "Value"}
                            stroke={color1}
                            fill="url(#areaGrad1)"
                            strokeWidth={2}
                        />
                        {hasDualSeries && (
                            <Area
                                type="monotone"
                                dataKey="value2"
                                name={spec.series2Name ?? "Value 2"}
                                stroke={color2}
                                fill="url(#areaGrad2)"
                                strokeWidth={2}
                            />
                        )}
                    </AreaChart>
                )
        }
    }

    return (
        <Card className={cn("rounded-xl border shadow-sm", className)}>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{spec.title}</CardTitle>
                {(spec.xLabel || spec.yLabel) && (
                    <p className="text-xs text-muted-foreground">
                        {spec.xLabel && spec.yLabel
                            ? `${spec.xLabel} vs ${spec.yLabel}`
                            : spec.xLabel ?? spec.yLabel}
                    </p>
                )}
            </CardHeader>
            <CardContent className="pb-4">
                <ResponsiveContainer width="100%" height={300}>
                    {renderChart()}
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}
