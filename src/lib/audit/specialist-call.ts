/**
 * Specialist-call audit writer.
 *
 * Single insertion point for the `specialist_call` audit_log row that the
 * Money `ai_credits_ledger` trigger (migration 20260422001200) keys off.
 *
 * Wire `recordSpecialistCall` immediately after every LLM completion in a
 * specialist-attributed code path (Forge / Products / Plan / Money). The
 * Postgres AFTER INSERT trigger on audit_log will:
 *   1. Detect entity_type='specialist_call'
 *   2. Look up pricing in ai_credits_cost_rules (foundry override → global)
 *   3. INSERT the matching row into ai_credits_ledger
 *
 * This means: no application-layer pricing math, no race between application
 * write + ledger write, and the founder Credits pill stays accurate even if
 * a downstream codepath forgets to invoke any helper Money owns.
 *
 * Dual-write contract per migration 20260419100200_audit_log_shared_schema_columns.sql:
 *   - `action` = 'specialist_call' (legacy readers)
 *   - `event` = 'specialist_call' (SHARED §1.3 readers)
 *   - `metadata` = same jsonb as `payload` (legacy readers)
 *   - `payload` = canonical jsonb (SHARED §1.3 readers, ai_credits trigger reads from here)
 *   - `user_id` = `actor_user_id` (DB column user_id is NOT NULL)
 *
 * Failure mode: writes go through the service-role admin client and bypass
 * RLS. We log + swallow errors here so a Supabase outage cannot brick the
 * specialist invocation that the user is waiting on. The ledger row is a
 * cost-tracking artefact, not a correctness gate. (Hard cost-cap enforcement
 * happens BEFORE the LLM call via `checkCreditsBudget`, not after.)
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type SpecialistSection = 'forge' | 'products' | 'plan' | 'money' | 'meta'

export interface RecordSpecialistCallInput {
  /** Foundry the invocation belongs to. Required — unattributed calls are dropped silently. */
  foundryId: string | null | undefined
  /** Specialist canonical id ('cal' / 'sage' / 'finn' / etc). */
  specialistId: string
  /** Which route group originated the call. */
  section: SpecialistSection
  /** Model id matching `ai_credits_cost_rules.model_id` (sonnet / haiku / opus / deepseek-v4 / etc). */
  model: string
  /** Anthropic / OpenAI usage.input_tokens (or equivalent). */
  inputTokens: number
  /** Anthropic / OpenAI usage.output_tokens (or equivalent). */
  outputTokens: number
  /** Wall-clock duration of the LLM call. Optional. */
  durationMs?: number | null
  /** End user who initiated the call. Required for the audit_log NOT NULL user_id column. */
  invokedByUserId: string | null | undefined
  /** Optional trace id for cross-service debugging. */
  invocationId?: string | null
  /** Optional entity that the call acted on (e.g. project id, module id). Recorded as `entity_id` for debugging. */
  entityId?: string | null
}

/**
 * Insert one `specialist_call` row into `audit_log`. Triggers the ai_credits_ledger
 * insert via the Postgres AFTER INSERT trigger. Returns the inserted row id, or null
 * on failure. Never throws.
 */
export async function recordSpecialistCall(
  input: RecordSpecialistCallInput,
): Promise<string | null> {
  // Drop silently if we don't know which foundry to bill. Trigger filters the
  // same way (NULL foundry_id → return without writing ledger), but we save
  // the round-trip.
  if (!input.foundryId) {
    return null
  }

  // user_id on audit_log is NOT NULL. If we can't attribute to a real user we
  // can't write the row. Return null and skip — the ledger trigger keys off
  // audit_log so no row → no ledger row.
  if (!input.invokedByUserId) {
    return null
  }

  const payload = {
    model: input.model,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    duration_ms: input.durationMs ?? null,
    specialist_id: input.specialistId,
    invocation_id: input.invocationId ?? null,
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('audit_log')
      .insert({
        foundry_id: input.foundryId,
        user_id: input.invokedByUserId,
        actor_user_id: input.invokedByUserId,
        actor_specialist: input.specialistId,
        action: 'specialist_call',
        event: 'specialist_call',
        entity_type: 'specialist_call',
        entity_id: input.entityId ?? null,
        section: input.section,
        // Dual-write: the ai_credits trigger reads payload first, then falls
        // back to metadata. Writing both keeps legacy readers + new readers
        // happy without forcing a follow-up backfill PR.
        payload,
        metadata: payload,
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error(
        `[recordSpecialistCall] insert failed for ${input.specialistId}/${input.model}:`,
        error?.message ?? 'no row returned',
      )
      return null
    }
    return data.id
  } catch (err) {
    console.error(
      `[recordSpecialistCall] unexpected error for ${input.specialistId}/${input.model}:`,
      err instanceof Error ? err.message : err,
    )
    return null
  }
}
