#!/usr/bin/env npx tsx
/**
 * Direct grammar test — bypasses LLM stages.
 * Builds a minimal ResolvedRadicalTree for BESS and runs Phase 4 grammar directly.
 * Verifies: 6 rules fire, 5 PASS + 1 WARN (voltage derate on LFP cell).
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

try {
  const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
  for (const line of env.split('\n')) {
    const t = line.trim()
    if (t && !t.startsWith('#') && t.includes('=')) {
      const [k, ...v] = t.split('=')
      if (!process.env[k]) process.env[k] = v.join('=').replace(/^["']|["']$/g, '')
    }
  }
} catch {}

process.env.RADICAL_PHASE_4_GRAMMAR = 'true'

import { runRadicalGrammar } from '../stages/4d-radical-grammar.js'
import type { ResolvedRadicalTree } from '../stages/4b-radical-resolution.js'

// Minimal BESS resolved tree — exact same component mix as demo grammar-pass
const mockResolvedTree: ResolvedRadicalTree = {
  radical_spec_version: '1.0.0',
  composition: {
    id: 'bess_test',
    description: 'BESS test composition',
    root: {
      archetypeId: 'bess_system',
      quantity: 1,
      children: [
        { archetypeId: 'lfp_prismatic_cell', quantity: 2016, children: [] },
        { archetypeId: 'dc_contactor', quantity: 10, children: [] },
        {
          archetypeId: 'copper_busbar', quantity: 5,
          electricalNode: { nodeId: 'dc_busbar_main', current_in_A: 2000, current_out_A: 2000 },
          children: [],
        },
        { archetypeId: 'liquid_cooling_system', quantity: 1, children: [] },
        { archetypeId: 'steel_rack_frame', quantity: 4, children: [] },
        { archetypeId: 'transformer', quantity: 1, children: [] },
      ],
    },
    environment: ['industrial'],
  },
  resolution_meta: {
    product_class: 'energy_storage',
    distributor_priority: 'industrial',
    distributor_calls_made: 0,
    resolved_at: new Date().toISOString(),
    stats: {
      total_leaves: 6,
      verified_by_distributor: 0,
      from_vendor_catalog: 0,
      from_llm_estimate: 0,
      grade_d: 6,
      stub: 0,
      data_gap: 0,
      distributor_calls_made: 0,
    },
  },
}

console.log('\n══════════════════════════════════════════════════════════')
console.log(' Phase 4 Grammar Direct Test (BESS, no LLM)')
console.log('══════════════════════════════════════════════════════════')

const result = runRadicalGrammar(mockResolvedTree)

console.log('\n═══ Result Summary ═══')
console.log('Overall verdict:', result.overall_verdict)
console.log(`Rules fired: ${result.rules_fired} | PASS: ${result.pass_count} | WARN: ${result.warn_count} | BLOCK: ${result.block_count}`)
console.log('Relaxations applied:', result.relaxations_applied)

for (const v of result.verdicts) {
  const mark = v.verdict === 'PASS' ? '✓' : v.verdict === 'WARN' ? '⚠' : '✗'
  const relaxed = v.relaxed ? ' [RELAXED]' : ''
  console.log(`  ${mark} [${v.verdict}]${relaxed} ${v.rule_id}: ${v.reason.slice(0, 120)}`)
  if (v.affected_nodes.length > 0) {
    console.log(`    Affected: ${v.affected_nodes.join(', ')}`)
  }
}

// ── Assertions ────────────────────────────────────────────────────────────────
let failures = 0

if (result.rules_fired !== 6) {
  console.error(`\nFAIL: Expected 6 rules fired, got ${result.rules_fired}`)
  failures++
}

const warnRules = result.verdicts.filter(v => v.verdict === 'WARN').map(v => v.rule_id)
if (result.warn_count < 1) {
  console.error(`\nFAIL: Expected at least 1 WARN (voltage derate), got 0`)
  console.error('  Check: lfp_prismatic_cell voltage_rated_V/voltage_operating_V in grammar library')
  failures++
} else {
  console.log(`\n✓ WARN detected on: ${warnRules.join(', ')}`)
}

if (result.block_count !== 0) {
  console.error(`\nFAIL: Expected 0 BLOCKs (not marine), got ${result.block_count}`)
  failures++
}

const lfpWarn = result.verdicts.find(v => v.rule_id === 'voltage_derate_80pct' && v.verdict === 'WARN')
if (!lfpWarn) {
  console.error('\nFAIL: Expected voltage_derate_80pct WARN on lfp_prismatic_cell (87.7% of rated)')
  failures++
} else {
  console.log('✓ voltage_derate_80pct WARN confirmed (LFP at 3.2/3.65 = 87.7% — expected)')
}

const kclPass = result.verdicts.find(v => v.rule_id === 'KCL_node_balance' && v.verdict === 'PASS')
if (!kclPass) {
  console.error('\nFAIL: Expected KCL_node_balance PASS (balanced DC busbar)')
  failures++
} else {
  console.log('✓ KCL PASS confirmed (dc_busbar_main: 2000A in = 2000A out)')
}

console.log('\n' + '═'.repeat(58))
if (failures === 0) {
  console.log('PHASE 4 GRAMMAR DIRECT TEST: PASS')
} else {
  console.log(`PHASE 4 GRAMMAR DIRECT TEST: FAIL (${failures} assertion(s) failed)`)
}
console.log('═'.repeat(58))

process.exit(failures === 0 ? 0 : 1)
