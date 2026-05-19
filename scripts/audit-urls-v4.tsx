#!/usr/bin/env npx tsx
// Audit URLs in the v4 BESS retro state.json:
//   - Sample 50 random URLs (verifications + recommendations) stratified by source_method
//   - HEAD-check each
//   - Report precision per source_method, and overall pass-rate
//
// Target: ≥95% of URLs resolve. If lower, iterate before scaling to other classes.

import { readFileSync } from 'fs'
import { urlResolvesDetailed } from '../src/lib/pdf-engine-v2/parts-catalogue/url-resolves'

interface UrlSample {
  source: 'verif' | 'rec'
  method: string
  manufacturer: string
  part_number: string
  url: string
}

// (audit script — not changing in illustration workstream)
function shuffle<T>(arr: T[]): T[] {
  return arr.map(x => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x)
}

async function main() {
  const statePath = '/Users/tristanfischer/Downloads/bess-iter/iter-64-bess-v4/container/state.json'
  const state: any = JSON.parse(readFileSync(statePath, 'utf8'))

  const allVerif: UrlSample[] = []
  for (const v of (state.partVerifications ?? [])) {
    if (!v.source_url) continue
    allVerif.push({
      source: 'verif',
      method: v.source_method ?? 'unknown',
      manufacturer: v.manufacturer,
      part_number: v.part_number,
      url: v.source_url,
    })
  }
  const allRecs: UrlSample[] = []
  for (const r of (state.partRecommendations ?? [])) {
    if (!r.source_url) continue
    allRecs.push({
      source: 'rec',
      method: 'recommender',
      manufacturer: r.recommended_manufacturer ?? '?',
      part_number: r.recommended_part_number ?? '?',
      url: r.source_url,
    })
  }

  // Stratified sample: try to get balanced coverage across methods
  const byMethod = new Map<string, UrlSample[]>()
  for (const s of [...allVerif, ...allRecs]) {
    if (!byMethod.has(s.method)) byMethod.set(s.method, [])
    byMethod.get(s.method)!.push(s)
  }
  const sample: UrlSample[] = []
  for (const [m, arr] of byMethod) {
    sample.push(...shuffle(arr).slice(0, 10))  // up to 10 per method
  }
  // Top up to 50 total if room
  const remaining = shuffle([...allVerif, ...allRecs].filter(s => !sample.some(x => x.url === s.url)))
  while (sample.length < 50 && remaining.length > 0) sample.push(remaining.shift()!)

  console.log(`Total verif URLs: ${allVerif.length}`)
  console.log(`Total rec URLs:   ${allRecs.length}`)
  console.log(`Sampling: ${sample.length}\n`)
  console.log(`METHOD       SOURCE PART                                            STATUS  URL`)
  console.log('-'.repeat(150))

  const stats: Record<string, { ok: number; fail: number }> = {}
  for (const s of sample) {
    const r = await urlResolvesDetailed(s.url)
    if (!stats[s.method]) stats[s.method] = { ok: 0, fail: 0 }
    if (r.ok) stats[s.method].ok++; else stats[s.method].fail++
    const label = `${s.manufacturer} / ${s.part_number}`.slice(0, 45)
    console.log(`${s.method.padEnd(12)} ${s.source.padEnd(6)} ${label.padEnd(46)} ${r.ok ? '✓' : '✗'} ${r.status ?? '—'}    ${s.url.slice(0, 70)}`)
  }

  console.log(`\nPrecision per source_method:`)
  let totalOk = 0
  let totalAll = 0
  for (const [m, c] of Object.entries(stats)) {
    const tot = c.ok + c.fail
    totalOk += c.ok
    totalAll += tot
    console.log(`  ${m.padEnd(15)} ${c.ok}/${tot} (${Math.round(c.ok / tot * 100)}%)`)
  }
  console.log(`\n  OVERALL         ${totalOk}/${totalAll} (${Math.round(totalOk / totalAll * 100)}%)`)
  console.log(`\nTarget: ≥95%. ${totalOk / totalAll >= 0.95 ? 'PASS' : 'FAIL — iterate before scaling'}.`)
}

main().catch(e => { console.error(e); process.exit(1) })
