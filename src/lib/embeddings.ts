/**
 * @file embeddings.ts
 *
 * @description Generate embeddings using OpenAI text-embedding-3-small (1536-dim).
 * Used for semantic search queries against ForgeOS vector indexes (marketplace_listings,
 * suppliers). Server-side only — requires OPENAI_API_KEY in environment.
 */

import OpenAI from 'openai'

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
 * Embeds a query string into a 1536-dimension vector using OpenAI text-embedding-3-small.
 *
 * @param text The text to embed (search query or document)
 * @returns 1536-dimension float array
 * @throws Error if OpenAI API call fails or OPENAI_API_KEY is missing
 */
export async function embedQuery(text: string): Promise<number[]> {
  const openai = getOpenAI()
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return response.data[0].embedding
}
