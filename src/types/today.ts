/**
 * Today V3 data contract — types consumed by the Today V3 triage queue.
 *
 * `TodaySignal` mirrors the shape of a `public.event_log` row (see migration
 * `20260419100400_event_log.sql`) — with a narrowed `section` union and a
 * narrowed `urgency` union to make the downstream rendering exhaustive.
 *
 * Phase 1 PR #1 ships the type + an API route that reads it + a client hook
 * that subscribes to it via Supabase Realtime. PR #1.5 mounts the hook on a
 * rebuilt `/today` page. Phase 2 Products, Phase 3 Plan, and Phase 4 Money
 * each write to `event_log` with their own `section` value.
 */

import type { Database } from './database.types'

type EventLogRow = Database['public']['Tables']['event_log']['Row']

export type TodaySignalSection = 'forge' | 'products' | 'plan' | 'money' | 'meta'

export type TodaySignalUrgency = 'critical' | 'high' | 'medium' | 'low'

export type TodaySignalDecayRate = 'immediate' | '1d' | '3d' | '7d' | '30d'

export interface TodaySignal {
  id: EventLogRow['id']
  section: TodaySignalSection
  sourceEntityType: string
  sourceEntityId: string
  urgency: TodaySignalUrgency
  decayRate: TodaySignalDecayRate | null
  consequenceWeight: number | null
  title: string
  body: string | null
  ctaLabel: string | null
  ctaHref: string | null
  assignedTo: string | null
  resolvedAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

/** Client-server ordering weights. Lower = higher priority for the triage queue. */
export const DECAY_RATE_RANK: Record<TodaySignalDecayRate, number> = {
  immediate: 0,
  '1d': 1,
  '3d': 2,
  '7d': 3,
  '30d': 4,
} as const

export function compareTodaySignals(a: TodaySignal, b: TodaySignal): number {
  const aDecay = a.decayRate ? DECAY_RATE_RANK[a.decayRate] : Number.MAX_SAFE_INTEGER
  const bDecay = b.decayRate ? DECAY_RATE_RANK[b.decayRate] : Number.MAX_SAFE_INTEGER
  if (aDecay !== bDecay) return aDecay - bDecay
  const aWeight = a.consequenceWeight ?? 0
  const bWeight = b.consequenceWeight ?? 0
  if (aWeight !== bWeight) return bWeight - aWeight
  return a.createdAt < b.createdAt ? 1 : -1
}

/** Narrow an event_log row to the TodaySignal shape. */
export function toTodaySignal(row: EventLogRow): TodaySignal {
  return {
    id: row.id,
    section: row.section as TodaySignalSection,
    sourceEntityType: row.source_entity_type,
    sourceEntityId: row.source_entity_id,
    urgency: row.urgency as TodaySignalUrgency,
    decayRate: (row.decay_rate ?? null) as TodaySignalDecayRate | null,
    consequenceWeight: row.consequence_weight,
    title: row.title,
    body: row.body,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    assignedTo: row.assigned_to,
    resolvedAt: row.resolved_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
