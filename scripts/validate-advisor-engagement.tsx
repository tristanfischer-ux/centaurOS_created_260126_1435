/**
 * scripts/validate-advisor-engagement.tsx
 *
 * Standalone validation for the "Take this to your advisors" feature, WITHOUT a
 * full chain run. Loads a real state.json, runs the advisor-engagement generator
 * (REAL Anthropic-free LLM calls) to populate state.advisorEngagement, writes a
 * temp state file, and prints a per-module summary + a sample card. Render the
 * temp state with:
 *
 *   RENDER_NO_OPEN=1 npx tsx scripts/render-minimal-pdf.tsx /tmp/advisor-state.json /tmp/advisor.pdf
 *
 * Usage:
 *   npx tsx scripts/validate-advisor-engagement.tsx [in-state.json] [out-temp-state.json]
 * Defaults:
 *   in   = out/co2-mineralisation-2sink-v6/state.json
 *   out  = /tmp/advisor-state.json
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { homedir } from 'os'

// Load OPENROUTER_API_KEY the same way the chain does.
for (const envPath of [resolve(process.cwd(), '.env.local'), resolve(homedir(), '.claude/secrets/distributor-apis.env')]) {
  try {
    const c = readFileSync(envPath, 'utf-8')
    for (const line of c.split('\n')) {
      const t = line.trim()
      if (t && !t.startsWith('#') && t.includes('=')) {
        const [k, ...rest] = t.split('=')
        const v = rest.join('=').replace(/^["']|["']$/g, '')
        if (!process.env[k]) process.env[k] = v
      }
    }
  } catch { /* ignore */ }
}

import { buildAdvisorEngagement, type AdvisorEngagement } from '../src/lib/pdf-engine-v2/lib/advisor-engagement'

async function main() {
  const inPath = resolve(process.argv[2] ?? 'out/co2-mineralisation-2sink-v6/state.json')
  const outPath = resolve(process.argv[3] ?? '/tmp/advisor-state.json')
  console.error(`[validate] loading ${inPath}`)
  const state = JSON.parse(readFileSync(inPath, 'utf-8'))

  const t0 = Date.now()
  const engagement: AdvisorEngagement = await buildAdvisorEngagement(state, { concurrency: 3 })
  console.error(`[validate] generated in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

  state.advisorEngagement = engagement
  writeFileSync(outPath, JSON.stringify(state, null, 2))
  console.error(`[validate] wrote temp state → ${outPath}`)

  // Summary
  const keys = Object.keys(engagement)
  console.log(`\n=== ADVISOR ENGAGEMENT — ${keys.length} module blocks ===`)
  let leak = false
  // Procurement guard mirrors the generator's questionHasProcurementLeak SCOPE:
  // the design-only contract is about the QUESTIONS, not company-type descriptors
  // (the approved mockup itself names "an equipment vendor's application-
  // engineering group" as a legitimate `typically_at`). So check question +
  // strong_answer only, and exempt the sanctioned "vendor's …group" phrasing.
  const PROC_RE = /\b(price|pricing|quote|quotation|costing|£|\$|€|lead[\s-]?time|minimum order|\bmoq\b|procure|procurement|purchase order|get a price|firm price|how much)\b/i
  // Every rendered field must be acronym-free (no-acronym rule).
  const ACRO_RE = /\b(MEA|CO2|CaCO3|K2SO4|KOH|NaOH|DSEAR|PED|RFQ|MOQ|ATEX|VSD|VFD|SIL|VOC|HMI|PLC)\b/
  let acroLeak = false
  for (const key of keys) {
    const b = engagement[key]
    console.log(`\n• ${b.module_name}  [${key}]  — ${b.cards.length} card(s)`)
    console.log(`    intro: ${b.intro}`)
    for (const c of b.cards) {
      console.log(`    ├─ ${c.specialist_role}`)
      console.log(`    │    typically at: ${c.typically_at}`)
      console.log(`    │    covers: ${c.covers}`)
      for (const q of c.questions) {
        console.log(`    │    Q: ${q.question.slice(0, 110)}${q.question.length > 110 ? '…' : ''}`)
        console.log(`    │       grounded_in: ${q.grounded_in.slice(0, 100)}${q.grounded_in.length > 100 ? '…' : ''}`)
        const procHay = `${q.question} ${q.strong_answer}`
        if (PROC_RE.test(procHay)) { leak = true; console.log(`    │       ⚠ PROCUREMENT LEAK in question/answer: ${procHay.match(PROC_RE)?.[0]}`) }
        // Acronym check across all RENDERED fields, minus the sanctioned "vendor".
        const acroHay = `${q.question} ${q.strong_answer} ${q.grounded_in} ${c.background} ${c.covers} ${c.specialist_role}`
        if (ACRO_RE.test(acroHay)) { acroLeak = true; console.log(`    │       ⚠ ACRONYM LEAK in copy: ${acroHay.match(ACRO_RE)?.[0]}`) }
      }
    }
  }

  // Spotlight: the MEA Absorption module should surface the absorber-flooding finding.
  const mea = Object.values(engagement).find((b) => /absorption|absorber|monoethanolamine/i.test(b.module_name))
  console.log(`\n=== SPOTLIGHT — does the Monoethanolamine Absorption module surface the absorber-flooding physics finding? ===`)
  if (mea) {
    const floodingQ = mea.cards.flatMap((c) => c.questions).find((q) => /flood|velocity|diameter|packing height|0\.2/i.test(`${q.question} ${q.grounded_in}`))
    if (floodingQ) {
      console.log('FOUND — sample grounded card from the MEA Absorption module:')
      console.log(`  Question:    ${floodingQ.question}`)
      console.log(`  Grounded in: ${floodingQ.grounded_in}`)
      console.log(`  Strong ans:  ${floodingQ.strong_answer}`)
    } else {
      console.log('module present but no flooding question matched — inspect output above')
    }
  } else {
    console.log('MEA Absorption module not found in engagement map')
  }

  console.log(`\n=== CHECKS ===`)
  console.log(`  module blocks: ${keys.length}`)
  console.log(`  procurement leak in any rendered copy: ${leak ? 'YES (FAIL)' : 'no'}`)
  console.log(`  acronym leak (MEA/CO2/…) in any rendered copy: ${acroLeak ? 'YES (FAIL)' : 'no'}`)
  console.log(`\nNext: RENDER_NO_OPEN=1 npx tsx scripts/render-minimal-pdf.tsx ${outPath} /tmp/advisor.pdf`)
}

main().catch((e) => {
  console.error('[validate] FAILED:', e)
  process.exit(1)
})
