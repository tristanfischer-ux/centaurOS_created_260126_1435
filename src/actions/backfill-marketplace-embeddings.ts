/**
 * @file backfill-marketplace-embeddings.ts — One-time backfill for marketplace listing embeddings.
 *
 * @description Fetches all marketplace_listings where embedding IS NULL,
 * generates an embedding via OpenAI text-embedding-3-small, and writes it back.
 * This enables the semantic factor (40pts) in the 5-factor supplier matching
 * system — without embeddings, all suppliers get 0/40 on semantic and score identically.
 *
 * @security Uses admin client to bypass RLS for bulk update.
 */

"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { embedText } from "@/lib/search/semantic-search"

interface BackfillResult {
  total: number
  succeeded: number
  failed: number
  errors: string[]
}

/**
 * Backfills embeddings for all marketplace listings that have embedding IS NULL.
 *
 * @returns Summary of how many listings were processed, succeeded, and failed
 */
export async function backfillMarketplaceEmbeddings(): Promise<BackfillResult> {
  const supabase = createAdminClient()

  // Fetch all listings missing embeddings
  const { data: listings, error } = await supabase
    .from("marketplace_listings")
    .select("id, title, description, subcategory, category")
    .is("embedding", null)

  if (error) {
    throw new Error(`Failed to fetch listings: ${error.message}`)
  }

  if (!listings || listings.length === 0) {
    return { total: 0, succeeded: 0, failed: 0, errors: [] }
  }

  const result: BackfillResult = {
    total: listings.length,
    succeeded: 0,
    failed: 0,
    errors: [],
  }

  // Process in batches of 10 to avoid rate limits
  const BATCH_SIZE = 10
  for (let i = 0; i < listings.length; i += BATCH_SIZE) {
    const batch = listings.slice(i, i + BATCH_SIZE)

    const promises = batch.map(async (listing) => {
      const embeddingText = [
        listing.title,
        listing.description,
        listing.subcategory,
        listing.category,
      ]
        .filter(Boolean)
        .join(" ")

      try {
        const embedding = await embedText(embeddingText)
        if (!embedding) {
          result.failed++
          result.errors.push(`${listing.id}: embedText returned null`)
          return
        }

        const { error: updateError } = await supabase
          .from("marketplace_listings")
          .update({ embedding: JSON.stringify(embedding) })
          .eq("id", listing.id)

        if (updateError) {
          result.failed++
          result.errors.push(`${listing.id}: ${updateError.message}`)
        } else {
          result.succeeded++
        }
      } catch (err) {
        result.failed++
        result.errors.push(
          `${listing.id}: ${err instanceof Error ? err.message : "Unknown error"}`
        )
      }
    })

    await Promise.all(promises)
  }

  console.log(
    `[BackfillEmbeddings] Done: ${result.succeeded}/${result.total} succeeded, ${result.failed} failed`
  )

  return result
}
