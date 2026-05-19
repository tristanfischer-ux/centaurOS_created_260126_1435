#!/usr/bin/env node
/**
 * @file radical/demo/run-demo.ts
 *
 * BESS Radical Architecture — End-to-End Demo Runner
 *
 * Runs: resolution → grammar pass → cost rollup → BOM render → distributor CSV export
 *
 * Usage:
 *   cd "/Users/tristanfischer/Developer/CentaurOS created 260126 1435"
 *   MOUSER_API_KEY=... DIGIKEY_CLIENT_ID=... DIGIKEY_CLIENT_SECRET=... FARNELL_API_KEY=... \
 *     npx tsx src/lib/pdf-engine-v2/radical/demo/run-demo.ts
 *
 * Outputs (written to radical/demo/output/):
 *   bess-bom.md         — Rendered BOM section
 *   mouser-bom.csv      — Mouser BOM upload file
 *   digikey-bom.csv     — Digi-Key BOM import file
 *   farnell-bom.csv     — Farnell BOM upload file
 *   resolution.json     — Full resolution result (debug)
 *   grammar-pass.json   — Grammar engine result (debug)
 *   cost-rollup.json    — Cost rollup result (debug)
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

import { resolveBessTree } from './resolution.js'
import { runBessGrammarPass } from './grammar-pass.js'
import { computeCostRollup, verifyCostRollupSample } from './cost-rollup.js'
import { renderBom } from './render-bom.js'
import { buildAllCsvs, validateCsv } from './distributor-csv.js'

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'
const CYAN = '\x1b[36m'

function ok(msg: string) { console.log(`${GREEN}  PASS${RESET} ${msg}`) }
function warn(msg: string) { console.log(`${YELLOW}  WARN${RESET} ${msg}`) }
function err(msg: string) { console.log(`${RED}  FAIL${RESET} ${msg}`) }
function header(msg: string) { console.log(`\n${BOLD}${CYAN}═══ ${msg} ═══${RESET}`) }
function section(msg: string) { console.log(`\n${BOLD}── ${msg}${RESET}`) }

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n${BOLD}BESS Radical Architecture — End-to-End Demo${RESET}`)
  console.log('='.repeat(60))
  console.log('Radical architecture proof: resolution + grammar + cost-rollup + BOM + CSV')
  console.log('='.repeat(60))

  // ── Output directory ─────────────────────────────────────────────────────
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)
  const outputDir = join(__dirname, 'output')
  mkdirSync(outputDir, { recursive: true })

  // ── Stage 1: Resolution ──────────────────────────────────────────────────
  header('Stage 1: Resolution')
  console.log('Walking BESS tree, querying distributors for electronic/mechanical COTS,')
  console.log('vendor catalog for OEM subsystems...\n')

  const { resolvedLeaves, stats } = await resolveBessTree()

  section('Resolution Stats')
  console.log(`  Total lines:              ${stats.total}`)
  console.log(`  Verified by distributor:  ${stats.verified_by_distributor} (${Math.round(stats.verified_by_distributor / stats.total * 100)}%)`)
  console.log(`  From vendor catalog:      ${stats.from_vendor_catalog} (${Math.round(stats.from_vendor_catalog / stats.total * 100)}%)`)
  console.log(`  Estimated (BOM price):    ${stats.estimated} (${Math.round(stats.estimated / stats.total * 100)}%)`)
  console.log(`  Grade-D (no price):       ${stats.grade_d} (${Math.round(stats.grade_d / stats.total * 100)}%)`)
  console.log(`  Structural stubs:         ${stats.stub} (${Math.round(stats.stub / stats.total * 100)}%)`)
  console.log(`  Distributor API calls:    ${stats.distributor_calls_made}`)

  // Show verified lines
  const verifiedLeaves = resolvedLeaves.filter(l => l.verification_grade === 'verified')
  if (verifiedLeaves.length > 0) {
    section('Verified Lines (distributor hit)')
    for (const l of verifiedLeaves) {
      ok(`Line ${l.line_id}: ${l.name}`)
      console.log(`         MPN: ${l.mpn} | Manufacturer: ${l.manufacturer} | Price: £${l.unit_price_gbp?.toFixed(2) ?? '—'} | Source: ${l.source}`)
    }
  }

  // Save resolution JSON
  writeFileSync(join(outputDir, 'resolution.json'), JSON.stringify({ stats, resolvedLeaves }, null, 2))

  // ── Stage 2: Grammar Pass ────────────────────────────────────────────────
  header('Stage 2: Grammar Pass')
  const grammarPass = runBessGrammarPass(resolvedLeaves)

  section('Grammar Results')
  console.log(`  Rules fired:        ${grammarPass.rulesFired}`)
  console.log(`  PASS:               ${grammarPass.passCount}`)
  console.log(`  WARN:               ${grammarPass.warnCount}`)
  console.log(`  BLOCK:              ${grammarPass.blockCount}`)
  console.log(`  Relaxations:        ${grammarPass.relaxationsApplied}`)
  console.log(`  Overall verdict:    ${grammarPass.engineResult.overallVerdict}`)
  console.log('')

  for (const r of grammarPass.engineResult.ruleResults) {
    const relaxed = r.relaxed ? ' [RELAXED]' : ''
    const colour = r.verdict === 'PASS' ? GREEN : r.verdict === 'WARN' ? YELLOW : RED
    console.log(`  ${colour}${r.verdict}${relaxed}${RESET} ${r.ruleId}`)
    console.log(`       ${r.reason.slice(0, 100)}${r.reason.length > 100 ? '...' : ''}`)
  }

  if (grammarPass.engineResult.relaxationSummary.length > 0) {
    section('Relaxations Applied')
    for (const s of grammarPass.engineResult.relaxationSummary) {
      warn(s.slice(0, 120))
    }
  }

  // Save grammar JSON
  writeFileSync(join(outputDir, 'grammar-pass.json'), JSON.stringify(grammarPass.engineResult, null, 2))

  // ── Stage 3: Cost Rollup ─────────────────────────────────────────────────
  header('Stage 3: Cost Rollup')
  const costRollup = computeCostRollup(resolvedLeaves)

  section('Module Totals')
  for (const word of costRollup.words) {
    console.log(`  ${word.module_label.padEnd(45)} £${word.total_gbp.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).padStart(12)}`)
  }
  console.log(`  ${'─'.repeat(60)}`)
  console.log(`  ${'Subtotal (words)'.padEnd(45)} £${costRollup.sentence.word_subtotal_gbp.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).padStart(12)}`)
  console.log(`  ${'System integration (+25%)'.padEnd(45)} £${costRollup.sentence.sentence_markup_gbp.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).padStart(12)}`)
  console.log(`  ${BOLD}${'SYSTEM TOTAL'.padEnd(45)} £${costRollup.sentence.total_gbp.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).padStart(12)}${RESET}`)

  section('Top 3 Cost Drivers')
  for (const driver of costRollup.sentence.top_cost_drivers) {
    console.log(`  ${driver.pct_of_system.toFixed(1).padStart(5)}%  ${driver.name} — £${driver.total_gbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`)
  }

  section('Cost Math Verification (sample 3 nodes + 1 module)')
  const mathChecks = verifyCostRollupSample(costRollup)
  for (const check of mathChecks) {
    if (check.includes('→ PASS')) ok(check)
    else err(check)
  }

  // Save cost JSON
  writeFileSync(join(outputDir, 'cost-rollup.json'), JSON.stringify(costRollup, null, 2))

  // ── Stage 4: Render BOM ──────────────────────────────────────────────────
  header('Stage 4: BOM Render')
  const bomMd = renderBom(resolvedLeaves, grammarPass, costRollup)
  const bomPath = join(outputDir, 'bess-bom.md')
  writeFileSync(bomPath, bomMd)
  const bomLines = bomMd.split('\n').length
  ok(`Rendered BOM: ${bomLines} lines → ${bomPath}`)

  section('BOM Table Sample (first 10 data rows)')
  const bomTableLines = bomMd
    .split('\n')
    .filter(l => l.startsWith('| ') && !l.startsWith('| Field') && !l.startsWith('| Module') && !l.startsWith('| Subtotal') && !l.startsWith('| System') && !l.startsWith('| Rule') && !l.startsWith('| Status'))
    .slice(0, 10)
  for (const line of bomTableLines) {
    console.log(`  ${line}`)
  }

  // ── Stage 5: Distributor CSV ─────────────────────────────────────────────
  header('Stage 5: Distributor CSV Export')
  const { mouser, digikey, farnell } = buildAllCsvs(resolvedLeaves)

  const mousPath = join(outputDir, 'mouser-bom.csv')
  const dkPath = join(outputDir, 'digikey-bom.csv')
  const farPath = join(outputDir, 'farnell-bom.csv')

  writeFileSync(mousPath, mouser)
  writeFileSync(dkPath, digikey)
  writeFileSync(farPath, farnell)

  const mousVal = validateCsv(mouser, 'mouser')
  const dkVal = validateCsv(digikey, 'digikey')
  const farVal = validateCsv(farnell, 'farnell')

  for (const [val, path] of [[mousVal, mousPath], [dkVal, dkPath], [farVal, farPath]] as const) {
    const v = val as typeof mousVal
    const label = `${v.distributor}: ${v.lines} data rows, ${v.header_fields} fields/row — ${v.all_rows_valid ? 'VALID' : 'INVALID'}`
    if (v.all_rows_valid) ok(label)
    else err(`${label} | ${v.error}`)
  }

  // ── Stage 6: Verification ────────────────────────────────────────────────
  header('Stage 6: Verification Checks')

  // V1: BOM has rows with real MPNs from distributor query
  const realMpnRows = resolvedLeaves.filter(
    l => l.mpn !== null && ['mouser', 'digikey', 'farnell', 'lcsc'].includes(l.distributor ?? '')
  )
  if (realMpnRows.length > 0) {
    ok(`V1: BOM has ${realMpnRows.length} row(s) with real MPNs from distributor query`)
    for (const l of realMpnRows.slice(0, 3)) {
      console.log(`     Line ${l.line_id}: MPN=${l.mpn} source=${l.source} url=${l.source_url ?? '—'}`)
    }
  } else {
    warn('V1: No distributor-verified MPNs — all from BOM estimates or vendor catalog')
  }

  // V2: CSVs are valid
  const allCsvsValid = mousVal.all_rows_valid && dkVal.all_rows_valid && farVal.all_rows_valid
  if (allCsvsValid) ok(`V2: All 3 CSV files are valid (parseable)`)
  else err(`V2: CSV validation failed`)

  // V3: Grammar pass produced explicit verdicts
  if (grammarPass.rulesFired > 0 && grammarPass.engineResult.ruleResults.length > 0) {
    ok(`V3: Grammar pass produced ${grammarPass.rulesFired} explicit rule verdicts`)
  } else {
    err('V3: Grammar pass produced no verdicts')
  }

  // V4: Cost rollup math is correct
  const mathPassed = mathChecks.every(c => c.includes('→ PASS'))
  if (mathPassed) ok('V4: Cost rollup math verified (sample 3 nodes + 1 module)')
  else err('V4: Cost rollup math verification failed')

  // ── Final Summary ────────────────────────────────────────────────────────
  header('Demo Complete')
  console.log(`\n${BOLD}Output files:${RESET}`)
  console.log(`  ${bomPath}`)
  console.log(`  ${mousPath}    (${mousVal.lines} lines)`)
  console.log(`  ${dkPath}   (${dkVal.lines} lines)`)
  console.log(`  ${farPath}   (${farVal.lines} lines)`)
  console.log(`  ${join(outputDir, 'resolution.json')}`)
  console.log(`  ${join(outputDir, 'grammar-pass.json')}`)
  console.log(`  ${join(outputDir, 'cost-rollup.json')}`)

  console.log(`\n${BOLD}The Headline:${RESET}`)
  console.log(`  System total: £${costRollup.sentence.total_gbp.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`)
  console.log(`  Grammar: ${grammarPass.engineResult.overallVerdict}`)
  console.log(`  Mouser CSV: ${mousVal.lines} line(s) — ready for BOM upload at mouser.com/bomtool`)

  if (mousVal.lines > 0) {
    console.log(``)
    console.log(`  ${GREEN}${BOLD}MOUSER CSV IS ORDERABLE NOW.${RESET}`)
    console.log(`  Upload ${mousPath}`)
    console.log(`  at https://www.mouser.com/bomtool/ to create a real cart.`)
  } else {
    console.log(``)
    console.log(`  ${YELLOW}Mouser CSV has 0 lines — no Mouser-verified parts this run.${RESET}`)
    console.log(`  (All BESS parts resolved to Digi-Key, vendor catalog, or estimates.)`)
    console.log(`  Upload the Digi-Key CSV at https://www.digikey.co.uk/BOM/ instead.`)
  }

  const allVerifications = [
    realMpnRows.length > 0,
    allCsvsValid,
    grammarPass.rulesFired > 0,
    mathPassed,
  ]
  const verifiedCount = allVerifications.filter(Boolean).length
  const exitCode = verifiedCount === allVerifications.length ? 0 : 1

  console.log(`\n${verifiedCount}/${allVerifications.length} verification checks passed.`)
  process.exit(exitCode)
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
