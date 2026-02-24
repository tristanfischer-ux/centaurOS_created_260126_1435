/**
 * @file chart-spec.ts — Chart specification types for specialist AI chart output.
 *
 * @description Defines the JSON structure specialists use to output charts via
 * <!-- CHART {...} --> blocks in their responses.
 */

/** Supported chart types */
export type ChartType = "bar" | "line" | "pie" | "area"

/** A single data point in a chart */
export interface ChartDataPoint {
    label: string
    value: number
    /** Optional secondary value (e.g., for comparison) */
    value2?: number
}

/** Full chart specification output by specialists */
export interface ChartSpec {
    type: ChartType
    title: string
    /** X-axis label (bar, line, area) */
    xLabel?: string
    /** Y-axis label (bar, line, area) */
    yLabel?: string
    /** Data series name */
    seriesName?: string
    /** Secondary series name (for dual-series charts) */
    series2Name?: string
    /** Chart data points */
    data: ChartDataPoint[]
}

const VALID_CHART_TYPES: ChartType[] = ["bar", "line", "pie", "area"]

/**
 * Validate a parsed JSON object as a ChartSpec.
 * Returns null if invalid.
 */
export function validateChartSpec(parsed: unknown): ChartSpec | null {
    if (!parsed || typeof parsed !== "object") return null
    const spec = parsed as Record<string, unknown>

    if (typeof spec.type !== "string" || !VALID_CHART_TYPES.includes(spec.type as ChartType)) return null
    if (typeof spec.title !== "string") return null
    if (!Array.isArray(spec.data) || spec.data.length === 0) return null

    // Validate each data point
    const validData: ChartDataPoint[] = []
    for (const point of spec.data) {
        if (!point || typeof point !== "object") continue
        const p = point as Record<string, unknown>
        if (typeof p.label !== "string" || typeof p.value !== "number") continue
        validData.push({
            label: p.label,
            value: p.value,
            ...(typeof p.value2 === "number" ? { value2: p.value2 } : {}),
        })
    }

    if (validData.length === 0) return null

    return {
        type: spec.type as ChartType,
        title: spec.title as string,
        ...(typeof spec.xLabel === "string" ? { xLabel: spec.xLabel } : {}),
        ...(typeof spec.yLabel === "string" ? { yLabel: spec.yLabel } : {}),
        ...(typeof spec.seriesName === "string" ? { seriesName: spec.seriesName } : {}),
        ...(typeof spec.series2Name === "string" ? { series2Name: spec.series2Name } : {}),
        data: validData,
    }
}
