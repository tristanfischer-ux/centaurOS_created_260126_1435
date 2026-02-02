/**
 * Trend Analysis & Anomaly Detection
 * 
 * Calculates week-over-week trends and detects unusual patterns
 */

import { TrendData, TrendDirection } from './types'

/**
 * Calculate trend direction based on change
 */
export function getTrendDirection(change: number, threshold: number = 2): TrendDirection {
    if (change > threshold) return 'up'
    if (change < -threshold) return 'down'
    return 'stable'
}

/**
 * Calculate percentage change between two values
 */
export function calculatePercentChange(current: number, previous: number): number {
    if (previous === 0) {
        return current > 0 ? 100 : 0
    }
    return ((current - previous) / previous) * 100
}

/**
 * Calculate trend data for a single metric
 */
export function calculateTrend(
    metric: string,
    current: number,
    previous: number,
    options: {
        threshold?: number
        anomalyThreshold?: number
    } = {}
): TrendData {
    const { threshold = 2, anomalyThreshold = 50 } = options
    
    const change = current - previous
    const changePercent = calculatePercentChange(current, previous)
    const trend = getTrendDirection(change, threshold)
    
    // Anomaly detection - significant deviation from previous
    const isAnomaly = Math.abs(changePercent) > anomalyThreshold
    const anomalyType = isAnomaly 
        ? (change > 0 ? 'spike' : 'drop')
        : null
    
    return {
        metric,
        current,
        previous,
        change,
        changePercent: Math.round(changePercent * 10) / 10,
        trend,
        isAnomaly,
        anomalyType
    }
}

/**
 * Calculate multiple trends from daily pulse data
 */
export function calculateDailyTrends(
    todayPersonalCompleted: number,
    yesterdayPersonalCompleted: number,
    todayTeamCompleted: number,
    yesterdayTeamCompleted: number,
    todayTeamCompletionRate: number,
    avgCompletionRate: number = 50
): TrendData[] {
    const trends: TrendData[] = []
    
    // Personal completion trend
    trends.push(calculateTrend(
        'Your Tasks',
        todayPersonalCompleted,
        yesterdayPersonalCompleted,
        { threshold: 1, anomalyThreshold: 100 }
    ))
    
    // Team completion trend
    trends.push(calculateTrend(
        'Team Tasks',
        todayTeamCompleted,
        yesterdayTeamCompleted,
        { threshold: 3, anomalyThreshold: 50 }
    ))
    
    // Completion rate vs average
    if (avgCompletionRate > 0) {
        trends.push(calculateTrend(
            'Completion Rate',
            todayTeamCompletionRate,
            avgCompletionRate,
            { threshold: 5, anomalyThreshold: 30 }
        ))
    }
    
    return trends
}

/**
 * Calculate weekly trends
 */
export function calculateWeeklyTrends(
    thisWeekCompleted: number,
    lastWeekCompleted: number,
    thisWeekCreated: number,
    lastWeekCreated: number
): TrendData[] {
    const trends: TrendData[] = []
    
    trends.push(calculateTrend(
        'Tasks Completed',
        thisWeekCompleted,
        lastWeekCompleted,
        { threshold: 5, anomalyThreshold: 40 }
    ))
    
    trends.push(calculateTrend(
        'Tasks Created',
        thisWeekCreated,
        lastWeekCreated,
        { threshold: 5, anomalyThreshold: 40 }
    ))
    
    // Velocity (completed vs created ratio)
    const thisWeekVelocity = thisWeekCreated > 0 
        ? Math.round((thisWeekCompleted / thisWeekCreated) * 100)
        : 0
    const lastWeekVelocity = lastWeekCreated > 0 
        ? Math.round((lastWeekCompleted / lastWeekCreated) * 100)
        : 0
    
    trends.push(calculateTrend(
        'Velocity',
        thisWeekVelocity,
        lastWeekVelocity,
        { threshold: 10, anomalyThreshold: 30 }
    ))
    
    return trends
}

/**
 * Detect anomalies in a time series
 * Uses standard deviation method
 */
export function detectAnomalies(
    values: number[],
    currentValue: number,
    stdDevThreshold: number = 2
): { isAnomaly: boolean; severity: 'low' | 'medium' | 'high'; deviation: number } {
    if (values.length < 3) {
        return { isAnomaly: false, severity: 'low', deviation: 0 }
    }
    
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length
    const stdDev = Math.sqrt(variance)
    
    if (stdDev === 0) {
        return { isAnomaly: currentValue !== mean, severity: 'low', deviation: 0 }
    }
    
    const deviation = Math.abs(currentValue - mean) / stdDev
    const isAnomaly = deviation > stdDevThreshold
    
    let severity: 'low' | 'medium' | 'high' = 'low'
    if (deviation > 3) severity = 'high'
    else if (deviation > 2.5) severity = 'medium'
    
    return {
        isAnomaly,
        severity,
        deviation: Math.round(deviation * 100) / 100
    }
}

/**
 * Calculate rolling average
 */
export function calculateRollingAverage(values: number[], window: number = 7): number {
    if (values.length === 0) return 0
    const slice = values.slice(-window)
    return Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 10) / 10
}

/**
 * Analyze productivity pattern (identifies best days)
 */
export function analyzeProductivityPattern(
    dailyData: { date: string; completed: number }[]
): { bestDay: string | null; avgByDay: Record<string, number> } {
    const dayTotals: Record<string, number[]> = {
        Sunday: [], Monday: [], Tuesday: [], Wednesday: [],
        Thursday: [], Friday: [], Saturday: []
    }
    
    for (const day of dailyData) {
        const date = new Date(day.date)
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' })
        if (dayTotals[dayName]) {
            dayTotals[dayName].push(day.completed)
        }
    }
    
    const avgByDay: Record<string, number> = {}
    let bestDay: string | null = null
    let bestAvg = 0
    
    for (const [day, values] of Object.entries(dayTotals)) {
        if (values.length > 0) {
            const avg = values.reduce((a, b) => a + b, 0) / values.length
            avgByDay[day] = Math.round(avg * 10) / 10
            if (avg > bestAvg) {
                bestAvg = avg
                bestDay = day
            }
        }
    }
    
    return { bestDay, avgByDay }
}
