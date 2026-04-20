'use server'

/**
 * @file src/actions/plan/permissions.ts
 *
 * PLAN-SCHEMA §16.3 · Access-change audit server actions.
 *
 * Two exported async functions:
 *   - `computeAccessDelta()` — pure read. Returns the per-member access
 *     delta (actions lost / gained) between legacy permissive behaviour
 *     and the Phase 3 §16.1 matrix.
 *   - `applyPhase3RoleMatrix()` — mutating. Writes
 *     `foundries.phase3_role_matrix_applied_at/_by` + a
 *     `history_entries` row with entry_type='manual'. Requires caller to
 *     be `founder` or `co_founder` in the current foundry. Also emits an
 *     audit_log row.
 *
 * Types live in ./permissions.types.ts because Next.js 'use server'
 * files can only export async functions.
 *
 * Design notes:
 *   - The delta is computed in-process (small role enum, small action
 *     list). Doing it in SQL would be clearer but the legacy behaviour
 *     ("any role can do any Plan write") is a runtime policy fact not
 *     stored in any table — cleanest to encode here.
 *   - Until applyPhase3RoleMatrix writes the timestamp, Plan treats the
 *     foundry as "permissive" — build terminal does NOT change plan_can()
 *     SQL retroactively; strict enforcement is a post-launch migration.
 *     This file only records founder consent.
 */

import { revalidatePath } from 'next/cache'

import { withAuth } from '@/lib/server-action-utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import { logAudit } from '@/actions/audit'

import type {
    AccessDeltaResult,
    AccessDeltaRow,
    ApplyPhase3Result,
    LegacyMemberRole,
    Phase3Role,
} from './permissions.types'

type Result<T> = { success: true; data: T } | { success?: false; error: string }

/**
 * Map from current 5-role enum → Phase 3 role bucket. Per PLAN-SCHEMA §16:
 *   Founder → founder · Executive → executive · Apprentice → apprentice
 *   AI_Agent → n/a (specialists are not human members)
 *   Supplier → n/a for Plan (no Plan access in Phase 3)
 */
function mapLegacyRole(role: LegacyMemberRole): Phase3Role {
    switch (role) {
        case 'Founder':
            return 'founder'
        case 'Executive':
            return 'executive'
        case 'Apprentice':
            return 'apprentice'
        case 'AI_Agent':
        case 'Supplier':
            return 'none'
        default:
            return 'none'
    }
}

/**
 * Phase 3 §16.1 action matrix — only the actions that can CHANGE between
 * legacy-permissive and Phase 3 are listed. Actions everybody keeps are
 * omitted (view workspace, view history).
 */
const PHASE3_MATRIX: Record<string, ReadonlyArray<Phase3Role>> = {
    'Create Strategic Goal': ['founder', 'co_founder', 'executive'],
    'Edit Goal': ['founder', 'co_founder', 'executive'],
    'Pin/unpin Goal': ['founder', 'co_founder', 'executive'],
    'Kill/pivot Goal': ['founder', 'co_founder'],
    'Set Goal state': ['founder', 'co_founder', 'executive'],
    'Edit disprove assumptions': ['founder', 'co_founder', 'executive'],
    'Create objective': ['founder', 'co_founder', 'executive', 'cto', 'apprentice'],
    'Create task': ['founder', 'co_founder', 'executive', 'cto', 'apprentice'],
    'Assign task to others': ['founder', 'co_founder', 'executive', 'cto'],
    'Delete task': ['founder', 'co_founder', 'executive'],
    'Invite fractional': ['founder', 'co_founder'],
    'Decide gutcheck': ['founder', 'co_founder'],
    'Start pressure-test': ['founder', 'co_founder', 'executive', 'cto'],
    'Draft report': ['founder', 'co_founder', 'executive'],
    'Send report': ['founder', 'co_founder'],
    'Add manual History entry': ['founder', 'co_founder', 'executive'],
    'Change nudge frequency': ['founder', 'co_founder'],
    'Manage permissions': ['founder', 'co_founder'],
} as const

/**
 * Legacy permissive: every action allowed for any foundry member whose
 * role is NOT 'none' (AI_Agent / Supplier are excluded from Plan entirely).
 */
function couldDoBefore(role: Phase3Role): boolean {
    return role !== 'none'
}

function canDoUnderPhase3(action: string, role: Phase3Role): boolean {
    const allowed = PHASE3_MATRIX[action]
    return allowed ? allowed.includes(role) : false
}

// ──────────────────────────────────────────────────────────────────────────
// computeAccessDelta
// ──────────────────────────────────────────────────────────────────────────

/**
 * Return the per-member access delta for the caller's current foundry.
 *
 * Read-only — safe for any active member to call. Reveals only role +
 * email of co-members (already visible via the team page). No writes.
 */
