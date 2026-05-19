#!/usr/bin/env npx tsx
/**
 * test-second-brief-prompt.ts — verify that AFTER a first brief seeds the
 * accumulation tables, a SECOND brief's emitter user content actually
 * carries the prior-confirmed entries.
 *
 * Why this matters: the brief's verification step 3 asks for confirmation
 * that "the second-brief prompt actually receives the accumulated entries
 * (log excerpt)". We can't fake-dispatch a live LLM here (£10 cap +
 * 90 min cap don't allow it), but we CAN call buildAccumulatedPromptBlock
 * directly with the test slug after seeding it — that's exactly the
 * string that Stage 1.7 splices into baseUserContent.
 *
 * Strategy:
 *   1. Seed the accumulation tables with 5 runs of the heatpump data
 *      (taking seen_count to MIN_INJECTION_SEEN_COUNT).
 *   2. Call buildAccumulatedPromptBlock(slug) — exactly what
 *      runMultiEmitterModuleDecomposition does at the top of its dispatch.
 *   3. Assert the returned block is non-empty AND contains the canonical
 *      heatpump sub-modules.
 *   4. Clean up test rows.
 */
import { readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import {
  ensureAccumulationTables,
  persistConsensusFromSynthesis,
  buildAccumulatedPromptBlock,
  MIN_INJECTION_SEEN_COUNT,
  type EmitterOutputLike,
} from './persist-emitted-modules'

const FORGE_TRUTH_DB = '/Users/tristanfischer/.forge-truth/forge-truth.db'
const TEST_BRIEF = '/tmp/test-heatpump-enriched-v3.json'
const TEST_CLASS_SLUG = 'heat_pump_2brief_test_2026_05_18'

function runSqlite(sql: string): string {
  return execFileSync('sqlite3', [FORGE_TRUTH_DB, sql], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
}

function cleanup() {
  try {
    runSqlite(`DELETE FROM class_priors_accumulation WHERE class_slug='${TEST_CLASS_SLUG}'`)
    runSqlite(`DELETE FROM class_connections_accumulation WHERE class_slug='${TEST_CLASS_SLUG}'`)
  } catch {}
}

function buildEmitters(): EmitterOutputLike[] {
  const raw = JSON.parse(readFileSync(TEST_BRIEF, 'utf-8'))
  const md = raw.moduleDecomposition
  const canonical = {
    product_class: 'heat_pump',
    modules: md.modules,
    cross_module_grammar_links: md.cross_module_grammar_links,
  }
  // 6 identical emitters → maximum consensus
  return Array.from({ length: 6 }, (_, i) => ({
    ok: true,
    model: `synthetic_emitter_${i}`,
    data: canonical,
  }))
}

async function main() {
  ensureAccumulationTables()
  cleanup()

  console.log('=== FIRST-BRIEF prompt block (pre-seed, should be EMPTY) ===')
  const blockBefore = buildAccumulatedPromptBlock(TEST_CLASS_SLUG)
  console.log(`block.length = ${blockBefore.length}`)
  console.log(`expected: 0`)
  if (blockBefore.length !== 0) {
    console.error('[FAIL] first-brief block should be empty before seeding')
    cleanup()
    process.exit(1)
  }
  console.log('[OK] pre-seed block is empty')
  console.log()

  console.log(`=== SEEDING ${MIN_INJECTION_SEEN_COUNT} runs of heatpump consensus data ===`)
  const emitters = buildEmitters()
  for (let i = 0; i < MIN_INJECTION_SEEN_COUNT; i++) {
    persistConsensusFromSynthesis(TEST_CLASS_SLUG, emitters, `heatpump brief seed ${i+1}`)
  }
  console.log(`seeded ${MIN_INJECTION_SEEN_COUNT} runs.`)
  console.log()

  console.log('=== SECOND-BRIEF prompt block (post-seed) ===')
  const blockAfter = buildAccumulatedPromptBlock(TEST_CLASS_SLUG)
  console.log(`block.length = ${blockAfter.length}`)
  console.log()

  // Show full block (this is the log excerpt the brief asked for)
  console.log('--- VERBATIM BLOCK START ---')
  console.log(blockAfter)
  console.log('--- VERBATIM BLOCK END ---')
  console.log()

  // ── Sanity assertions ─────────────────────────────────────────────────
  const checks = [
    ['compressor_assembly', 'canonical heatpump sub-module'],
    ['evaporator_coil', 'canonical heatpump sub-module'],
    ['condenser_bphe', 'canonical heatpump sub-module'],
    ['energy_conversion_transduction', 'canonical module name'],
    ['PRIOR-CONFIRMED REGISTRY ENTRIES', 'block header'],
    ['Emit these by default', 'block instruction'],
    ['Cross-module connections', 'cross-link section header'],
    ['refrigerant_line', 'canonical heatpump connection mechanism'],
  ]
  let ok = true
  for (const [needle, label] of checks) {
    const hit = blockAfter.includes(needle)
    console.log(`  [${hit ? 'OK' : 'FAIL'}] block contains "${needle}" (${label})`)
    if (!hit) ok = false
  }

  cleanup()
  console.log()
  if (ok) {
    console.log('✓ SECOND-BRIEF PROMPT BLOCK CONTAINS ALL EXPECTED ACCUMULATED ENTRIES')
    process.exit(0)
  } else {
    console.error('✗ second-brief block missing expected entries')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('FATAL:', err)
  cleanup()
  process.exit(2)
})
