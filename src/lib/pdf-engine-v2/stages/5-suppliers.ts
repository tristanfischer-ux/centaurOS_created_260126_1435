import type { Part, SupplierMatch, StageResult } from '../types'
import {
  semanticSupplierSearch,
  isLocalCorpusAvailable,
  type LocalSupplier,
} from '../lib/local-corpus'
import {
  getPartSnippetFromSupplier,
  partKeywords,
  isPageChunksAvailable,
} from '../lib/page-chunks'
import {
  classifyDomain,
  productClassToDomainTags,
  tagIntersectionBoost,
  type DomainTag,
} from '../lib/domain-tags'

const DELAY_MS = 500
const BATCH_SIZE = 5

// Helper to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Stage 5: Suppliers
 *
 * C2 FIX (2026-05-06): primary supplier lookup is now the local Nightshift
 * corpus (13,771 UK/EU suppliers with OpenAI 1536-dim embeddings + structured
 * process capabilities). Brave Search retained as fallback for parts that
 * don't get a strong semantic hit locally. When the local DB isn't present
 * (Vercel, CI, other Macs), we transparently fall back to Brave for all parts.
 */
export async function runSuppliers(
  parts: Part[],
  options?: { domain?: string; productClass?: string }
): Promise<StageResult<SupplierMatch[]>> {
  const start = Date.now()

  // D3 (2026-05-06): compute required domain tags once per run so every
  // semantic-hit supplier can be boosted / demoted by tag intersection.
  const requiredTags = productClassToDomainTags(options?.productClass || options?.domain)
  if (requiredTags.length > 0) {
    console.log(`[suppliers] Required domain tags: ${requiredTags.join(', ')}`)
  }

  try {
    const matches: SupplierMatch[] = []
    const useLocal = isLocalCorpusAvailable()

    if (useLocal) {
      // 1. Batch-embed every part description in ONE OpenAI call.
      // ~60 parts × 1 call = ~2-3 seconds total instead of 60 × 1s sequential.
      const partDescriptions = parts.map(p =>
        [p.name, p.material, p.process, options?.domain].filter(Boolean).join(' — '),
      )
      let embeddings: number[][] | null = null
      try {
        embeddings = await embedBatch(partDescriptions)
      } catch (err) {
        console.warn('[suppliers] batch embed failed, falling back to Brave for all parts:', (err as Error).message)
      }

      if (embeddings && embeddings.length === parts.length) {
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i]
          const localHits = semanticSupplierSearch(embeddings[i], 8, 0.25)
          if (localHits && localHits.length > 0) {
            // D3: re-rank by tag intersection with the required product tags.
            // Semantic similarity remains primary; tags break ties and demote
            // obviously-wrong matches (aerospace shop hitting a BESS query).
            const reranked = localHits
              .map(h => ({
                hit: h,
                tags: classifyDomain(h.description),
              }))
              .map(({ hit, tags }) => ({
                hit,
                tags,
                adjusted: hit.similarity * tagIntersectionBoost(tags, requiredTags),
              }))
              .sort((a, b) => b.adjusted - a.adjusted)
              .slice(0, 5)
            matches.push(toSupplierMatch(part, reranked.map(r => r.hit), reranked.map(r => r.tags)))
          } else {
            try {
              matches.push(await findSuppliersForPartViaBrave(part))
            } catch {
              matches.push({ partId: part.id || '', partName: part.name, suppliers: [] })
            }
          }
        }
        console.log(`[suppliers] local corpus: ${matches.filter(m => m.suppliers.length > 0).length}/${parts.length} parts got >=1 supplier`)
        return { ok: true, data: matches, durationMs: Date.now() - start }
      }
    }

    // Fall-through: no local corpus, use Brave (batched for rate limiting).
    for (let i = 0; i < parts.length; i += BATCH_SIZE) {
      const batch = parts.slice(i, i + BATCH_SIZE)
      const batchResults = await Promise.all(batch.map(async (part) => {
        try { return await findSuppliersForPartViaBrave(part) }
        catch (err) {
          console.error(`Failed to find suppliers for part ${part.name}:`, err)
          return { partId: part.id || '', partName: part.name, suppliers: [] }
        }
      }))
      matches.push(...batchResults)
      if (i + BATCH_SIZE < parts.length) await delay(DELAY_MS)
    }

    return { ok: true, data: matches, durationMs: Date.now() - start }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error during supplier matching',
      durationMs: Date.now() - start,
    }
  }
}

/**
 * Batch-embed an array of strings via OpenAI text-embedding-3-small (1536 dims).
 * Single HTTP call — OpenAI supports arrays in the `input` field.
 */
