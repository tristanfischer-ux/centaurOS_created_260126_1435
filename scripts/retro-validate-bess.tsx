#!/usr/bin/env npx tsx
// Retro-validation harness: take a finished state.json, re-run the NEW
// part-verification cascade (grounded Flash-Lite → Tavily fallback, with URL
// capture) and the recommender, then re-render. Lets us see the new "click
// the dotted link to see the source" affordance on an existing BESS design
// without running a fresh 30-minute chain.
//
// Usage: npx tsx scripts/retro-validate-bess.tsx <iter-dir>
//   e.g. npx tsx scripts/retro-validate-bess.tsx /Users/tristanfischer/Downloads/bess-iter/iter-62-bess-container

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, cpSync } from 'fs'
import { execFileSync } from 'child_process'
import { resolve, dirname } from 'path'
import { verifyAllParts, stripUnverifiedParts, recommendReplacementsForStripped, buildTechnicalSummary } from '../src/lib/pdf-engine-v2/radical/part-verification'
import { runPhysicsCritic } from '../src/lib/pdf-engine-v2/radical/physics-critic'

const OR_KEY = (() => {
  const env = readFileSync('/Users/tristanfischer/.claude/secrets/openrouter.env', 'utf8')
  return env.match(/OPENROUTER_API_KEY=(.+)/)?.[1].trim() ?? ''
})()

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/retro-validate-bess.tsx <iter-dir>')
    process.exit(1)
  }
  const srcDir = resolve(args[0])
  const srcState = resolve(srcDir, 'container/state.json')
  if (!existsSync(srcState)) {
    console.error(`state.json not found: ${srcState}`)
    process.exit(1)
  }

  // Output dir: sibling iter-63-bess-retro
  const outBase = resolve(dirname(srcDir), 'iter-63-bess-retro')
  const outContainer = resolve(outBase, 'container')
  mkdirSync(outContainer, { recursive: true })

  console.error(`[retro] reading ${srcState}`)
  const state: any = JSON.parse(readFileSync(srcState, 'utf8'))
  const modules = state.moduleDecomposition?.modules ?? []
  const productClass = state.parsedBrief?.product_class ?? state.parsedBrief?.product_type ?? 'bess-container'

  // ── 1. Re-run part verification with cascade + URL capture
  console.error(`[retro] re-running part verification (cascade: grounded Flash-Lite + Tavily fallback)`)
  const tVer = Date.now()
  const partVerifications = await verifyAllParts(modules, OR_KEY, { batchSize: 10 })
  console.error(`[retro] part verification done in ${((Date.now() - tVer) / 1000).toFixed(1)}s — ${partVerifications.length} parts checked`)
  const verifiedWithUrl = partVerifications.filter(v => v.status === 'verified' && v.source_url).length
  const verifiedNoUrl = partVerifications.filter(v => v.status === 'verified' && !v.source_url).length
  const tavilyHits = partVerifications.filter(v => v.source_method === 'tavily').length
  console.error(`[retro]   verified with URL: ${verifiedWithUrl}; verified without URL: ${verifiedNoUrl}; tavily fallbacks: ${tavilyHits}`)

  writeFileSync(resolve(outContainer, '10-part-verifications.json'), JSON.stringify(partVerifications, null, 2))

  // ── 2. Strip + recommend
  console.error(`[retro] stripping unverified high-confidence parts`)
  const stripResult = stripUnverifiedParts(modules, partVerifications)
  console.error(`[retro]   stripped ${stripResult.stripped} parts`)
  const stripDetails = stripResult.details.map(d => ({
    ...d,
    technical_summary: buildTechnicalSummary(modules, d.word_id.split('::')[0], d.word_id.split('::')[1], d.word_id.split('::')[2] ?? '?'),
  }))
  const partRecommendations = await recommendReplacementsForStripped(stripDetails, OR_KEY, { batchSize: 10 })
  const recsWithUrl = partRecommendations.filter(r => r.source_url).length
  console.error(`[retro]   recommendations: ${partRecommendations.length} (${recsWithUrl} with URL)`)
  writeFileSync(resolve(outContainer, '11-recommendations.json'), JSON.stringify(partRecommendations, null, 2))

  // ── 3. Physics critic (retro-run on final state)
  console.error(`[retro] running physics critic`)
  const critique = await runPhysicsCritic({
    modules,
    brief: state.parsedBrief,
    keyMetrics: state.keyMetrics,
    partSummary: { total: partVerifications.length, verified: partVerifications.filter(v => v.status === 'verified').length, stripped: stripResult.stripped },
    decisions: state.designDecisions,
    productClass,
    apiKey: OR_KEY,
  })
  if (critique) {
    console.error(`[retro]   critic scores: brief=${critique.scores.brief_to_design_fidelity}/10 phys=${critique.scores.engineering_plausibility}/10 coh=${critique.scores.internal_coherence}/10 part=${critique.scores.part_realism}/10 hon=${critique.scores.honesty_signal}/10`)
    console.error(`[retro]   critic issues: ${critique.issues.length} (${critique.issues.filter(i => i.severity === 'high').length} high, ${critique.issues.filter(i => i.severity === 'med').length} med)`)
    writeFileSync(resolve(outContainer, '12-physics-critique.json'), JSON.stringify(critique, null, 2))
  } else {
    console.error(`[retro]   critic returned null`)
  }

  // ── 4. Save new state + render
  const newState = {
    ...state,
    partVerifications,
    partRecommendations,
    partVerificationSummary: {
      total: partVerifications.length,
      verified: partVerifications.filter(v => v.status === 'verified').length,
      unverified: partVerifications.filter(v => v.status === 'unverified').length,
      uncertain: partVerifications.filter(v => v.status === 'uncertain').length,
      skipped: partVerifications.filter(v => v.status === 'skip').length,
      stripped: stripResult.stripped,
      recommendations_total: partRecommendations.length,
      recommendations_unknown: partRecommendations.filter(r => r.confidence === 'unknown').length,
      verified_with_url: verifiedWithUrl,
      tavily_fallbacks: tavilyHits,
    },
    physicsCritique: critique,
    savedAt: new Date().toISOString(),
  }
  const newStatePath = resolve(outContainer, 'state.json')
  writeFileSync(newStatePath, JSON.stringify(newState, null, 2))
  console.error(`[retro] saved state to ${newStatePath}`)

  // ── 5. Render
  const pdfPath = resolve(outContainer, 'chain-v2.pdf')
  console.error(`[retro] rendering...`)
  execFileSync('npx', ['tsx', resolve(__dirname, 'render-minimal-pdf.tsx'), newStatePath, pdfPath], { stdio: 'inherit', cwd: resolve(__dirname, '..') })
  console.error(`[retro] === DONE ===  pdf: ${pdfPath}`)
  execFileSync('open', [pdfPath])
}

main().catch(e => { console.error(e); process.exit(1) })