export async function computeAccessDelta(): Promise<Result<AccessDeltaResult>> {
    return withAuth(async ({ supabase, foundryId }) => {
        const { data: memberships, error: memErr } = await supabase
            .from('foundry_memberships')
            .select(
                'user_id, role, profiles!foundry_memberships_user_id_fkey(email, full_name)',
            )
            .eq('foundry_id', foundryId)
            .eq('active', true)

        if (memErr || !memberships) {
            return { error: sanitizeErrorMessage(memErr ?? 'Failed to load members') }
        }

        const actions = Object.keys(PHASE3_MATRIX)

        const rows: AccessDeltaRow[] = memberships.map((m) => {
            const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
            const phase3Role = mapLegacyRole(m.role as LegacyMemberRole)
            const before = couldDoBefore(phase3Role)
            const lost: string[] = []
            const gained: string[] = []
            for (const action of actions) {
                const after = canDoUnderPhase3(action, phase3Role)
                if (before && !after) lost.push(action)
                if (!before && after) gained.push(action)
            }
            return {
                userId: m.user_id,
                email: profile?.email ?? null,
                fullName: profile?.full_name ?? null,
                currentRole: m.role as LegacyMemberRole,
                phase3Role,
                actionsLost: lost,
                actionsGained: gained,
            }
        })

        // Stable sort: founders first, then most-lost descending.
        rows.sort((a, b) => {
            const af = a.currentRole === 'Founder' ? 0 : 1
            const bf = b.currentRole === 'Founder' ? 0 : 1
            if (af !== bf) return af - bf
            return b.actionsLost.length - a.actionsLost.length
        })

        // PHASE3: columns live in the 20260422010000 migration; until the
        // types are regenerated post-apply we cast the row shape.
        const { data: foundryRaw, error: fErr } = await supabase
            .from('foundries')
            .select('phase3_role_matrix_applied_at, phase3_role_matrix_applied_by')
            .eq('id', foundryId)
            .maybeSingle()

        if (fErr) {
            return { error: sanitizeErrorMessage(fErr) }
        }
        const foundry = foundryRaw as unknown as {
            phase3_role_matrix_applied_at: string | null
            phase3_role_matrix_applied_by: string | null
        } | null

        return {
            success: true,
            data: {
                foundryId,
                appliedAt: foundry?.phase3_role_matrix_applied_at ?? null,
                appliedBy: foundry?.phase3_role_matrix_applied_by ?? null,
                rows,
            },
        }
    })
}

// ──────────────────────────────────────────────────────────────────────────
// applyPhase3RoleMatrix
// ──────────────────────────────────────────────────────────────────────────

/**
 * Stamp the foundry as having confirmed the Phase 3 role matrix. Only
 * `founder` / `co_founder` may call (legacy mapping: Founder → founder).
 *
 * Idempotent: re-running after a successful apply returns the existing
 * timestamp without overwriting — preserves provenance.
 */
export async function applyPhase3RoleMatrix(): Promise<Result<ApplyPhase3Result>> {
    return withAuth(async ({ supabase, user, foundryId }) => {
        const { data: mem, error: memErr } = await supabase
            .from('foundry_memberships')
            .select('role')
            .eq('foundry_id', foundryId)
            .eq('user_id', user.id)
            .eq('active', true)
            .maybeSingle()

        if (memErr || !mem) {
            return { error: 'Membership lookup failed' }
        }
        const caller = mapLegacyRole(mem.role as LegacyMemberRole)
        if (caller !== 'founder' && caller !== 'co_founder') {
            return { error: 'Only founders can apply the Phase 3 role matrix' }
        }

        // Use admin client so the stamp writes regardless of whether
        // `foundries` has a permissive RLS update policy for members.
        const admin = createAdminClient()

        const { data: existingRaw, error: readErr } = await admin
            .from('foundries')
            .select('phase3_role_matrix_applied_at, phase3_role_matrix_applied_by')
            .eq('id', foundryId)
            .maybeSingle()
        if (readErr) {
            return { error: sanitizeErrorMessage(readErr) }
        }
        const existing = existingRaw as unknown as {
            phase3_role_matrix_applied_at: string | null
            phase3_role_matrix_applied_by: string | null
        } | null

        // Idempotent: if already applied, return current values.
        if (existing?.phase3_role_matrix_applied_at) {
            return {
                success: true,
                data: {
                    appliedAt: existing.phase3_role_matrix_applied_at,
                    appliedBy: existing.phase3_role_matrix_applied_by ?? '',
                    deltaSummary: [],
                },
            }
        }

        const nowIso = new Date().toISOString()

        const { error: updErr } = await admin
            .from('foundries')
            // PHASE3: columns in 20260422010000 migration; cast until types regen.
            .update({
                phase3_role_matrix_applied_at: nowIso,
                phase3_role_matrix_applied_by: user.id,
            } as never)
            .eq('id', foundryId)

        if (updErr) {
            return { error: sanitizeErrorMessage(updErr) }
        }

        // Re-compute delta summary for audit + history row so the founder
        // can see exactly what they confirmed, later, in History.
        const delta = await computeAccessDelta()
        const summary = delta.success
            ? delta.data.rows.map((r) => ({
                  userId: r.userId,
                  email: r.email,
                  actionsLostCount: r.actionsLost.length,
                  actionsGainedCount: r.actionsGained.length,
              }))
            : []

        // History entry — passive log for post-flip review (§9 manual entry).
        const { error: histErr } = await admin.from('history_entries').insert({
            foundry_id: foundryId,
            entry_type: 'manual',
            title: 'Applied Phase 3 role matrix',
            body:
                'Founder confirmed the Phase 3 permissions matrix. Role-scoped write gates now replace legacy permissive behaviour for Plan mutations (see settings.permissions summary).',
            actor_type: 'founder',
            actor_id: user.id,
            goal_id: null,
            related_ids_json: null,
            outcome: null,
            outcome_note: null,
            grounding_text: JSON.stringify({ delta: summary }).slice(0, 5000),
            alternatives_json: null,
            edit_log_json: [],
        })
        if (histErr) {
            console.warn('[plan/permissions] history insert failed:', histErr.message)
        }

        await logAudit({
            action: 'settings.updated',
            entityType: 'plan_settings',
            entityId: foundryId,
            userId: user.id,
            foundryId,
            metadata: {
                kind: 'phase3_role_matrix_applied',
                applied_at: nowIso,
                delta_summary: summary,
            },
        })

        revalidatePath('/plan/settings')

        return {
            success: true,
            data: {
                appliedAt: nowIso,
                appliedBy: user.id,
                deltaSummary: summary,
            },
        }
    })
}
