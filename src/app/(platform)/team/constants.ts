/**
 * @file constants.ts
 *
 * @description Business function definitions, SVG geometry constants, and status colour
 * palette for the Team orbital view. Data is now fetched from Supabase
 * (see use-team-data.ts for the transformation logic).
 */

import type {
  BusinessFunction,
  FunctionCoverage,
  StatusColorSet,
  CoverageStatus,
} from './types'

// ═══════════════════════════════════════════════════════════════════════════════
// BUSINESS FUNCTIONS (clockwise from top-right)
// ═══════════════════════════════════════════════════════════════════════════════

export const FUNCTIONS: BusinessFunction[] = [
  { id: 'sales', label: 'Sales', short: 'SALES' },
  { id: 'marketing', label: 'Marketing', short: 'MKTG' },
  { id: 'finance', label: 'Finance', short: 'FIN' },
  { id: 'hr', label: 'People & HR', short: 'HR' },
  { id: 'legal', label: 'Legal & Admin', short: 'LEGAL' },
  { id: 'operations', label: 'Operations', short: 'OPS' },
  { id: 'product', label: 'Product', short: 'PROD' },
]

// ═══════════════════════════════════════════════════════════════════════════════
// SVG GEOMETRY (viewBox 0 0 840 840)
// ═══════════════════════════════════════════════════════════════════════════════

export const CX = 420
export const CY = 420
export const GAP_DEG = 4.5
export const SLICE_DEG = (360 - 7 * GAP_DEG) / 7

/** Center hub radius (founders) */
export const HUB_R = 58
/** Specialist advisors ring radius */
export const SPEC_R = 78
/** Function label band inner radius */
export const FUNC_R1 = 98
/** Function label band outer radius */
export const FUNC_R2 = 138
/** Executive ring radius */
export const EXEC_R = 190
/** Apprentice ring radius */
export const APPR_R = 250
/** Company / marketplace boundary */
export const BOUNDARY_R = 290
/** Marketplace ring radius */
export const MKT_R = 335
/** Outer edge */
export const OUTER_R = 380

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS COLOUR PALETTE
// ═══════════════════════════════════════════════════════════════════════════════

export const STATUS_COLORS: Record<CoverageStatus, StatusColorSet> = {
  green: {
    arc: '#059669',
    fill: '#D1FAE5',
    fillH: '#A7F3D0',
    border: '#34D399',
    text: '#047857',
    conn: '#6EE7B7',
  },
  yellow: {
    arc: '#D97706',
    fill: '#FEF3C7',
    fillH: '#FDE68A',
    border: '#FBBF24',
    text: '#B45309',
    conn: '#FCD34D',
  },
  red: {
    arc: '#DC2626',
    fill: '#FEE2E2',
    fillH: '#FECACA',
    border: '#F87171',
    text: '#B91C1C',
    conn: '#FCA5A5',
  },
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Derives the coverage status for a single business function.
 *
 * @param coverage - The coverage data for the function
 * @returns 'green' if an executive is assigned, 'yellow' if founder is covering, 'red' otherwise
 */
export function getCoverageStatus(coverage: FunctionCoverage): CoverageStatus {
  if (coverage.execs.length > 0) return 'green'
  if (coverage.founderCovering) return 'yellow'
  return 'red'
}
