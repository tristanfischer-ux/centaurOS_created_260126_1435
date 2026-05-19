#!/usr/bin/env npx tsx
// v4 retro: phase-by-phase cascade using the new orchestrator.
//
// Pipeline:
//   Phase 0: parts catalogue DB lookup
//   Phase 1: DigiKey
//   Phase 2: Farnell
//   Phase 3: Mouser
//   Phase 4: Brave + Flash-Lite judge + HEAD-check
//   Phase 5: Tavily + Flash-Lite judge + HEAD-check
//   Phase 7: uncertain (no link rendered)
//
// All URLs that pass the cascade are persisted to ~/.forgeos/parts-catalogue.db
// so the NEXT run picks them up at Phase 0.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { execFileSync } from 'child_process'
import { resolve } from 'path'
import { extractPartCandidates, stripUnverifiedParts, recommendReplacementsForStripped, buildTechnicalSummary } from '../src/lib/pdf-engine-v2/radical/part-verification'
import { runPhysicsCritic } from '../src/lib/pdf-engine-v2/radical/physics-critic'
import { cascadeVerify } from '../src/lib/pdf-engine-v2/parts-catalogue/cascade'
import { getDb, totalCount, countsBySource } from '../src/lib/pdf-engine-v2/parts-catalogue/db'
import { getScheduler } from '../src/lib/pdf-engine-v2/parts-catalogue/rate-limit'

const OR_KEY = (() => {
  const env = readFileSync('/Users/tristanfischer/.claude/secrets/openrouter.env', 'utf8')
  return env.match(/OPENROUTER_API_KEY=(.+)/)?.[1].trim() ?? ''
})()

async function main() {
  const srcState = '/Users/tristanfischer/Downloads/bess-iter/iter-62-bess-container/container/state.json'
  if (!existsSync(srcState)) {
    console.error(`state.json not found: ${srcState}`)
    process.exit(1)
  }
  const outBase = '/Users/tristanfischer/Downloads/bess-iter/iter-64-bess-v4'
  const outContainer = resolve(outBase, 'container')
  mkdirSync(outContainer, { recursive: true })

  console.error(`[v4] reading ${srcState}`)
  const state: any = JSON.parse(readFileSync(srcState, 'utf8'))
  const modules = state.moduleDecomposition?.modules ?? []
  const productClass = state.parsedBrief?.product_class ?? state.parsedBrief?.product_type ?? 'bess-container'

  // Parts catalogue starting state
  const db = getDb()
  console.error(`[v4] parts catalogue starts with ${totalCount(db)} entries`)

  // Extract candidates
  const candidates = extractPartCandidates(modules)
  console.error(`[v4] extracted ${candidates.length} part candidates from BESS modules`)

  // Run the cascade
  const t0 = Date.now()
  const { verifications, stats } = await cascadeVerify(candidates, {
    apiKey: OR_KEY,
    projectId: 'iter-64-bess-v4',
  })
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  console.error(`\n[v4] === CASCADE STATS ===`)
  console.error(`[v4]   total candidates:     ${stats.total}`)
  console.error(`[v4]   phase 0 db hits:      ${stats.db_hits}`)
  console.error(`[v4]   phase 1 digikey:      ${stats.digikey_hits}`)
  console.error(`[v4]   phase 2 farnell:      ${stats.farnell_hits}`)
  console.error(`[v4]   phase 3 mouser:       ${stats.mouser_hits}`)
  console.error(`[v4]   phase 4 brave:        ${stats.brave_hits}`)
  console.error(`[v4]   phase 5 tavily:       ${stats.tavily_hits}`)
  console.error(`[v4]   phase 7 uncertain:    ${stats.uncertain}`)
  console.error(`[v4]   duration:             ${elapsed}s`)
  console.error(`[v4]   rate-limit status:    ${JSON.stringify(getScheduler().status())}`)
  console.error(`[v4]   parts catalogue NOW:  ${totalCount(db)} entries`)

  writeFileSync(resolve(outContainer, '10-part-verifications.json'), JSON.stringify(verifications, null, 2))

  // Strip + recommend (old code still does this)
  const stripResult = stripUnverifiedParts(modules, verifications)
  console.error(`\n[v4] stripping ${stripResult.stripped} unverified high-confidence parts`)
  const stripDetails = stripResult.details.map(d => ({
    ...d,
    technical_summary: buildTechnicalSummary(modules, d.word_id.split('::')[0], d.word_id.split('::')[1], d.word_id.split('::')[2] ?? '?'),
  }))
  const partRecommendations = await recommendReplacementsForStripped(stripDetails, OR_KEY, { batchSize: 5 })
  const recsWithUrl = partRecommendations.filter(r => r.source_url).length
  console.error(`[v4] recommendations: ${partRecommendations.length} (${recsWithUrl} with URL after HEAD-check)`)
  writeFileSync(resolve(outContainer, '11-recommendations.json'), JSON.stringify(partRecommendations, null, 2))

  // Physics critic
  const critique = await runPhysicsCritic({
    modules,
    brief: state.parsedBrief,
    keyMetrics: state.keyMetrics,
    partSummary: { total: verifications.length, verified: verifications.filter(v => v.status === 'verified').length, stripped: stripResult.stripped },
    decisions: state.designDecisions,
    productClass,
    apiKey: OR_KEY,
  }).catch(() => null)

  // Save state + render
  const newState = {
    ...state,
    partVerifications: verifications,
    partRecommendations,
    partVerificationSummary: {
      total: verifications.length,
      verified: verifications.filter(v => v.status === 'verified').length,
      uncertain: verifications.filter(v => v.status === 'uncertain').length,
      stripped: stripResult.stripped,
      recommendations_total: partRecommendations.length,
      recommendations_with_url: recsWithUrl,
      cascade_stats: stats,
    },
    physicsCritique: critique,
    savedAt: new Date().toISOString(),
  }
  const newStatePath = resolve(outContainer, 'state.json')
  writeFileSync(newStatePath, JSON.stringify(newState, null, 2))
  console.error(`[v4] state saved to ${newStatePath}`)

  const pdfPath = resolve(outContainer, 'chain-v2.pdf')
  console.error(`[v4] rendering...`)
  execFileSync('npx', ['tsx', resolve(__dirname, 'render-minimal-pdf.tsx'), newStatePath, pdfPath], {
    stdio: 'inherit',
    cwd: resolve(__dirname, '..'),
  })
  console.error(`\n[v4] === DONE ===  pdf: ${pdfPath}`)
  execFileSync('open', [pdfPath])
}

main().catch(e => { console.error(e); process.exit(1) })
