#!/usr/bin/env npx tsx
// Ground-truth test for part verification. Samples N parts from each bucket
// (verified / stripped / uncertain) and checks each against Tavily web search.
// Reports precision and recall vs the engine's current verifier (which uses
// no web search — pure Flash-Lite training-data pattern-matching).
//
// Usage: npx tsx scripts/ground-truth-parts-test.tsx

import { readFileSync, writeFileSync, existsSync } from 'fs'

const CLASSES = ['drone', 'edge-ai', 'heatpump', 'ev-charger', 'bioreactor', 'auv']
const TAVILY_KEY = (() => {
  const env = readFileSync('/Users/tristanfischer/.claude/secrets/tavily.env', 'utf8')
  return env.match(/TAVILY_API_KEY=(.+)/)?.[1].trim() ?? ''
})()
const OR_KEY = (() => {
  const env = readFileSync('/Users/tristanfischer/.claude/secrets/openrouter.env', 'utf8')
  return env.match(/OPENROUTER_API_KEY=(.+)/)?.[1].trim() ?? ''
})()

interface Sample {
  cls: string
  manufacturer: string
  part_number: string
  module: string
  sub_module_id: string
  bucket: 'verified' | 'stripped' | 'uncertain'
  engine_confidence: string
}

function loadAllParts(): Sample[] {
  const all: Sample[] = []
  for (const c of CLASSES) {
    const p = `/Users/tristanfischer/Downloads/bess-iter/iter-62-${c}/container/state.json`
    if (!existsSync(p)) continue
    const s = JSON.parse(readFileSync(p, 'utf8'))
    for (const v of (s.partVerifications || [])) {
      let bucket: Sample['bucket'] | null = null
      if (v.status === 'verified') bucket = 'verified'
      else if (v.status === 'unverified' && v.confidence === 'high') bucket = 'stripped'
      else if (v.status === 'uncertain') bucket = 'uncertain'
      if (!bucket) continue
      all.push({
        cls: c,
        manufacturer: v.manufacturer,
        part_number: v.part_number,
        module: v.module,
        sub_module_id: v.sub_module_id,
        bucket,
        engine_confidence: v.confidence,
      })
    }
  }
  return all
}

function shuffle<T>(arr: T[]): T[] {
  return arr.map(x => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x)
}

async function tavilySearch(query: string): Promise<{ results: any[]; raw: string }> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: TAVILY_KEY,
      query,
      search_depth: 'basic',
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    }),
  })
  if (!res.ok) return { results: [], raw: `HTTP ${res.status}` }
  const j: any = await res.json()
  const results = j.results ?? []
  const raw = results.map((r: any) => `${r.title}\n${r.url}\n${(r.content || '').slice(0, 300)}`).join('\n\n---\n\n')
  return { results, raw }
}

async function judge(sample: Sample, searchRaw: string): Promise<{ verdict: 'real' | 'fake' | 'ambiguous'; confidence: string; reasoning: string } | null> {
  const prompt = `You are a senior procurement engineer. Given web search results, judge whether this specific (manufacturer, part_number) pair refers to a REAL product that an engineer could actually order.

MANUFACTURER: ${sample.manufacturer}
PART NUMBER: ${sample.part_number}
APPLICATION: ${sample.sub_module_id}

WEB SEARCH RESULTS:
${searchRaw.slice(0, 4000)}

Rules:
- "real" — search results contain a datasheet, distributor listing, or manufacturer catalogue page that matches BOTH the manufacturer AND this exact part_number (or a close variant where you can see the family).
- "fake" — search results do NOT support this part_number. The manufacturer may be real but this specific SKU is not found, or the format is wrong for that manufacturer's nomenclature.
- "ambiguous" — search results are inconclusive (manufacturer makes similar parts but this exact number is not visible) — be honest, don't guess.

Return ONLY this JSON:
{
  "verdict": "real|fake|ambiguous",
  "confidence": "high|medium|low",
  "reasoning": "<one sentence — quote the URL or title that proves your verdict, or say what's missing>"
}`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 800,
      temperature: 0,
    }),
  })
  if (!res.ok) return null
  const j: any = await res.json()
  const text = j.choices?.[0]?.message?.content ?? ''
  try { return JSON.parse(text) } catch { return null }
}

