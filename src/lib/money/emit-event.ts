/**
 * Money → SHARED event_log writer.
 *
 * Wraps inserts into `public.event_log` with section='money' and defaults
 * consistent with MONEY-SCHEMA §2 event_log signal contract. Every Money
 * server action that emits a Today-queue signal calls this helper rather
 * than touching `event_log` directly.
 *
 * The shared `event_log` table is written via service_role (RLS insert
 * policy restricts non-service callers). Server actions that already run
 * under service_role context call `emitMoneyEvent` directly; actions that
 * run with the user's session client should use a service-role-scoped
 * admin client from src/lib/supabase/admin.ts.
 *
 * Triggers that the build terminal should wire per MONEY-SCHEMA §2:
 *
 *  | Trigger                          | source_entity_type       | urgency  | decay  |
 *  |-------------------------------   |-------------------------|----------|--------|
 *  | Runway < money_settings danger   | runway_danger           | critical | immediate |
 *  | Runway crosses healthy→caution   | runway_caution          | high     | 3d     |
 *  | Variance > settings alert_pct    | variance_alert          | medium   | 7d     |
 *  | Unusual expense flagged          | unusual_expense         | medium   | 3d     |
 *  | Xero sync failed > 24h           | xero_sync_failed        | high     | 1d     |
 *  | Investor touch overdue > 7d      | touch_overdue           | high     | 3d     |
 *  | Round close < 14d, target miss   | round_close_approaching | high     | 1d     |
 *  | Verbal commit                    | verbal_commit           | medium   | 7d     |
 *  | Round closed                     | round_closed            | medium   | 30d    |
 *  | Update bounce rate > 10%         | update_bounce_spike     | high     | 3d     |
 *  | Credits > 80% of cap             | credits_budget_warning  | medium   | 7d     |
 *  | Credits > 100% of cap            | credits_budget_breach   | critical | immediate |
 *
 * Resolution: setting `resolved_at` on a row closes the event. Some paths
 * resolve implicitly — e.g. logging a touch on an investor who has a
 * `touch_overdue` row open calls `resolveMoneyEventsForEntity` to close
 * them silently.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

export type MoneyEventUrgency = 'critical' | 'high' | 'medium' | 'low'
export type MoneyEventDecayRate = 'immediate' | '1d' | '3d' | '7d' | '30d'

export type MoneyEventPayload = {
  foundry_id: string
  source_entity_type: string
  source_entity_id: string
  urgency: MoneyEventUrgency
  decay_rate?: MoneyEventDecayRate
  consequence_weight?: number
  title: string
  body?: string | null
  cta_label?: string | null
  cta_href?: string | null
  assigned_to?: string | null
  expires_at?: string | null
}

type AdminClient = SupabaseClient<Database>

/**
 * Insert a Money event into SHARED event_log. Returns the inserted row's id.
 * Throws on error — caller is responsible for retry + audit.
 */
export async function emitMoneyEvent(
  admin: AdminClient,
  event: MoneyEventPayload,
): Promise<number> {
  const { data, error } = await admin
    .from('event_log')
    .insert({
      foundry_id: event.foundry_id,
      section: 'money',
      source_entity_type: event.source_entity_type,
      source_entity_id: event.source_entity_id,
      urgency: event.urgency,
      decay_rate: event.decay_rate ?? null,
      consequence_weight: event.consequence_weight ?? null,
      title: event.title,
      body: event.body ?? null,
      cta_label: event.cta_label ?? null,
      cta_href: event.cta_href ?? null,
      assigned_to: event.assigned_to ?? null,
      expires_at: event.expires_at ?? null,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(
      `emitMoneyEvent failed for ${event.source_entity_type}/${event.source_entity_id}: ${error?.message ?? 'no data'}`,
    )
  }
  return data.id
}

/**
 * Resolve all open Money event_log rows matching a (source_entity_type,
 * source_entity_id) pair for a foundry. Used when an action implicitly
 * closes an outstanding event — e.g. logging a touch on an overdue
 * investor, or completing the Xero reconnect.
 */
export async function resolveMoneyEventsForEntity(
  admin: AdminClient,
  foundryId: string,
  sourceEntityType: string,
  sourceEntityId: string,
): Promise<number> {
  const { data, error } = await admin
    .from('event_log')
    .update({ resolved_at: new Date().toISOString() })
    .eq('foundry_id', foundryId)
    .eq('section', 'money')
    .eq('source_entity_type', sourceEntityType)
    .eq('source_entity_id', sourceEntityId)
    .is('resolved_at', null)
    .select('id')

  if (error) {
    throw new Error(
      `resolveMoneyEventsForEntity failed for ${sourceEntityType}/${sourceEntityId}: ${error.message}`,
    )
  }
  return data?.length ?? 0
}
