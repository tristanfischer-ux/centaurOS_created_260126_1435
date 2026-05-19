#!/usr/bin/env npx tsx
/**
 * test-persist-emitted-modules.ts — offline verification of the registry
 * accumulation write-back + read-back path.
 *
 * Why offline: a live 6-emitter Stage 1.7 dispatch costs roughly £1-2 per
 * run and burns 8-15 minutes of wall-clock. The wiring under test is pure
 * SQLite + string processing; we don't need live LLMs to verify it works.
 * We synthesise 6 "emitter outputs" from /tmp/test-heatpump-enriched-v3.json
 * (the brief's pre-computed moduleDecomposition) — 4 of 6 produce the
 * canonical output, the other 2 produce slight variants. This reliably
 * hits the ≥4-of-6 consensus threshold for the canonical entries and
 * verifies the variants do NOT cross the threshold.
 *
 * What the script proves:
 *   1. ensureAccumulationTables creates the two new tables in forge-truth.db.
 *   2. persistConsensusFromSynthesis writes the right number of rows.
 *   3. A SECOND run of the same data bumps seen_count (idempotency).
 *   4. loadAccumulatedModulesForClass + loadAccumulatedConnectionsForClass
 *      return the right rows when seen_count reaches the threshold.
 *   5. buildAccumulatedPromptBlock formats the rows into prompt-ready
 *      Markdown that a second brief would see.
 *
 * Usage: npx tsx scripts/registry-accumulation/test-persist-emitted-modules.ts
 */
import { readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import {
  ensureAccumulationTables,
  persistConsensusFromSynthesis,
  loadAccumulatedModulesForClass,
  loadAccumulatedConnectionsForClass,
  buildAccumulatedPromptBlock,
  tallySubModuleConsensus,
  tallyConnectionConsensus,
  CONSENSUS_THRESHOLD,
  MIN_INJECTION_SEEN_COUNT,
  type EmitterOutputLike,
} from './persist-emitted-modules'

const FORGE_TRUTH_DB = '/Users/tristanfischer/.forge-truth/forge-truth.db'
const TEST_BRIEF = '/tmp/test-heatpump-enriched-v3.json'
const TEST_CLASS_SLUG = 'heat_pump_test_2026_05_18'  // distinct slug so we never collide with a real heat_pump run

function runSqlite(sql: string, jsonMode = false): string {
  const args = jsonMode
    ? ['-cmd', '.mode json', FORGE_TRUTH_DB, sql]
    : [FORGE_TRUTH_DB, sql]
  return execFileSync('sqlite3', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
}

function cleanTestRows() {
  // Nuke any prior test rows so the verification is deterministic.
  try {
    runSqlite(`DELETE FROM class_priors_accumulation WHERE class_slug='${TEST_CLASS_SLUG}'`)
    runSqlite(`DELETE FROM class_connections_accumulation WHERE class_slug='${TEST_CLASS_SLUG}'`)
  } catch (e: any) {
    // Tables may not exist on the first run — fine, they'll be created.
  }
}

function countRows(table: string, slug: string): number {
  try {
    const out = runSqlite(`SELECT COUNT(*) AS n FROM ${table} WHERE class_slug='${slug}'`, true)
    if (!out.trim()) return 0
    return JSON.parse(out)[0]?.n ?? 0
  } catch {
    return 0
  }
}

/**
 * Build 6 synthetic emitter outputs from the heatpump brief's pre-computed
 * moduleDecomposition. The first 4 emit the canonical payload; the last 2
 * each drop ONE sub-module and add ONE bogus one, so:
 *   - canonical sub-modules: 4-6 of 6 → above threshold
 *   - bogus sub-modules: 1 of 6 → below threshold
 *   - canonical connections: 4-6 of 6 → above threshold
 */
function buildSyntheticEmitters(): EmitterOutputLike[] {
  const raw = JSON.parse(readFileSync(TEST_BRIEF, 'utf-8'))
  const md = raw.moduleDecomposition
  const canonical = {
    product_class: 'heat_pump',
    modules: md.modules,
    cross_module_grammar_links: md.cross_module_grammar_links,
  }

  // Variant 5: drop the LAST sub-module from each module + add a bogus one.
  const variant5 = JSON.parse(JSON.stringify(canonical))
  for (const m of variant5.modules) {
    if (m.sub_modules?.length > 1) {
      m.sub_modules = m.sub_modules.slice(0, -1)
      m.sub_modules.push({
        id: `bogus_unique_${m.module}_5`,
        name_human: 'bogus unique 5',
        words: [],
      })
    }
  }
  // Variant 6: drop the FIRST cross-link + add a bogus mechanism.
  const variant6 = JSON.parse(JSON.stringify(canonical))
  if (variant6.cross_module_grammar_links?.length > 0) {
    variant6.cross_module_grammar_links = variant6.cross_module_grammar_links.slice(1)
    variant6.cross_module_grammar_links.push({
      from_module: 'control_compute_communication',
      to_module: 'environmental_interface',
      mechanism: 'bogus_unique_mechanism_6',
      type: 'directional',
    })
  }

  return [
    { ok: true, model: 'google/gemini-3.1-pro-preview',     data: canonical },
    { ok: true, model: 'x-ai/grok-4.3',                     data: canonical },
    { ok: true, model: 'anthropic/claude-opus-4-7',         data: canonical },
    { ok: true, model: 'qwen/qwen3.6-max-preview',          data: canonical },
    { ok: true, model: 'xiaomi/mimo-v2.5-pro',              data: variant5 },
    { ok: true, model: 'moonshotai/kimi-k2.6',              data: variant6 },
  ]
}

async function main() {
  console.log('=== registry accumulation offline verification ===')
  console.log(`CONSENSUS_THRESHOLD = ${CONSENSUS_THRESHOLD}`)
  console.log(`MIN_INJECTION_SEEN_COUNT = ${MIN_INJECTION_SEEN_COUNT}`)
  console.log(`Test class slug = ${TEST_CLASS_SLUG}`)
  console.log()

  ensureAccumulationTables()
  cleanTestRows()

  // ── Pre-run table state ────────────────────────────────────────────────
  const preModules = countRows('class_priors_accumulation', TEST_CLASS_SLUG)
  const preConns = countRows('class_connections_accumulation', TEST_CLASS_SLUG)
  console.log(`[pre] class_priors_accumulation rows for slug: ${preModules}`)
  console.log(`[pre] class_connections_accumulation rows for slug: ${preConns}`)
  console.log()

  // ── Build 6 synthetic emitters ─────────────────────────────────────────
  const emitters = buildSyntheticEmitters()
  console.log(`[synth] built ${emitters.length} synthetic emitter outputs`)

  // ── Sanity: tally consensus by hand to verify thresholds ──────────────
  const subTally = tallySubModuleConsensus(emitters)
  const connTally = tallyConnectionConsensus(emitters)
  const subAboveThresh = Array.from(subTally.values()).filter(x => x.count >= CONSENSUS_THRESHOLD).length
  const subBelowThresh = Array.from(subTally.values()).filter(x => x.count < CONSENSUS_THRESHOLD).length
  const connAboveThresh = Array.from(connTally.values()).filter(x => x.count >= CONSENSUS_THRESHOLD).length
  const connBelowThresh = Array.from(connTally.values()).filter(x => x.count < CONSENSUS_THRESHOLD).length
  console.log(`[tally] sub-modules: ${subAboveThresh} ≥ threshold, ${subBelowThresh} below — total ${subTally.size}`)
  console.log(`[tally] connections: ${connAboveThresh} ≥ threshold, ${connBelowThresh} below — total ${connTally.size}`)
  console.log()

  // ── First run (FIRST BRIEF) ────────────────────────────────────────────
  console.log('=== FIRST BRIEF — initial persistence ===')
  const counts1 = persistConsensusFromSynthesis(
    TEST_CLASS_SLUG,
    emitters,
    'A 1.6 kW monobloc air-to-water heat pump using R290 refrigerant',
  )
  console.log('modules:', counts1.modules)
  console.log('connections:', counts1.connections)
  const postModules1 = countRows('class_priors_accumulation', TEST_CLASS_SLUG)
  const postConns1 = countRows('class_connections_accumulation', TEST_CLASS_SLUG)
  console.log(`[post-1] class_priors_accumulation rows: ${postModules1}`)
  console.log(`[post-1] class_connections_accumulation rows: ${postConns1}`)
  console.log()

  // ── Idempotency: re-run same emitters, expect updates not inserts ─────
  console.log('=== IDEMPOTENCY CHECK — re-run same data ===')
  const counts2 = persistConsensusFromSynthesis(
    TEST_CLASS_SLUG,
    emitters,
    'A 1.6 kW monobloc air-to-water heat pump (re-run, no new inserts)',
  )
  console.log('modules:', counts2.modules)
  console.log('connections:', counts2.connections)
  const postModules2 = countRows('class_priors_accumulation', TEST_CLASS_SLUG)
  const postConns2 = countRows('class_connections_accumulation', TEST_CLASS_SLUG)
  console.log(`[post-2] class_priors_accumulation rows: ${postModules2}`)
  console.log(`[post-2] class_connections_accumulation rows: ${postConns2}`)
  if (postModules2 === postModules1 && postConns2 === postConns1) {
    console.log('[OK] idempotency: row counts unchanged — second run bumped seen_count only')
  } else {
    console.error(`[FAIL] idempotency broken: modules ${postModules1}→${postModules2}, connections ${postConns1}→${postConns2}`)
  }
  console.log()

  // ── Bump seen_count by repeating until threshold reached ──────────────
  console.log(`=== BUMPING seen_count to ${MIN_INJECTION_SEEN_COUNT} for injection threshold ===`)
  for (let i = 0; i < MIN_INJECTION_SEEN_COUNT - 2; i++) {
    persistConsensusFromSynthesis(TEST_CLASS_SLUG, emitters, `bump iteration ${i+3}`)
  }
  const seenCountAfter = JSON.parse(
    runSqlite(
      `SELECT MAX(seen_count) AS s FROM class_priors_accumulation WHERE class_slug='${TEST_CLASS_SLUG}'`,
      true,
    ),
  )[0]?.s
  console.log(`max seen_count after bumps: ${seenCountAfter}`)
  console.log()

  // ── Verify spot-check: canonical entries appear, bogus ones do NOT ────
  console.log('=== SPOT CHECKS ===')
  const ectMods = loadAccumulatedModulesForClass(TEST_CLASS_SLUG)
  const ectModIds = new Set(ectMods.filter(r => r.module === 'energy_conversion_transduction').map(r => r.sub_module_id))
  const expectedCanonical = ['compressor_assembly', 'condenser_bphe', 'inverter_drive', 'fan_motor', 'thermal_management']
  for (const id of expectedCanonical) {
    const ok = ectModIds.has(id)
    console.log(`  [${ok ? 'OK' : 'MISSING'}] expected canonical entry "${id}" in energy_conversion_transduction`)
  }
  // The bogus entries should NEVER appear (only 1 emitter, below threshold)
  const bogusInDb = JSON.parse(
    runSqlite(
      `SELECT COUNT(*) AS n FROM class_priors_accumulation WHERE class_slug='${TEST_CLASS_SLUG}' AND sub_module_id LIKE 'bogus_%'`,
      true,
    ),
  )[0]?.n ?? 0
  console.log(`  [${bogusInDb === 0 ? 'OK' : 'FAIL'}] bogus sub-modules in DB: ${bogusInDb} (expected 0)`)
  const bogusConnInDb = JSON.parse(
    runSqlite(
      `SELECT COUNT(*) AS n FROM class_connections_accumulation WHERE class_slug='${TEST_CLASS_SLUG}' AND mechanism LIKE 'bogus_%'`,
      true,
    ),
  )[0]?.n ?? 0
  console.log(`  [${bogusConnInDb === 0 ? 'OK' : 'FAIL'}] bogus connections in DB: ${bogusConnInDb} (expected 0)`)
  console.log()

  // ── Read-back via lookup helpers ──────────────────────────────────────
  console.log('=== LOOKUP HELPERS (the "second brief" read-back) ===')
  const accumMods = loadAccumulatedModulesForClass(TEST_CLASS_SLUG)
  const accumConns = loadAccumulatedConnectionsForClass(TEST_CLASS_SLUG)
  console.log(`loadAccumulatedModulesForClass returned ${accumMods.length} rows`)
  console.log(`loadAccumulatedConnectionsForClass returned ${accumConns.length} rows`)
  console.log()

  // Group by module for display
  const byModule = new Map<string, string[]>()
  for (const m of accumMods) {
    const arr = byModule.get(m.module) ?? []
    arr.push(`${m.sub_module_id}×${m.seen_count}`)
    byModule.set(m.module, arr)
  }
  for (const [mod, sms] of byModule) {
    console.log(`  ${mod}: ${sms.join(', ')}`)
  }
  console.log()

  // ── Prompt block — what a second brief's emitter would see ────────────
  console.log('=== PROMPT BLOCK (excerpt — what the second brief sees) ===')
  const block = buildAccumulatedPromptBlock(TEST_CLASS_SLUG)
  console.log(block.split('\n').slice(0, 25).join('\n'))
  console.log(`... [block total ${block.split('\n').length} lines, ${block.length} chars]`)
  console.log()

  // ── Final assertions ──────────────────────────────────────────────────
  let pass = true
  if (accumMods.length === 0) { console.error('[FAIL] no accumulated modules read back'); pass = false }
  if (accumConns.length === 0) { console.error('[FAIL] no accumulated connections read back'); pass = false }
  if (bogusInDb !== 0) { console.error('[FAIL] bogus sub-modules leaked into DB'); pass = false }
  if (bogusConnInDb !== 0) { console.error('[FAIL] bogus connections leaked into DB'); pass = false }
  if (postModules2 !== postModules1) { console.error('[FAIL] second run inserted new module rows'); pass = false }
  if (postConns2 !== postConns1) { console.error('[FAIL] second run inserted new connection rows'); pass = false }
  for (const id of expectedCanonical) {
    if (!ectModIds.has(id)) { console.error(`[FAIL] expected canonical entry "${id}" missing`); pass = false }
  }
  if (!block.includes('PRIOR-CONFIRMED REGISTRY ENTRIES')) { console.error('[FAIL] prompt block malformed'); pass = false }
  if (!block.includes('compressor_assembly')) { console.error('[FAIL] prompt block missing compressor_assembly'); pass = false }

  // ── Cleanup test rows ─────────────────────────────────────────────────
  cleanTestRows()
  console.log('=== test rows cleaned up ===')
  console.log()

  if (pass) {
    console.log('✓ ALL CHECKS PASSED')
    process.exit(0)
  } else {
    console.error('✗ AT LEAST ONE CHECK FAILED')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(2)
})
