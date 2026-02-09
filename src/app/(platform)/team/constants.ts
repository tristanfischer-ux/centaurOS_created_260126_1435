/**
 * @file constants.ts
 *
 * @description Business function definitions, SVG geometry constants, status colour
 * palette, and mock data for the Team orbital / list views.
 */

import type {
  BusinessFunction,
  FunctionCoverage,
  MarketplaceCandidate,
  StatusColorSet,
  TeamMember,
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

/** Function label band inner radius */
export const FUNC_R1 = 88
/** Function label band outer radius */
export const FUNC_R2 = 130
/** Executive ring radius */
export const EXEC_R = 180
/** Apprentice ring radius */
export const APPR_R = 240
/** Company / marketplace boundary */
export const BOUNDARY_R = 280
/** Marketplace ring radius */
export const MKT_R = 325
/** Outer edge */
export const OUTER_R = 370

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
// MOCK DATA — Founders
// ═══════════════════════════════════════════════════════════════════════════════

export const FOUNDERS: TeamMember[] = [
  {
    id: 'f1',
    name: 'Tristan Fischer',
    initials: 'TF',
    role: 'FOUNDER',
    color: '#F97316',
    done: 3,
    active: 2,
    pending: 5,
    capacity: 'at_capacity',
    tasksInQueue: 5,
    title: 'CEO & Founder',
  },
  {
    id: 'f2',
    name: 'Alex Fischer',
    initials: 'AF',
    role: 'FOUNDER',
    color: '#EA580C',
    done: 0,
    active: 0,
    pending: 0,
    capacity: 'has_capacity',
    tasksInQueue: 0,
    title: 'Co-Founder',
  },
]

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA — Team coverage by function
// ═══════════════════════════════════════════════════════════════════════════════

export const TEAM_COVERAGE: Record<string, FunctionCoverage> = {
  product: {
    execs: [
      { id: 'e1', name: 'Sarah Chen', initials: 'SC', role: 'EXECUTIVE', color: '#F97316', done: 8, active: 2, pending: 1, capacity: 'has_capacity', tasksInQueue: 1, title: 'Fractional CPO' },
      { id: 'e7', name: 'Dex Morales', initials: 'DM', role: 'EXECUTIVE', color: '#3B82F6', done: 5, active: 1, pending: 0, capacity: 'has_capacity', tasksInQueue: 0, title: 'Product Lead' },
    ],
    apprentices: [
      { id: 'a1', name: 'Jake Morrison', initials: 'JM', role: 'APPRENTICE', color: '#3B82F6', done: 4, active: 1, pending: 2, capacity: 'has_capacity', tasksInQueue: 2, title: 'Product Apprentice' },
      { id: 'a6', name: 'Hannah Reeves', initials: 'HR', role: 'APPRENTICE', color: '#8B5CF6', done: 2, active: 0, pending: 1, capacity: 'has_capacity', tasksInQueue: 1, title: 'UX Apprentice' },
      { id: 'a7', name: 'Yuki Tanaka', initials: 'YT', role: 'APPRENTICE', color: '#06B6D4', done: 1, active: 1, pending: 0, capacity: 'has_capacity', tasksInQueue: 0, title: 'Dev Apprentice' },
    ],
    founderCovering: false,
  },
  sales: {
    execs: [
      { id: 'e2', name: 'Marcus Webb', initials: 'MW', role: 'EXECUTIVE', color: '#10B981', done: 12, active: 3, pending: 0, capacity: 'has_capacity', tasksInQueue: 0, title: 'Fractional CRO' },
    ],
    apprentices: [
      { id: 'a2', name: 'Lena Park', initials: 'LP', role: 'APPRENTICE', color: '#EC4899', done: 6, active: 0, pending: 3, capacity: 'has_capacity', tasksInQueue: 3, title: 'Sales Apprentice' },
      { id: 'a8', name: 'Will Cheng', initials: 'WC', role: 'APPRENTICE', color: '#6366F1', done: 0, active: 0, pending: 0, capacity: 'has_capacity', tasksInQueue: 0, title: 'SDR Apprentice' },
    ],
    founderCovering: false,
  },
  marketing: {
    execs: [],
    apprentices: [
      { id: 'a3', name: 'Priya Kumar', initials: 'PK', role: 'APPRENTICE', color: '#F59E0B', done: 3, active: 1, pending: 0, capacity: 'has_capacity', tasksInQueue: 0, title: 'Marketing Apprentice' },
    ],
    founderCovering: false,
  },
  operations: {
    execs: [],
    apprentices: [
      { id: 'a4', name: 'Rin Nakamura', initials: 'RN', role: 'APPRENTICE', color: '#14B8A6', done: 5, active: 2, pending: 1, capacity: 'has_capacity', tasksInQueue: 1, title: 'Ops Apprentice' },
      { id: 'a9', name: 'Fatima Al-Rashid', initials: 'FA', role: 'APPRENTICE', color: '#F472B6', done: 2, active: 0, pending: 0, capacity: 'has_capacity', tasksInQueue: 0, title: 'QA Apprentice' },
    ],
    founderCovering: true,
  },
  finance: { execs: [], apprentices: [], founderCovering: true },
  hr: { execs: [], apprentices: [], founderCovering: false },
  legal: { execs: [], apprentices: [], founderCovering: false },
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATA — Marketplace candidates
// ═══════════════════════════════════════════════════════════════════════════════

export const MARKETPLACE_CANDIDATES: MarketplaceCandidate[] = [
  { id: 'm1', name: 'Elena Vasquez', initials: 'EV', role: 'Fractional CMO', type: 'exec', forFunction: 'marketing', rating: 4.9, color: '#8B5CF6', tags: ['B2B', 'Content', 'SEO'], hourlyRate: '$150/hr' },
  { id: 'm20', name: 'Zara Osei', initials: 'ZO', role: 'Growth Lead', type: 'exec', forFunction: 'marketing', rating: 4.6, color: '#EC4899', tags: ['Paid ads', 'Analytics'], hourlyRate: '$120/hr' },
  { id: 'm6', name: 'Tom Ashford', initials: 'TA', role: 'Marketing Apprentice', type: 'apprentice', forFunction: 'marketing', rating: 4.3, color: '#F59E0B', tags: ['Social', 'Copy'], hourlyRate: '$35/hr' },
  { id: 'm21', name: 'Kai Brennan', initials: 'KB', role: 'Content Apprentice', type: 'apprentice', forFunction: 'marketing', rating: 4.1, color: '#06B6D4', tags: ['Blog', 'Newsletter'], hourlyRate: '$30/hr' },
  { id: 'm2', name: 'David Okonkwo', initials: 'DO', role: 'Fractional COO', type: 'exec', forFunction: 'operations', rating: 4.8, color: '#10B981', tags: ['Hardware', 'Supply chain'], hourlyRate: '$175/hr' },
  { id: 'm22', name: 'Leo Park', initials: 'LP', role: 'Ops Apprentice', type: 'apprentice', forFunction: 'operations', rating: 4.2, color: '#3B82F6', tags: ['QA', 'Scheduling'], hourlyRate: '$30/hr' },
  { id: 'm3', name: 'Nina Petrov', initials: 'NP', role: 'Fractional CFO', type: 'exec', forFunction: 'finance', rating: 4.7, color: '#F97316', tags: ['Series A', 'Runway'], hourlyRate: '$200/hr' },
  { id: 'm23', name: 'Raj Mehta', initials: 'RM', role: 'Fractional CFO', type: 'exec', forFunction: 'finance', rating: 4.5, color: '#6366F1', tags: ['SaaS metrics', 'Fundraising'], hourlyRate: '$180/hr' },
  { id: 'm8', name: 'Chloe Martin', initials: 'CM', role: 'Finance Apprentice', type: 'apprentice', forFunction: 'finance', rating: 4.2, color: '#EC4899', tags: ['Bookkeeping', 'Xero'], hourlyRate: '$35/hr' },
  { id: 'm4', name: "Amy O'Brien", initials: 'AO', role: 'People Lead', type: 'exec', forFunction: 'hr', rating: 4.4, color: '#14B8A6', tags: ['Remote teams', 'Culture'], hourlyRate: '$130/hr' },
  { id: 'm25', name: 'Lucy Wang', initials: 'LW', role: 'People Ops', type: 'exec', forFunction: 'hr', rating: 4.3, color: '#8B5CF6', tags: ['Payroll', 'Compliance'], hourlyRate: '$110/hr' },
  { id: 'm24', name: 'Ben Torres', initials: 'BT', role: 'HR Apprentice', type: 'apprentice', forFunction: 'hr', rating: 4.0, color: '#F59E0B', tags: ['Recruiting', 'Onboarding'], hourlyRate: '$28/hr' },
  { id: 'm5', name: 'James Liu', initials: 'JL', role: 'Legal Counsel', type: 'exec', forFunction: 'legal', rating: 4.5, color: '#3B82F6', tags: ['IP', 'Contracts'], hourlyRate: '$200/hr' },
  { id: 'm27', name: 'Patrick Nwosu', initials: 'PN', role: 'Compliance Advisor', type: 'exec', forFunction: 'legal', rating: 4.4, color: '#10B981', tags: ['GDPR', 'RegTech'], hourlyRate: '$160/hr' },
  { id: 'm26', name: 'Olivia Dunn', initials: 'OD', role: 'Legal Apprentice', type: 'apprentice', forFunction: 'legal', rating: 4.1, color: '#F472B6', tags: ['Admin', 'Filing'], hourlyRate: '$25/hr' },
  { id: 'm30', name: 'Nadia Solovyova', initials: 'NS', role: 'Fractional CRO', type: 'exec', forFunction: 'sales', rating: 4.8, color: '#6366F1', tags: ['Enterprise', 'Partnerships'], hourlyRate: '$175/hr' },
  { id: 'm9', name: 'Sam Patel', initials: 'SP', role: 'Sales Apprentice', type: 'apprentice', forFunction: 'sales', rating: 4.1, color: '#06B6D4', tags: ['Outbound', 'CRM'], hourlyRate: '$30/hr' },
  { id: 'm29', name: 'Theo Adams', initials: 'TA', role: 'Fractional CPO', type: 'exec', forFunction: 'product', rating: 4.7, color: '#F97316', tags: ['Roadmapping', 'PLG'], hourlyRate: '$190/hr' },
  { id: 'm28', name: 'Grace Kim', initials: 'GK', role: 'Product Apprentice', type: 'apprentice', forFunction: 'product', rating: 4.3, color: '#EC4899', tags: ['UX Research', 'Figma'], hourlyRate: '$35/hr' },
]

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
