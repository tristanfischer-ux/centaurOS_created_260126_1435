/**
 * @file backfill-memory-embeddings.ts — One-time backfill for specialist memory embeddings.
 *
 * @description Fetches all agent_memory_observations and specialist_decision_journal
 * rows where embedding IS NULL, generates embeddings via OpenAI text-embedding-3-small,
 * and writes them back. This enables semantic memory recall across all threads.
 *
 * @security Uses admin client to bypass RLS for bulk update.
 * @related supabase/migrations/20260407200000_specialist_memory_embeddings.sql
 */

"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { embedText } from "@/lib/search/semantic-search"

interface BackfillResult {
  observations: { total: number; succeeded: number; failed: number; errors: string[] }
  decisions: { total: number; succeeded: number; failed: number; errors: string[] }
}

/**
 * Backfills embeddings for all observations and decisions that have embedding IS NULL.
 *
 * @returns Summary of how many rows were processed, succeeded, and failed
 */
export async function backfillMemoryEmbeddings(): Promise<BackfillResult> {
  // SECURITY: Auth gate
  const { createClient } = await import("@/lib/supabase/server")
  const userSupabase = await createClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const supabase = createAdminClient()
  const BATCH_SIZE = 10

  // ── Observations ───────────────────────────────────────────

  const obsResult = { total: 0, succeeded: 0, failed: 0, errors: [] as string[] }

  const { data: observations, error: obsError } = await supabase
    .from("agent_memory_observations")
    .select("id, observations_text")
    .is("embedding", null)

  if (obsError) {
    throw new Error(`Failed to fetch observations: ${obsError.message}`)
  }

  if (observations && observations.length > 0) {
    obsResult.total = observations.length

    for (let i = 0; i < observations.length; i += BATCH_SIZE) {
      const batch = observations.slice(i, i + BATCH_SIZE)

      const promises = batch.map(async (obs) => {
        try {
          const embedding = await embedText(obs.observations_text)
          if (!embedding) {
            obsResult.failed++
            obsResult.errors.push(`${obs.id}: embedText returned null`)
            return
          }

          const { error: updateError } = await supabase
            .from("agent_memory_observations")
            .update({ embedding: JSON.stringify(embedding) })
            .eq("id", obs.id)

          if (updateError) {
            obsResult.failed++
            obsResult.errors.push(`${obs.id}: ${updateError.message}`)
          } else {
            obsResult.succeeded++
          }
        } catch (err) {
          obsResult.failed++
          obsResult.errors.push(
            `${obs.id}: ${err instanceof Error ? err.message : "Unknown error"}`
          )
        }
      })

      await Promise.all(promises)
    }
  }

  // ── Decisions ──────────────────────────────────────────────

  const decResult = { total: 0, succeeded: 0, failed: 0, errors: [] as string[] }

  const { data: decisions, error: decError } = await supabase
    .from("specialist_decision_journal")
    .select("id, decision, context")
    .is("embedding", null)

  if (decError) {
    throw new Error(`Failed to fetch decisions: ${decError.message}`)
  }

  if (decisions && decisions.length > 0) {
    decResult.total = decisions.length

    for (let i = 0; i < decisions.length; i += BATCH_SIZE) {
      const batch = decisions.slice(i, i + BATCH_SIZE)

      const promises = batch.map(async (dec) => {
        try {
          const textToEmbed = dec.context
            ? `Decision: ${dec.decision}. Context: ${dec.context}`
            : `Decision: ${dec.decision}`
          const embedding = await embedText(textToEmbed)
          if (!embedding) {
            decResult.failed++
            decResult.errors.push(`${dec.id}: embedText returned null`)
            return
          }

          const { error: updateError } = await supabase
            .from("specialist_decision_journal")
            .update({ embedding: JSON.stringify(embedding) })
            .eq("id", dec.id)

          if (updateError) {
            decResult.failed++
            decResult.errors.push(`${dec.id}: ${updateError.message}`)
          } else {
            decResult.succeeded++
          }
        } catch (err) {
          decResult.failed++
          decResult.errors.push(
            `${dec.id}: ${err instanceof Error ? err.message : "Unknown error"}`
          )
        }
      })

      await Promise.all(promises)
    }
  }

  console.log(
    `[BackfillMemoryEmbeddings] Observations: ${obsResult.succeeded}/${obsResult.total} succeeded, ${obsResult.failed} failed. ` +
    `Decisions: ${decResult.succeeded}/${decResult.total} succeeded, ${decResult.failed} failed.`
  )

  return { observations: obsResult, decisions: decResult }
}