async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: texts,
      dimensions: 1536,
    }),
  })
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return (data.data as Array<{ embedding: number[] }>)
    .map(d => d.embedding)
}

function toSupplierMatch(
  part: Part,
  hits: LocalSupplier[],
  tagsByHit?: DomainTag[][],
): SupplierMatch {
  // E4 (2026-05-06): attempt a datasheet-backed snippet from page_chunks
  // for the top supplier only (keeps corpus reads cheap — 1 per part × 200
  // row lookup × ~60 parts = ~12k rows total per run).
  const snippetEnabled = isPageChunksAvailable()
  const keywords = partKeywords(part)

  return {
    partId: part.id || '',
    partName: part.name,
    suppliers: hits.map((h, idx) => {
      const snippet = (snippetEnabled && idx === 0 && h.companyId)
        ? getPartSnippetFromSupplier(h.companyId, keywords)
        : null
      return {
        name: h.name,
        url: h.website || '',
        reason: buildReason(h),
        score: h.similarity,
        country: h.country || undefined,
        certifications: h.certifications,
        processes: h.processCapabilities.map(p => p.processName).filter(Boolean),
        companyId: h.companyId,
        // D3 (2026-05-06): attach computed tags so future audit / debug
        // passes can show which tags drove the re-rank.
        domainTags: tagsByHit?.[idx] ?? [],
        datasheetSnippet: snippet
          ? {
              text: snippet.text,
              sourceUrl: snippet.sourceUrl,
              relevance: snippet.relevance,
            }
          : undefined,
      }
    }) as SupplierMatch['suppliers'],
  }
}

function buildReason(h: LocalSupplier): string {
  const bits: string[] = []
  if (h.description) bits.push(h.description.slice(0, 200))
  if (h.processCapabilities.length > 0) {
    const procs = h.processCapabilities.slice(0, 3).map(p => p.processName).filter(Boolean).join(', ')
    if (procs) bits.push(`Processes: ${procs}`)
  }
  if (h.certifications.length > 0) {
    bits.push(`Certs: ${h.certifications.slice(0, 3).join(', ')}`)
  }
  if (h.city || h.country) {
    bits.push(`Location: ${[h.city, h.country].filter(Boolean).join(', ')}`)
  }
  return bits.join(' · ').slice(0, 400) || 'Matched local supplier corpus.'
}

async function findSuppliersForPartViaBrave(part: Part): Promise<SupplierMatch> {
  const queryParts = [`"${part.name}"`]
  if (part.material) {
    queryParts.push(`"${part.material}"`)
  }
  queryParts.push('supplier buy quote')
  const query = queryParts.join(' ')

  const controller = new AbortController()
  const fetchPromise = fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
    {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': process.env.BRAVE_API_KEY || '',
      },
      signal: controller.signal
    }
  )

  let timeoutId: ReturnType<typeof setTimeout>
  const timeoutPromise = new Promise<Response>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new Error('Brave Search request timed out'))
    }, 15000)
  })

  let response: Response
  try {
    response = await Promise.race([fetchPromise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId!)
  }

  if (!response.ok) {
    throw new Error(`Brave Search API failed: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  const results = data.web?.results || []

  const suppliers: SupplierMatch['suppliers'] = []

  for (const result of results) {
    if (suppliers.length >= 3) break

    const title = (result.title || '').toLowerCase()
    const desc = (result.description || '').toLowerCase()
    const url = (result.url || '').toLowerCase()
    const name = result.profile?.name || result.title || ''

    if (!name) continue

    if (
      url.includes('.edu') ||
      url.includes('.gov') ||
      url.includes('.ac.uk') ||
      url.includes('wikipedia.org') ||
      url.includes('news') ||
      url.includes('blog')
    ) {
      continue
    }

    const commercialKeywords = ['quote', 'buy', 'price', 'supplier', 'distributor', 'contact']
    let hasCommercialSignal = false
    let matchCount = 0

    for (const keyword of commercialKeywords) {
      if (title.includes(keyword) || desc.includes(keyword)) {
        hasCommercialSignal = true
        matchCount++
      }
    }

    if (!hasCommercialSignal) continue

    const score = Math.min(1, 0.5 + (matchCount * 0.1))

    suppliers.push({
      name: result.profile?.name || result.title || 'Unknown Supplier',
      url: result.url,
      reason: result.description || 'Matched commercial supplier signals.',
      score: score,
    })
  }

  return {
    partId: part.id || '',
    partName: part.name,
    suppliers,
  }
}
