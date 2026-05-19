/**
 * @file retro-validate-class-v4.tsx — Generalised v4 cascade retro for any
 * product class. Reads iter-62 state.json for the given class, runs the v4
 * cascade (DB → DigiKey → Farnell → Mouser → Brave → Tavily), persists
 * verifications + recommendations + physics critique, and renders the v4 PDF.
 *
 * Usage:
 *   npx tsx scripts/retro-validate-class-v4.tsx <class-slug>
 *
 * Where <class-slug> is one of: auv, bess, bioreactor, cgm, drone, edge-ai,
 * ev-charger, haps, heatpump, vertical-farm
 *
 * Input:  ~/Downloads/bess-iter/iter-62-<class>/container/state.json
 * Output: ~/Downloads/bess-iter/iter-64-<class>-v4/container/{state.json,chain-v2.pdf}
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { execFileSync } from 'child_process'
import { resolve } from 'path'
import { homedir } from 'os'
import { extractPartCandidates, stripUnverifiedParts, recommendReplacementsForStripped, buildTechnicalSummary } from '../src/lib/pdf-engine-v2/radical/part-verification'
import { runPhysicsCritic } from '../src/lib/pdf-engine-v2/radical/physics-critic'
import { cascadeVerify } from '../src/lib/pdf-engine-v2/parts-catalogue/cascade'
import { getDb, totalCount } from '../src/lib/pdf-engine-v2/parts-catalogue/db'
import { getScheduler } from '../src/lib/pdf-engine-v2/parts-catalogue/rate-limit'

const OR_KEY = (() => {
  const env = readFileSync('/Users/tristanfischer/.claude/secrets/openrouter.env', 'utf8')
  return env.match(/OPENROUTER_API_KEY=(.+)/)?.[1].trim() ?? ''
})()

// Special-case bess: original iter-62 dir is "iter-62-bess-container"
const SRC_DIRNAME: Record<string, string> = {
  bess: 'iter-62-bess-container',
}

async function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.error('Usage: npx tsx scripts/retro-validate-class-v4.tsx <class-slug>')
    process.exit(1)
  }
  const srcDir = SRC_DIRNAME[slug] ?? `iter-62-${slug}`
  const srcState = resolve(homedir(), 'Downloads', 'bess-iter', srcDir, 'container', 'state.json')
  if (!existsSync(srcState)) {
    console.error(`[v4:${slug}] state.json not found: ${srcState}`)
    process.exit(1)
  }
  const outBase = resolve(homedir(), 'Downloads', 'bess-iter', `iter-64-${slug}-v4`)
  const outContainer = resolve(outBase, 'container')
  mkdirSync(outContainer, { recursive: true })

  console.error(`[v4:${slug}] reading ${srcState}`)
  const state: any = JSON.parse(readFileSync(srcState, 'utf8'))
  const modules = state.moduleDecomposition?.modules ?? []
  const productClass = state.parsedBrief?.product_class ?? state.parsedBrief?.product_type ?? slug

  const db = getDb()
  const dbStart = totalCount(db)
  console.error(`[v4:${slug}] parts catalogue starts with ${dbStart} entries`)

  const candidates = extractPartCandidates(modules)
  console.error(`[v4:${slug}] extracted ${candidates.length} part candidates from modules`)

  const t0 = Date.now()
  const { verifications, stats } = await cascadeVerify(candidates, {
    apiKey: OR_KEY,
    projectId: `iter-64-${slug}-v4`,
  })
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  console.error(`\n[v4:${slug}] === CASCADE STATS ===`)
  console.error(`[v4:${slug}]   total candidates:     ${stats.total}`)
  console.error(`[v4:${slug}]   phase 0 db hits:      ${stats.db_hits}`)
  console.error(`[v4:${slug}]   phase 1 digikey:      ${stats.digikey_hits}`)
  console.error(`[v4:${slug}]   phase 2 farnell:      ${stats.farnell_hits}`)
  console.error(`[v4:${slug}]   phase 3 mouser:       ${stats.mouser_hits}`)
  console.error(`[v4:${slug}]   phase 4 brave:        ${stats.brave_hits}`)
  console.error(`[v4:${slug}]   phase 5 tavily:       ${stats.tavily_hits}`)
  console.error(`[v4:${slug}]   phase 7 uncertain:    ${stats.uncertain}`)
  console.error(`[v4:${slug}]   duration:             ${elapsed}s`)
  console.error(`[v4:${slug}]   parts catalogue NOW:  ${totalCount(db)} entries (was ${dbStart}, added ${totalCount(db) - dbStart})`)

  writeFileSync(resolve(outContainer, '10-part-verifications.json'), JSON.stringify(verifications, null, 2))

  const stripResult = stripUnverifiedParts(modules, verifications)
  console.error(`\n[v4:${slug}] stripping ${stripResult.stripped} unverified high-confidence parts`)
  const stripDetails = stripResult.details.map(d => ({
    ...d,
    technical_summary: buildTechnicalSummary(modules, d.word_id.split('::')[0], d.word_id.split('::')[1], d.word_id.split('::')[2] ?? '?'),
  }))
  const partRecommendations = await recommendReplacementsForStripped(stripDetails, OR_KEY, { batchSize: 5 })
  const recsWithUrl = partRecommendations.filter(r => r.source_url).length
  console.error(`[v4:${slug}] recommendations: ${partRecommendations.length} (${recsWithUrl} with URL after HEAD-check)`)
  writeFileSync(resolve(outContainer, '11-recommendations.json'), JSON.stringify(partRecommendations, null, 2))

  const critique = await runPhysicsCritic({
    modules,
    brief: state.parsedBrief,
    keyMetrics: state.keyMetrics,
    partSummary: { total: verifications.length, verified: verifications.filter(v => v.status === 'verified').length, stripped: stripResult.stripped },
    decisions: state.designDecisions,
    productClass,
    apiKey: OR_KEY,
  }).catch(() => null)

  // P4 defensive cleanup (2026-05-18): compute partVerificationSummary from
  // the LIVE verifications array immediately before persisting state. The
  // script does not mutate `verifications` after this point, so the write is
  // already consistent — but factoring the computation out makes the
  // invariant explicit and prevents future regressions where someone appends
  // to `verifications` (e.g. an Engine B price-estimate pass) after the
  // summary block is built.
  //
  // DRIFT GOTCHA (recurring class of bug — see
  // ~/.claude/projects/-Users-tristanfischer/memory/MEMORY.md):
  // Downstream producers like scripts/estimate-missing-prices.tsx mutate
  // state.partVerifications (push + Object.assign) and write state.json
  // WITHOUT recomputing partVerificationSummary. The renderer
  // (scripts/render-minimal-pdf.tsx line ~2843) recomputes the summary at
  // render time to mask this drift — that recompute is the AUTHORITATIVE
  // source of summary numbers in the PDF. Any tool that reads
  // state.partVerificationSummary directly (without going through the
  // renderer) WILL see stale numbers when an Engine B pass has appended
  // rows after this retro script ran. Treat the renderer-side recompute as
  // the contract; this snapshot is best-effort.
  const buildPartVerificationSummary = (verifs: typeof verifications) => ({
    total: verifs.length,
    verified: verifs.filter(v => v.status === 'verified').length,
    uncertain: verifs.filter(v => v.status === 'uncertain').length,
    stripped: stripResult.stripped,
    recommendations_total: partRecommendations.length,
    recommendations_with_url: recsWithUrl,
    cascade_stats: stats,
  })

  const newState = {
    ...state,
    partVerifications: verifications,
    partRecommendations,
    partVerificationSummary: buildPartVerificationSummary(verifications),
    physicsCritique: critique,
    savedAt: new Date().toISOString(),
  }
  const newStatePath = resolve(outContainer, 'state.json')
  writeFileSync(newStatePath, JSON.stringify(newState, null, 2))
  console.error(`[v4:${slug}] state saved to ${newStatePath}`)

  const pdfPath = resolve(outContainer, 'chain-v2.pdf')
  console.error(`[v4:${slug}] rendering...`)
  execFileSync('npx', ['tsx', resolve(__dirname, 'render-minimal-pdf.tsx'), newStatePath, pdfPath], {
    stdio: 'inherit',
    cwd: resolve(__dirname, '..'),
  })
  console.error(`\n[v4:${slug}] === DONE ===  pdf: ${pdfPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })
