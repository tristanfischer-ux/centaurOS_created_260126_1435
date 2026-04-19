/**
 * Money → event_log write gate.
 *
 * Red-team #5 fix (MONEY-SCHEMA §3): not every investor_pipeline_events row
 * deserves a Today-queue slot. Without a gate, a founder rapidly dragging 50
 * investor cards across kanban columns would produce 50 event_log rows × 50
 * realtime broadcasts × 50 Today re-renders — client CPU burn + UI flashing.
 *
 * This helper returns true only when the event is "attention-worthy" per
 * SHARED-SCHEMA §5.1. The server action that creates an
 * investor_pipeline_events row (in src/actions/money-raise.ts — Chunk 4)
 * should call this helper and only emit an event_log row if it returns true.
 *
 * Other Money signals (runway_danger, variance_alert, round_close_approaching,
 * etc.) have their own emit paths in their respective server actions and do
 * not route through this helper. This helper is specifically for the noisy
 * pipeline-events path.
 */

export type PipelineEventLite = {
  event_type:
    | 'stage_move'
    | 'touch_logged'
    | 'pass'
    | 'reopen'
    | 'note_added'
    | 'doc_shared'
    | 'view_recorded'
    | 'news_logged'
  from_stage: string | null
  to_stage: string | null
}

export type PipelineStateLite = {
  stage_entered_at: Date | string | null
}

const FIVE_MINUTES_MS = 5 * 60 * 1000

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Returns true if the event deserves a Today-queue (event_log) row.
 *
 * Rules:
 * - stage_move to 'verbal' or 'closed' → ALWAYS worthy (key raise milestones).
 * - stage_move where from_stage === to_stage → reorder-only, skip.
 * - stage_move where prior stage_entered_at < 5 min ago → debounced (recent
 *   edit on same card), skip to avoid kanban-thrash storms.
 * - stage_move otherwise → worthy.
 * - pass → ALWAYS worthy (founder needs to see passes in the queue).
 * - touch_logged → NEVER worthy via this path. Touches resolve
 *   `touch_overdue` event_log rows (via a separate resolver) rather than
 *   producing new rows.
 * - note_added / doc_shared / view_recorded / news_logged → audit_log only.
 */
export function isPipelineEventAttentionWorthy(
  event: PipelineEventLite,
  priorState: PipelineStateLite | null,
): boolean {
  if (event.event_type === 'pass') return true

  if (event.event_type === 'stage_move') {
    if (event.from_stage && event.from_stage === event.to_stage) return false
    if (event.to_stage === 'verbal' || event.to_stage === 'closed') return true
    const entered = toDate(priorState?.stage_entered_at ?? null)
    if (entered && Date.now() - entered.getTime() < FIVE_MINUTES_MS) return false
    return true
  }

  // touch_logged / note_added / doc_shared / view_recorded / news_logged
  return false
}
