/**
 * @file use-company-status.ts
 *
 * @description Derives green/yellow/red status per function and summary counts.
 */

import { useMemo } from 'react'
import { FUNCTIONS, getCoverageStatus } from '../constants'
import type { CoverageStatus, FunctionCoverage } from '../types'

interface CompanyStatusResult {
  statusByFunction: Record<string, CoverageStatus>
  counts: { green: number; yellow: number; red: number }
}

/**
 * Computes coverage status for every business function.
 *
 * @param teamCoverage - Coverage data per function id (from useTeamData)
 * @returns Per-function status and aggregate counts
 */
export function useCompanyStatus(
  teamCoverage: Record<string, FunctionCoverage>
): CompanyStatusResult {
  return useMemo(() => {
    const statusByFunction: Record<string, CoverageStatus> = {}
    const counts = { green: 0, yellow: 0, red: 0 }

    FUNCTIONS.forEach((fn) => {
      const comp = teamCoverage[fn.id]
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
  }, [teamCoverage])
}
