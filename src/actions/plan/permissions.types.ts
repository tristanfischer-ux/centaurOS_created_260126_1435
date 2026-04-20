/**
 * @file src/actions/plan/permissions.types.ts
 *
 * Pure-types module for Plan permissions server actions.
 * See src/actions/plan/permissions.ts for the matching server actions.
 *
 * Exists because Next.js `'use server'` files may only export async
 * functions (project gotcha — saladx lesson). Types live here instead.
 */

import type { Database } from '@/types/database.types'

export type LegacyMemberRole = Database['public']['Enums']['member_role']

/**
 * Phase 3 target roles — see PLAN-SCHEMA §16.
 */
export type Phase3Role =
    | 'founder'
    | 'co_founder'
    | 'executive'
    | 'cto'
    | 'advisor'
    | 'contractor'
    | 'read_only_observer'
    | 'fractional_exec'
    | 'apprentice'
    | 'none'

export interface AccessDeltaRow {
    userId: string
    email: string | null
    fullName: string | null
    currentRole: LegacyMemberRole
    phase3Role: Phase3Role
    actionsLost: string[]
    actionsGained: string[]
}

export interface ApplyPhase3Result {
    appliedAt: string
    appliedBy: string
    deltaSummary: Array<{
        userId: string
        email: string | null
        actionsLostCount: number
        actionsGainedCount: number
    }>
}

export interface AccessDeltaResult {
    foundryId: string
    appliedAt: string | null
    appliedBy: string | null
    rows: AccessDeltaRow[]
}
