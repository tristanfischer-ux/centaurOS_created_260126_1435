/**
 * Automated Reporting Engine
 * 
 * Exports for generating daily pulse, weekly rollup, and monthly summary reports
 */

// Types
export * from './types'

// Core functions
export { 
    fetchDailyPulseData,
    generateDailyPulseReport,
    formatDailyPulseForTelegram,
    formatDailyPulseForEmail,
    formatDailyPulseForSlack
} from './daily-pulse'

export {
    generateDailySummary,
    generateWeeklySummary,
    generateMonthlySummary
} from './summary-generator'

export {
    calculateTrend,
    calculateDailyTrends,
    calculateWeeklyTrends,
    getTrendDirection,
    calculatePercentChange,
    detectAnomalies,
    calculateRollingAverage,
    analyzeProductivityPattern
} from './trends'

export {
    generateDailyInsights,
    generateWeeklyInsights
} from './insights'
