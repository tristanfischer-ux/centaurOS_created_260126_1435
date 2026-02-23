/**
 * @file report-utils.ts — Shared types and utilities for financial reports
 *
 * @description Pure utility functions for date range computation.
 * Separated from server actions to avoid 'use server' restrictions
 * on non-async exports.
 */

export type ReportType = 'pnl' | 'vat' | 'cash-flow-statement'

export type DatePreset = 'this-month' | 'last-month' | 'this-quarter' | 'ytd' | 'custom'

export interface DateRange {
  from: string // ISO date
  to: string   // ISO date
}

/**
 * Compute date range from a preset.
 */
export function getDateRangeFromPreset(preset: DatePreset): DateRange {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  switch (preset) {
    case 'this-month':
      return {
        from: new Date(year, month, 1).toISOString(),
        to: new Date(year, month + 1, 0, 23, 59, 59).toISOString(),
      }
    case 'last-month':
      return {
        from: new Date(year, month - 1, 1).toISOString(),
        to: new Date(year, month, 0, 23, 59, 59).toISOString(),
      }
    case 'this-quarter': {
      const qStart = Math.floor(month / 3) * 3
      return {
        from: new Date(year, qStart, 1).toISOString(),
        to: new Date(year, qStart + 3, 0, 23, 59, 59).toISOString(),
      }
    }
    case 'ytd':
      return {
        from: new Date(year, 0, 1).toISOString(),
        to: now.toISOString(),
      }
    default:
      return {
        from: new Date(year, month, 1).toISOString(),
        to: now.toISOString(),
      }
  }
}
