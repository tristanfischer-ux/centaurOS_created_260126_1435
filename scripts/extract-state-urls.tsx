/**
 * @file extract-state-urls.tsx — Pull every founder-facing URL from a set of
 * state.json files. Used by the URL stealth verifier (Part 2 of task #156).
 *
 * Buckets: partVerifications (datasheets, distributor product pages),
 *          supplier candidate website_urls,
 *          partRecommendations.source_url
 *
 * Output: stdout JSON array of { url, expectedTerms, bucket, source_file }.
 */

import { readFileSync, writeFileSync } from 'fs'

interface UrlRecord {
  url: string
  expectedTerms: string[]
  bucket: 'partVerification' | 'partRecommendation' | 'supplier'
  source_file: string
  context: string
}

function pushUrl(out: UrlRecord[], r: UrlRecord): void {
  if (!r.url || !r.url.startsWith('http')) return
  out.push(r)
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('Usage: extract-state-urls.tsx <state.json> [more.json...]')
  process.exit(1)
}

const out: UrlRecord[] = []
for (const file of files) {
  let state: any
  try {
    state = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    console.error(`failed to parse ${file}: ${(e as Error).message}`)
    continue
  }

  // 1. partVerifications — datasheet / distributor URLs
  for (const v of (state.partVerifications ?? [])) {
    if (v?.source_url && v?.status === 'verified') {
      pushUrl(out, {
        url: v.source_url,
        expectedTerms: [v.manufacturer, v.part_number].filter((t: unknown): t is string => typeof t === 'string' && t.length >= 3),
        bucket: 'partVerification',
        source_file: file,
        context: `${v.manufacturer ?? '?'} / ${v.part_number ?? '?'} via ${v.source_method ?? '?'}`,
      })
    }
  }

  // 2. partRecommendations — pseudo-replacements proposed by LLM
  for (const r of (state.partRecommendations ?? [])) {
    if (r?.source_url) {
      pushUrl(out, {
        url: r.source_url,
        expectedTerms: [r.recommended_manufacturer, r.recommended_part_number].filter((t: unknown): t is string => typeof t === 'string' && t.length >= 3),
        bucket: 'partRecommendation',
        source_file: file,
        context: `recommend: ${r.recommended_manufacturer ?? '?'} / ${r.recommended_part_number ?? '?'}`,
      })
    }
  }

  // 3. supplier candidates — website URLs surfaced in PDF supplier panel
  for (const s of (state.suppliers ?? [])) {
    for (const c of (s?.candidates ?? [])) {
      if (c?.website_url) {
        pushUrl(out, {
          url: c.website_url,
          expectedTerms: [c.name].filter((t: unknown): t is string => typeof t === 'string' && t.length >= 3),
          bucket: 'supplier',
          source_file: file,
          context: `supplier candidate: ${c.name ?? '?'} (${s?.archetype_label ?? '?'})`,
        })
      }
    }
  }
}

// De-duplicate by URL — keep first occurrence
const seen = new Set<string>()
const deduped = out.filter(r => {
  if (seen.has(r.url)) return false
  seen.add(r.url)
  return true
})

const targetPath = process.env.OUT ?? '/tmp/state-urls-extracted.json'
writeFileSync(targetPath, JSON.stringify(deduped, null, 2))
const byBucket: Record<string, number> = {}
for (const r of deduped) byBucket[r.bucket] = (byBucket[r.bucket] ?? 0) + 1
console.error(`extracted ${deduped.length} unique URLs from ${files.length} files: ${JSON.stringify(byBucket)}`)
console.error(`written to ${targetPath}`)
