/**
 * @file nomic-embed.ts
 *
 * @description Client for the Nomic Atlas embeddings API, using
 * `nomic-embed-text-v1.5` (768 dimensions). This is the SAME model the Forge
 * Capital pipeline uses locally via Ollama — keeping both sides on the same
 * model is what lets us sync embeddings from SQLite → Supabase without
 * re-embedding and get identical similarity rankings on both UIs.
 *
 * @security Requires NOMIC_API_KEY in server env. Never exposed to the client.
 */

const NOMIC_API_URL = 'https://api-atlas.nomic.ai/v1/embedding/text'
const NOMIC_MODEL = 'nomic-embed-text-v1.5'
export const NOMIC_EMBED_DIMS = 768

/**
 * Nomic task types control which prefix/head the model applies. Must match
 * the type used at document-embed time, otherwise similarity scores degrade.
 * Forge Capital's pipeline uses `search_document` for investor rows, so the
 * query side must use `search_query`.
 */
export type NomicTaskType = 'search_document' | 'search_query' | 'clustering' | 'classification'

interface NomicEmbedResponse {
  embeddings: number[][]
  usage?: { prompt_tokens: number; total_tokens: number }
  model?: string
  inference_mode?: string
}

/**
 * Embed one or more texts with nomic-embed-text-v1.5. Returns a 768-dim
 * float vector per input text.
 *
 * @throws when NOMIC_API_KEY is missing, the API errors, or the response
 * dimensions do not match the expected 768.
 */
export async function nomicEmbed(
  texts: string[],
  taskType: NomicTaskType = 'search_query',
): Promise<number[][]> {
  const apiKey = process.env.NOMIC_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('NOMIC_API_KEY is not set. Get one at atlas.nomic.ai and add it to env.')
  }

  if (!texts.length) return []

  const res = await fetch(NOMIC_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: NOMIC_MODEL,
      texts,
      task_type: taskType,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Nomic API error ${res.status}: ${detail.slice(0, 500)}`)
  }

  const data = (await res.json()) as NomicEmbedResponse
  if (!Array.isArray(data.embeddings) || data.embeddings.length !== texts.length) {
    throw new Error(`Nomic API returned ${data.embeddings?.length ?? 0} embeddings for ${texts.length} inputs`)
  }

  for (const emb of data.embeddings) {
    if (!Array.isArray(emb) || emb.length !== NOMIC_EMBED_DIMS) {
      throw new Error(`Nomic API returned ${emb?.length ?? 0}-dim embedding, expected ${NOMIC_EMBED_DIMS}`)
    }
  }

  return data.embeddings
}

/**
 * Convenience wrapper: embed a single search query as a 768-dim vector.
 * Uses the `search_query` task type to match the `search_document` type
 * used at investor-row embed time in the Forge Capital pipeline.
 */
export async function nomicEmbedQuery(query: string): Promise<number[]> {
  const [embedding] = await nomicEmbed([query], 'search_query')
  return embedding
}
