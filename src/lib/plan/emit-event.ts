/**
 * @file src/lib/plan/emit-event.ts
 *
 * Plan-section event_log emitter (PLAN-SCHEMA §14.1, SHARED-SCHEMA §1.4).
 *
 * Writes an attention-worthy Plan event to `public.event_log` so Today V3
 * picks it up via Supabase Realtime (§14.5, SHARED-SCHEMA §6.3).
 *
 * Called from Plan server actions AFTER the primary mutation succeeds. Never
 * aborts the caller — if the emit fails we `console.warn` and return; the
 * user's action is already persisted.
 *
 * Rules enforced here (§14.6):
 *   - `cta_href` must be a canonical token like `plan:goal:<id>` (never a
 *     raw `/plan/...` path). Flag-aware resolution happens in the reader
 *     via `resolvePlanCtaToken`.
 *
 * Uses the admin (service_role) client because the event_log INSERT policy
 * is `auth.role() = 'service_role'` — server actions don't have that role
 * under their user JWT, so we escalate only for this narrow write.
 */
import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

export type PlanEventUrgency = 'critical' | 'high' | 'medium' | 'low'
export type PlanEventDecayRate = 'immediate' | '1d' | '3d' | '7d' | '30d'

export interface EmitPlanEventInput {
  foundryId: string
  sourceEntityType: string
  sourceEntityId: string
  urgency: PlanEventUrgency
  decayRate: PlanEventDecayRate
  title: string
  body?: string | null
  ctaLabel: string
  /**
   * Canonical token per §14.6 — e.g. `plan:goal:<id>`, `plan:task:<id>`,
   * `plan:goal:<id>?modal=pressure-test`. NEVER a raw `/plan/...` path.
   */
  ctaHref: string
  assignedTo?: string | null
  expiresAt?: string | null
}

/**
 * Emit one Plan attention-worthy event. Silently warns on failure so the
 * calling server action's primary mutation stays committed.
 */
export async function emitPlanEvent(input: EmitPlanEventInput): Promise<void> {
  if (!input.ctaHref.startsWith('plan:')) {
    console.warn('[plan/emit-event] refusing non-canonical cta_href:', input.ctaHref)
    return
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin.from('event_log').insert({
      foundry_id: input.foundryId,
      section: 'plan',
      source_entity_type: input.sourceEntityType,
      source_entity_id: input.sourceEntityId,
      urgency: input.urgency,
      decay_rate: input.decayRate,
      title: input.title,
      body: input.body ?? null,
      cta_label: input.ctaLabel,
      cta_href: input.ctaHref,
      assigned_to: input.assignedTo ?? null,
      expires_at: input.expiresAt ?? null,
    })
    if (error) {
      console.warn('[plan/emit-event] insert failed:', error.message, {
        source_entity_type: input.sourceEntityType,
        source_entity_id: input.sourceEntityId,
      })
    }
  } catch (err) {
    console.warn(
      '[plan/emit-event] unexpected error:',
      err instanceof Error ? err.message : String(err),
      {
        source_entity_type: input.sourceEntityType,
        source_entity_id: input.sourceEntityId,
      },
    )
  }
}

/**
 * Mark any unresolved Plan event_log rows for a `(source_entity_type,
 * source_entity_id)` pair as resolved. Implements §14.4 auto-resolution:
 *   - Goal at_risk → on_track auto-resolves prior at_risk rows
 *   - Task → done resolves overdue/pin rows
 *   - Gutcheck decision resolves the originating gutcheck row
 *   - Goal killed resolves at_risk/off_track rows
 *
 * Admin client — same reason as emit.
 */
export async function resolvePlanEvents(params: {
  foundryId: string
  sourceEntityType: string
  sourceEntityId: string
}): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('event_log')
      .update({ resolved_at: new Date().toISOString() })
      .eq('foundry_id', params.foundryId)
      .eq('section', 'plan')
      .eq('source_entity_type', params.sourceEntityType)
      .eq('source_entity_id', params.sourceEntityId)
      .is('resolved_at', null)
    if (error) {
      console.warn('[plan/emit-event] resolve failed:', error.message, params)
    }
  } catch (err) {
    console.warn(
      '[plan/emit-event] resolve unexpected error:',
      err instanceof Error ? err.message : String(err),
      params,
    )
  }
}
