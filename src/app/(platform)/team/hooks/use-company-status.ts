/**
 * @file use-company-status.ts
 *
 * @description Derives green/yellow/red status per function and summary counts.
 */

import { useMemo } from 'react'
import { FUNCTIONS, TEAM_COVERAGE, getCoverageStatus } from '../constants'
import type { CoverageStatus } from '../types'

interface CompanyStatusResult {
  statusByFunction: Record<string, CoverageStatus>
  counts: { green: number; yellow: number; red: number }
}

/**
 * Computes coverage status for every business function.
 *
 * @returns Per-function status and aggregate counts
 */
export function useCompanyStatus(): CompanyStatusResult {
  return useMemo(() => {
    const statusByFunction: Record<string, CoverageStatus> = {}
    const counts = { green: 0, yellow: 0, red: 0 }

    FUNCTIONS.forEach((fn) => {
      const comp = TEAM_COVERAGE[fn.id]
      if (!comp) {
        statusByFunction[fn.id] = 'red'
        counts.red++
        return
      }
      const status = getCoverageStatus(comp)
      statusByFunction[fn.id] = status
      counts[status]++
    })

    return { statusByFunction, counts }
  }, [])
}
