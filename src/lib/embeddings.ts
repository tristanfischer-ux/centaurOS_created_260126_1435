/**
 * @file embeddings.ts
 *
 * @description Generate embeddings using OpenAI text-embedding-3-small (1536-dim).
 * Used for semantic search queries against ForgeOS vector indexes (marketplace_listings,
 * suppliers). Server-side only — requires OPENAI_API_KEY in environment.
 */

import OpenAI from 'openai'
import { logLlmUsage } from '@/lib/cost-logging/llm-usage'

let _openai: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured')
  }
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _openai
}

/**
 * Optional cost-attribution metadata. All fields optional — pass what's
 * available at the call site. Foundry/user fields enable per-tenant cost
 * roll-up; action lets us see cost-per-feature in the admin dashboard.
 */
export interface EmbedQueryOptions {
  actionSlug?: string
  foundryId?: string
  userId?: string
}

/**
 * Embeds a query string into a 1536-dimension vector using OpenAI text-embedding-3-small.
 *
 * @param text The text to embed (search query or document)
 * @param options Optional cost-attribution metadata for the llm_usage log
 * @returns 1536-dimension float array
 * @throws Error if OpenAI API call fails or OPENAI_API_KEY is missing
 */
export async function embedQuery(text: string, options: EmbedQueryOptions = {}): Promise<number[]> {
  const openai = getOpenAI()
  const { actionSlug, foundryId, userId } = options
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      // Explicitly request 1536 dims — without this, production was occasionally
      // returning 768-dim vectors which caused pgvector "different vector dimensions
      // 1536 and 768" errors in match_marketplace_listings_v2 calls. See Vercel
      // logs 2026-04-24. text-embedding-3-small's NATIVE dim is 1536; the dimensions
      // param locks it deterministically and matches investors_mirror.embedding +
      // marketplace_listings.embedding columns (both vector(1536)).
      dimensions: 1536,
      input: text,
    })
    const embedding = response.data[0].embedding
    if (embedding.length !== 1536) {
      void logLlmUsage({
        action: actionSlug ?? 'embed_query_unknown',
        modelUsed: 'text-embedding-3-small',
        tokensIn: response.usage?.prompt_tokens ?? 0,
        tokensOut: 0,
        status: 'error',
        errorMessage: `Wrong dim: ${embedding.length}`,
        foundryId,
        userId,
      })
      throw new Error(`embedQuery: OpenAI returned ${embedding.length}-dim vector, expected 1536`)
    }
    void logLlmUsage({
      action: actionSlug ?? 'embed_query_unknown',
      modelUsed: 'text-embedding-3-small',
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: 0,
      status: 'success',
      foundryId,
      userId,
    })
    return embedding
  } catch (err) {
    // If the throw came from inside try (dim check), we already logged. For
    // any other thrown path (network, 401, 429), log here.
    if (err instanceof Error && !err.message.startsWith('embedQuery: OpenAI returned')) {
      const msg = err.message
      const status: 'rate_limited' | 'timeout' | 'error' =
        msg.includes('429') || msg.includes('overloaded') ? 'rate_limited' :
        msg.includes('timeout') || msg.includes('aborted') ? 'timeout' :
        'error'
      void logLlmUsage({
        action: actionSlug ?? 'embed_query_unknown',
        modelUsed: 'text-embedding-3-small',
        tokensIn: 0,
        tokensOut: 0,
        status,
        errorMessage: msg.slice(0, 200),
        foundryId,
        userId,
      })
    }
    throw err
  }
}
