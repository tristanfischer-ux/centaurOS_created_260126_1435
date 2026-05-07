/**
 * @file benchmark-sources.ts — pluggable benchmark anchor providers.
 *
 * Layers (see TRACKER.md):
 *   - L1 (hand-curated) — benchmarks.ts, ships with the repo
 *   - L2 (corpus-mined) — scripts/mine-benchmark-chunks.ts writes
 *     `benchmarks-corpus.json` at repo root; this module loads + merges it
 *   - L3 (live search)  — lib/live-benchmark-search.ts fires Brave + a
 *     small LLM aggregate call when L1 + L2 are sparse for a given domain
 *
 * The existing `benchmarkCheck(productClass, unitTotalGbp, spec)` in
 * benchmarks.ts is the single caller; this file lets us add more anchors
 * without re-architecting the call site.
 *
 * Load order: L1 always; L2 when file exists; L3 when L1+L2 return <3
 * anchors for the product's class AND live search is enabled.
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export interface BenchmarkAnchor {
  productClass: string           // e.g. 'battery_energy_storage'
  low: number                    // £ or $ low band
  typical: number                // £ or $ typical
  high: number                   // £ or $ high band
  unit: string                   // e.g. 'per MWh ex-works' or 'per kW installed'
  capacityMin?: number           // e.g. only applies to BESS >= 1 MWh
  capacityMax?: number
  source: string                 // citation / URL
  sourceType: 'L1_curated' | 'L2_corpus_mined' | 'L3_live_search'
  minedAt?: string               // ISO timestamp when the anchor was produced (L2/L3)
  confidence?: 'high' | 'moderate' | 'low'
}

/**
 * Load corpus-mined benchmarks (L2). Looks for
 * `<repo>/src/lib/pdf-engine-v2/benchmarks-corpus.json` — produced by
 * scripts/mine-benchmark-chunks.ts. Returns an empty array if the file
 * isn't present.
 *
 * Schema (file):
 *   { generatedAt: ISO, anchors: BenchmarkAnchor[] }
 *
 * Cached in module-global memory — load cost is ~5ms per pipeline run.
 */
let _l2Cache: { loadedAt: number; anchors: BenchmarkAnchor[] } | null = null

export function loadCorpusBenchmarks(): BenchmarkAnchor[] {
  if (_l2Cache) return _l2Cache.anchors
  const candidates = [
    join(__dirname, '..', 'benchmarks-corpus.json'),
    join(__dirname, '..', '..', 'benchmarks-corpus.json'),
    join(process.cwd(), 'src/lib/pdf-engine-v2/benchmarks-corpus.json'),
  ]
  for (const path of candidates) {
    if (!existsSync(path)) continue
    try {
      const raw = readFileSync(path, 'utf-8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.anchors)) {
        const anchors = parsed.anchors.filter((a: any) =>
          a && typeof a.productClass === 'string' && typeof a.typical === 'number'
        ) as BenchmarkAnchor[]
        _l2Cache = { loadedAt: Date.now(), anchors }
        console.log(`[benchmarks/L2] loaded ${anchors.length} corpus-mined anchors from ${path}`)
        return anchors
      }
    } catch (err) {
      console.warn(`[benchmarks/L2] failed to parse ${path}:`, (err as Error).message)
    }
  }
  _l2Cache = { loadedAt: Date.now(), anchors: [] }
  return []
}

/**
 * Merge L1 + L2 anchors for a given product class. L2 results come first
 * (tend to be more recent); L1 as the floor.
 */
export function getMergedAnchors(
  productClass: string,
  l1Anchors: BenchmarkAnchor[],
): BenchmarkAnchor[] {
  const l2 = loadCorpusBenchmarks()
  const pcLower = productClass.toLowerCase()
  const l2Match = l2.filter(a => a.productClass.toLowerCase() === pcLower)
  const l1Match = l1Anchors.filter(a => a.productClass.toLowerCase() === pcLower)
  return [...l2Match, ...l1Match]
}

/**
 * Is live search (L3) enabled? Controlled by `ENABLE_LIVE_BENCHMARK_SEARCH`
 * env var — defaults to false so no surprise Brave spend.
 */
export function isLiveBenchmarkSearchEnabled(): boolean {
  return process.env.ENABLE_LIVE_BENCHMARK_SEARCH === 'true'
}

/**
 * Simple sparsity heuristic: L3 should fire when L1+L2 have fewer than
 * this many anchors for a given product class.
 */
export const L3_TRIGGER_THRESHOLD = 3

export function shouldTriggerLiveBenchmarkSearch(
  productClass: string,
  l1Anchors: BenchmarkAnchor[],
): boolean {
  if (!isLiveBenchmarkSearchEnabled()) return false
  const merged = getMergedAnchors(productClass, l1Anchors)
  return merged.length < L3_TRIGGER_THRESHOLD
}
