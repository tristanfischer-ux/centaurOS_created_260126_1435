/**
 * @file live-benchmark-search.ts — L3 benchmark provider via Brave + LLM.
 *
 * When L1 + L2 have <3 anchors for a given product class, fire a small
 * Brave Search + a minimal LLM aggregation to produce 1-3 anchors on the
 * fly. Cached per-pipeline-run so the same query doesn't fire twice.
 *
 * Gated behind ENABLE_LIVE_BENCHMARK_SEARCH=true and OPENROUTER_API_KEY
 * presence. Never fires without both. Cost budget: ~£0.002 per call.
 *
 * This is the L3 infrastructure — the actual search + LLM prompts are
 * production-safe but deliberately conservative (caps on queries, tight
 * LLM max_tokens). Running real end-to-end queries is a session-budget
 * decision that callers own.
 */

import type { BenchmarkAnchor } from './benchmark-sources'

const _runCache = new Map<string, BenchmarkAnchor[]>()

/**
 * Fetch live benchmark anchors for a product class. Returns [] silently
 * if env vars aren't set or any call fails.
 *
 * @param productClass e.g. 'battery_energy_storage'
 * @param querySuffix optional narrowing keyword added to the Brave search
 *                    (e.g. 'UK 2024 grid-scale' or '30 kW R290 heat pump')
 */
export async function liveBenchmarkSearch(
  productClass: string,
  querySuffix: string = '',
): Promise<BenchmarkAnchor[]> {
  const cacheKey = `${productClass}::${querySuffix}`
  const cached = _runCache.get(cacheKey)
  if (cached) return cached

  const braveKey = process.env.BRAVE_API_KEY
  const orKey = process.env.OPENROUTER_API_KEY
  if (!braveKey || !orKey) {
    console.log('[benchmarks/L3] skipped — missing BRAVE_API_KEY or OPENROUTER_API_KEY')
    _runCache.set(cacheKey, [])
    return []
  }

  const query = [
    'cost per',
    productClass.replace(/_/g, ' '),
    'UK 2024',
    querySuffix,
  ].filter(Boolean).join(' ')

  // Brave fetch — 10 results, hardcoded 15 s timeout.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  let braveResults: any[] = []
  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
      {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': braveKey,
        },
        signal: controller.signal,
      },
    )
    clearTimeout(timeout)
    if (!res.ok) {
      console.warn(`[benchmarks/L3] Brave returned ${res.status}`)
      _runCache.set(cacheKey, [])
      return []
    }
    const data = await res.json()
    braveResults = data.web?.results || []
  } catch (err) {
    clearTimeout(timeout)
    console.warn(`[benchmarks/L3] Brave fetch failed:`, (err as Error).message)
    _runCache.set(cacheKey, [])
    return []
  }

  if (braveResults.length === 0) {
    _runCache.set(cacheKey, [])
    return []
  }

  // Build a compact prompt for the LLM to extract anchors.
  const snippets = braveResults.slice(0, 10).map((r: any) =>
    `- ${r.title}\n  ${r.description || ''}\n  ${r.url || ''}`,
  ).join('\n')

  const systemPrompt = `You extract public-benchmark price anchors from web search results.
Return ONLY JSON of this exact shape:
{
  "anchors": [
    {
      "productClass": "${productClass}",
      "low": <number, GBP>,
      "typical": <number, GBP>,
      "high": <number, GBP>,
      "unit": "<e.g. 'per MWh ex-works' or 'per kW installed'>",
      "source": "<URL or short citation>",
      "sourceType": "L3_live_search",
      "confidence": "moderate"
    }
  ]
}
Rules: emit at most 3 anchors, only if the results actually state prices. Never invent numbers. If you can't extract anything, emit {"anchors": []}.`

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${orKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',  // cheap aggregator
        // WS-D 2026-05-13: 150k (was 1024) — Tristan approved; truncation more expensive than unused tokens.
        max_tokens: 150_000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract anchors for productClass=${productClass} from these search snippets:\n\n${snippets}` },
        ],
      }),
    })
    if (!res.ok) {
      console.warn(`[benchmarks/L3] OpenRouter returned ${res.status}`)
      _runCache.set(cacheKey, [])
      return []
    }
    const data: any = await res.json()
    const content = data.choices?.[0]?.message?.content || ''
    const parsed = JSON.parse(content)
    const anchors = Array.isArray(parsed?.anchors) ? parsed.anchors : []
    const out: BenchmarkAnchor[] = anchors
      .filter((a: any) =>
        a && typeof a.typical === 'number' && typeof a.low === 'number' && typeof a.high === 'number'
      )
      .map((a: any) => ({
        productClass,
        low: a.low,
        typical: a.typical,
        high: a.high,
        unit: String(a.unit || ''),
        source: String(a.source || 'live-search'),
        sourceType: 'L3_live_search' as const,
        minedAt: new Date().toISOString(),
        confidence: (a.confidence === 'high' || a.confidence === 'low') ? a.confidence : 'moderate',
      }))

    console.log(`[benchmarks/L3] ${productClass}: ${out.length} anchor(s) from live search`)
    _runCache.set(cacheKey, out)
    return out
  } catch (err) {
    console.warn(`[benchmarks/L3] LLM aggregation failed:`, (err as Error).message)
    _runCache.set(cacheKey, [])
    return []
  }
}
