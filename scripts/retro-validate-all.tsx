#!/usr/bin/env npx tsx
// Mass-retrofit all 10 iter-62 states with the new cascade verifier +
// Mouser tier 3 + grounded URLs, then re-render PDFs with dotted links.
//
// Outputs into iter-63-{class}-retro/ for each class.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { resolve } from 'path'
import { verifyAllParts, stripUnverifiedParts, recommendReplacementsForStripped, buildTechnicalSummary } from '../src/lib/pdf-engine-v2/radical/part-verification'
import { runPhysicsCritic } from '../src/lib/pdf-engine-v2/radical/physics-critic'

const CLASSES = ['cgm', 'drone', 'edge-ai', 'heatpump', 'ev-charger', 'bioreactor', 'vertical-farm', 'auv', 'bess-container', 'haps']

const OR_KEY = (() => {
  const env = readFileSync('/Users/tristanfischer/.claude/secrets/openrouter.env', 'utf8')
  return env.match(/OPENROUTER_API_KEY=(.+)/)?.[1].trim() ?? ''
})()

async function retroOne(cls: string): Promise<{ cls: string; ok: boolean; summary?: any }> {
  const srcState = `/Users/tristanfischer/Downloads/bess-iter/iter-62-${cls}/container/state.json`
  if (!existsSync(srcState)) {
    console.error(`[${cls}] NO state.json`)
    return { cls, ok: false }
  }
  const outContainer = `/Users/tristanfischer/Downloads/bess-iter/iter-63-${cls}-retro/container`
  mkdirSync(outContainer, { recursive: true })

  console.error(`\n[${cls}] === START ===`)
  const state: any = JSON.parse(readFileSync(srcState, 'utf8'))
  const modules = state.moduleDecomposition?.modules ?? []
  const productClass = state.parsedBrief?.product_class ?? state.parsedBrief?.product_type ?? cls

  const partVerifications = await verifyAllParts(modules, OR_KEY, { batchSize: 10 })
  const stripResult = stripUnverifiedParts(modules, partVerifications)
  const stripDetails = stripResult.details.map(d => ({
    ...d,
    technical_summary: buildTechnicalSummary(modules, d.word_id.split('::')[0], d.word_id.split('::')[1], d.word_id.split('::')[2] ?? '?'),
  }))
  const partRecommendations = await recommendReplacementsForStripped(stripDetails, OR_KEY, { batchSize: 10 })

  const critique = await runPhysicsCritic({
    modules,
    brief: state.parsedBrief,
    keyMetrics: state.keyMetrics,
    partSummary: { total: partVerifications.length, verified: partVerifications.filter(v => v.status === 'verified').length, stripped: stripResult.stripped },
    decisions: state.designDecisions,
    productClass,
    apiKey: OR_KEY,
  }).catch(() => null)

  const summary = {
    total: partVerifications.length,
    verified: partVerifications.filter(v => v.status === 'verified').length,
    unverified: partVerifications.filter(v => v.status === 'unverified').length,
    uncertain: partVerifications.filter(v => v.status === 'uncertain').length,
    skipped: partVerifications.filter(v => v.status === 'skip').length,
    stripped: stripResult.stripped,
    recommendations_total: partRecommendations.length,
    recommendations_unknown: partRecommendations.filter(r => r.confidence === 'unknown').length,
    verified_with_url: partVerifications.filter(v => v.status === 'verified' && v.source_url).length,
    mouser_hits: partVerifications.filter(v => v.source_method === 'mouser').length,
    tavily_fallbacks: partVerifications.filter(v => v.source_method === 'tavily').length,
    grounded_hits: partVerifications.filter(v => v.source_method === 'grounded').length,
  }

  const newState = {
    ...state,
    partVerifications,
    partRecommendations,
    partVerificationSummary: summary,
    physicsCritique: critique,
    savedAt: new Date().toISOString(),
  }
  const newStatePath = resolve(outContainer, 'state.json')
  writeFileSync(newStatePath, JSON.stringify(newState, null, 2))

  const pdfPath = resolve(outContainer, 'chain-v2.pdf')
  try {
    execFileSync('npx', ['tsx', resolve(__dirname, 'render-minimal-pdf.tsx'), newStatePath, pdfPath], {
      stdio: 'pipe',
      cwd: resolve(__dirname, '..'),
    })
    console.error(`[${cls}] DONE   parts ${summary.total} | verified+url ${summary.verified_with_url} | strip ${summary.stripped} | mouser ${summary.mouser_hits} | critic ${critique ? critique.issues.length + ' issues' : 'failed'}`)
    return { cls, ok: true, summary }
  } catch (e) {
    console.error(`[${cls}] RENDER FAILED: ${(e as Error).message.slice(0, 200)}`)
    return { cls, ok: false, summary }
  }
}

async function main() {
  // Process 3 at a time to bound concurrent OpenRouter+Tavily+Mouser load
  const results: any[] = []
  for (let i = 0; i < CLASSES.length; i += 3) {
    const batch = CLASSES.slice(i, i + 3)
    const batchResults = await Promise.all(batch.map(retroOne))
    results.push(...batchResults)
  }

  console.log('\n\n=== Mass-retrofit summary ===\n')
  console.log('CLASS           OK  PARTS  VRFY+URL  STRIP  MOUSER  TAVILY  GROUNDED')
  for (const r of results) {
    if (!r.summary) {
      console.log(`  ${r.cls.padEnd(15)} ✗`)
      continue
    }
    const s = r.summary
    console.log(`  ${r.cls.padEnd(15)} ${r.ok ? '✓' : '✗'}   ${String(s.total).padStart(4)}  ${String(s.verified_with_url).padStart(8)}  ${String(s.stripped).padStart(5)}  ${String(s.mouser_hits).padStart(6)}  ${String(s.tavily_fallbacks).padStart(6)}  ${String(s.grounded_hits).padStart(8)}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
