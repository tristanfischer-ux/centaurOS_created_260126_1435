import type { Part, SupplierMatch, StageResult } from '../types'

const DELAY_MS = 500
const BATCH_SIZE = 5

// Helper to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Stage 5: Suppliers
 * Runs supplier matching for all parts using Brave Search API.
 */
export async function runSuppliers(
  parts: Part[],
  options?: { domain?: string }
): Promise<StageResult<SupplierMatch[]>> {
  const start = Date.now()
  
  try {
    const matches: SupplierMatch[] = []
    
    // Process parts in batches to avoid rate limiting
    for (let i = 0; i < parts.length; i += BATCH_SIZE) {
      const batch = parts.slice(i, i + BATCH_SIZE)
      
      const batchPromises = batch.map(async (part) => {
        try {
          return await findSuppliersForPart(part)
        } catch (error) {
          console.error(`Failed to find suppliers for part ${part.name}:`, error)
          // Don't fail the whole stage for one part
          return {
            partId: part.id || '',
            partName: part.name,
            suppliers: []
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      matches.push(...batchResults)

      if (i + BATCH_SIZE < parts.length) {
        await delay(DELAY_MS)
      }
    }

    return {
      ok: true,
      data: matches,
      durationMs: Date.now() - start
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error during supplier matching',
      durationMs: Date.now() - start
    }
  }
}

async function findSuppliersForPart(part: Part): Promise<SupplierMatch> {
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

    // Reject non-commercial and dead domains
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

    // Commercial signals
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

    // Calculate score (0 to 1) based on signal strength
    const score = Math.min(1, 0.5 + (matchCount * 0.1))

    suppliers.push({
      name: result.profile?.name || result.title || 'Unknown Supplier',
      url: result.url,
      reason: result.description || 'Matched commercial supplier signals.',
      score: score
    })
  }

  return {
    partId: part.id || '',
    partName: part.name,
    suppliers
  }
}