async function processOne(sample: Sample): Promise<any> {
  const query = `"${sample.manufacturer}" "${sample.part_number}" datasheet OR distributor OR catalogue`
  const { raw } = await tavilySearch(query)
  const verdict = await judge(sample, raw)
  return {
    ...sample,
    ground_truth: verdict?.verdict ?? 'error',
    gt_confidence: verdict?.confidence ?? '-',
    gt_reasoning: verdict?.reasoning ?? '-',
  }
}

async function main() {
  const all = loadAllParts()
  console.log(`Loaded ${all.length} parts. Buckets: ` +
    `verified=${all.filter(p => p.bucket === 'verified').length} ` +
    `stripped=${all.filter(p => p.bucket === 'stripped').length} ` +
    `uncertain=${all.filter(p => p.bucket === 'uncertain').length}`)

  const verified = shuffle(all.filter(p => p.bucket === 'verified')).slice(0, 15)
  const stripped = shuffle(all.filter(p => p.bucket === 'stripped')).slice(0, 10)
  const uncertain = shuffle(all.filter(p => p.bucket === 'uncertain')).slice(0, 5)
  const sample = [...verified, ...stripped, ...uncertain]
  console.log(`Testing ${sample.length} parts: 15 verified + 10 stripped + 5 uncertain`)

  // Process in batches of 5 to avoid burst rate limits
  const results: any[] = []
  for (let i = 0; i < sample.length; i += 5) {
    const batch = sample.slice(i, i + 5)
    const r = await Promise.all(batch.map(processOne))
    results.push(...r)
    console.error(`  ${i + batch.length}/${sample.length} done`)
  }

  // Confusion matrix: engine verdict (verified|stripped) vs ground-truth (real|fake|ambiguous)
  console.log('\n=== Confusion matrix ===')
  const counts: any = { verified: { real: 0, fake: 0, ambiguous: 0, error: 0 }, stripped: { real: 0, fake: 0, ambiguous: 0, error: 0 }, uncertain: { real: 0, fake: 0, ambiguous: 0, error: 0 } }
  for (const r of results) counts[r.bucket][r.ground_truth ?? 'error']++

  console.log('Engine    →  Ground-truth says:')
  console.log('             real  fake  ambig  error')
  for (const b of ['verified', 'stripped', 'uncertain']) {
    console.log(`  ${b.padEnd(10)} ${String(counts[b].real).padStart(4)} ${String(counts[b].fake).padStart(5)} ${String(counts[b].ambiguous).padStart(6)} ${String(counts[b].error).padStart(6)}`)
  }

  console.log('\n=== Detailed results ===')
  console.log('BUCKET     CLS              MFR / PART_NUMBER                              GROUND-TRUTH (conf)')
  console.log('-'.repeat(140))
  for (const r of results.sort((a, b) => a.bucket.localeCompare(b.bucket))) {
    const mfrPn = `${r.manufacturer} / ${r.part_number}`.slice(0, 50)
    console.log(`  ${r.bucket.padEnd(10)} ${r.cls.padEnd(15)} ${mfrPn.padEnd(50)} ${(r.ground_truth || '?').padEnd(10)} (${r.gt_confidence}) — ${r.gt_reasoning.slice(0, 60)}`)
  }

  // Save full results
  writeFileSync('/Users/tristanfischer/Downloads/bess-iter/iter-62-ground-truth-test.json', JSON.stringify(results, null, 2))
  console.log('\nFull results saved to /Users/tristanfischer/Downloads/bess-iter/iter-62-ground-truth-test.json')

  // Key metrics
  const v = counts.verified, s = counts.stripped, u = counts.uncertain
  const verifyPrecision = v.real / (v.real + v.fake + 0.001)  // of "verified", what fraction are actually real
  const stripPrecision = s.fake / (s.real + s.fake + 0.001)   // of "stripped", what fraction are actually fake
  console.log('\n=== Key metrics ===')
  console.log(`  Verify precision: ${(verifyPrecision * 100).toFixed(0)}% (${v.real}/${v.real + v.fake} verified parts are actually real)`)
  console.log(`  Strip precision:  ${(stripPrecision * 100).toFixed(0)}% (${s.fake}/${s.real + s.fake} stripped parts are actually fake)`)
  console.log(`  Engine flagged-as-uncertain hit-rate: ${u.ambiguous}/${u.real + u.fake + u.ambiguous} actually ambiguous on web`)
  console.log(`  Total Tavily searches: ${sample.length} × £0.001 ≈ £${(sample.length * 0.001).toFixed(2)}`)
}

main().catch(e => { console.error(e); process.exit(1) })
