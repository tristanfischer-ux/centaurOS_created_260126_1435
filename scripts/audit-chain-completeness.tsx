#!/usr/bin/env tsx
/**
 * @file scripts/audit-chain-completeness.tsx
 *
 * Stage-by-stage health check for a serial-design-chain-v2 run. Reads
 * `actions.jsonl` + `state.json` from a given run directory and reports:
 *   - which expected steps fired
 *   - which were missing (silent drop in the pipeline)
 *   - which fired but with ok=false (logged error)
 *   - which top-level state.json keys ended up populated
 *
 * Drift-prevention companion to `scripts/diagnose-run.tsx`. The diagnostic
 * CLI shows the timeline; this one validates that EVERY expected stage of
 * the chain is reachable, ran, and produced the expected output keys.
 *
 * Why this exists (2026-05-19): a 6-seat unanimous council confirmed that
 * stage work was landing in dead code while the production chain bypassed
 * it. This script makes that class of drift visible at a glance — run it
 * after every pipeline session and after every chain modification.
 *
 * Usage:
 *   npx tsx scripts/audit-chain-completeness.tsx <run-dir>
 *   npx tsx scripts/audit-chain-completeness.tsx <run-dir> --json
 *
 * Exit code: 0 if all expected stages fired with ok!=false AND all expected
 * state keys are present. 1 if any drift detected.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Expected step names emitted by serial-design-chain-v2.tsx logAction() calls.
// Kept in execution order. When the chain changes, this list MUST update
// (the audit will fail loudly if a step disappears, surfacing the drift).
//
// Some steps are CONDITIONAL — they only fire on certain paths. Marked
// optional below. The auditor treats missing optional steps as INFO, not FAIL.
type StepSpec = {
  name: string
  optional?: boolean
  notes?: string
}
const EXPECTED_STEPS: StepSpec[] = [
  { name: 'init' },
  { name: 'brief_parsing' },
  { name: 'parse_brief' },
  { name: 'classify' },
  { name: 'brief_plausibility_iter0' },
  { name: 'brief_rewrite_iter0', optional: true, notes: 'fires only when iter0 found revisions' },
  { name: 're_parse_brief_iter1', optional: true, notes: 'fires only after rewrite' },
  { name: 'brief_plausibility_iter1', optional: true, notes: 'fires only after rewrite' },
  { name: 'brief_block' },
  { name: 'physics_ledger', notes: 'G0 deterministic — added 2026-05-19 (Task #253)' },
  { name: 'research' },
  { name: 'generator' },
  { name: 'propagate_constraints' },
  { name: 'STEP 5: R1 Grok 4.3' },
  { name: 'STEP 6: R2 GLM-5.1' },
  { name: 'STEP 7: R3 Qwen 3.6 Max' },
  { name: 'physics_critic' },
  { name: 'STEP 8: R4 Flash-Lite review' },
  { name: 'modifier_dedup_pre_phase2' },
  { name: 'submodule_prose_pre_phase2' },
  { name: 'canonical_product_class_override', notes: 'force LLM variant → deterministic canonical (Task #254)' },
  { name: 'phase2_iter_0' },
  { name: 'post_phase2_normalise' },
  { name: 'k10_shadow', notes: 'K10 — added 2026-05-19 (Task #252)' },
  { name: 'derive_headline' },
  { name: 'part_verification' },
  { name: 'design_decisions' },
  { name: 'structural_gate_routing', optional: true, notes: 'fires when unrepaired gates present' },
  { name: 'save_state' },
  { name: 'engine_b_estimate_prices' },
  { name: 'engine_c_reference_anchor' },
  { name: 'deployment_envelope', notes: 'wired 2026-05-19 (Task #248)' },
  { name: 'render' },
]

// State.json top-level keys that should exist on a successful run.
type StateKeySpec = {
  key: string
  optional?: boolean
  populated_when?: string
}
const EXPECTED_STATE_KEYS: StateKeySpec[] = [
  { key: 'projectId' },
  { key: 'parsedBrief' },
  { key: 'moduleDecomposition' },
  { key: 'naturalLanguageLayer' },
  { key: 'briefOverviewProse' },
  { key: 'keyMetrics' },
  { key: 'brief' },
  { key: 'designDecisions' },
  { key: 'partVerifications' },
  { key: 'partRecommendations' },
  { key: 'partVerificationSummary' },
  { key: 'physicsCritique' },
  { key: 'physicsLedger', populated_when: 'G0 runs (Task #253)' },
  { key: 'acceptanceStatus' },
  { key: 'engine_c_summary' },
  { key: 'deploymentEnvelope', populated_when: 'product_class has envelope mapping' },
]

// Nested keys we additionally check.
const EXPECTED_NESTED_KEYS: Array<{ path: string; populated_when?: string }> = [
  { path: 'moduleDecomposition.product_class' },
  { path: 'moduleDecomposition.modules' },
  { path: 'moduleDecomposition.cross_module_grammar_links' },
  { path: 'moduleDecomposition.k10ShadowResult', populated_when: 'K10 runs (Task #252)' },
]

type Action = { step_name?: string; step?: string; action_type?: string; ok?: boolean; error?: string }

function readActions(runDir: string): Action[] {
  const p = resolve(runDir, 'actions.jsonl')
  if (!existsSync(p)) return []
  const text = readFileSync(p, 'utf-8')
  const out: Action[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line)) } catch { /* skip malformed */ }
  }
  return out
}

function readState(runDir: string): any | null {
  const p = resolve(runDir, 'state.json')
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf-8'))
}

function actionMatchesStep(a: Action, stepName: string): boolean {
  return a.step_name === stepName || a.step === stepName
}

function getNested(obj: any, dotPath: string): any {
  return dotPath.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj)
}

function main() {
  const args = process.argv.slice(2)
  const runDir = args[0]
  const jsonOut = args.includes('--json')
  if (!runDir) {
    console.error('usage: npx tsx scripts/audit-chain-completeness.tsx <run-dir> [--json]')
    process.exit(2)
  }
  if (!existsSync(runDir)) {
    console.error(`run-dir not found: ${runDir}`)
    process.exit(2)
  }
  const actions = readActions(runDir)
  const state = readState(runDir)

  const stepReport: Array<{ name: string; status: 'fired' | 'missing' | 'failed'; optional: boolean; notes?: string; error?: string }> = []
  let stepFails = 0
  for (const spec of EXPECTED_STEPS) {
    const hit = actions.find(a => actionMatchesStep(a, spec.name))
    if (!hit) {
      stepReport.push({ name: spec.name, status: 'missing', optional: !!spec.optional, notes: spec.notes })
      if (!spec.optional) stepFails++
      continue
    }
    if (hit.ok === false) {
      stepReport.push({ name: spec.name, status: 'failed', optional: !!spec.optional, notes: spec.notes, error: hit.error })
      stepFails++
      continue
    }
    stepReport.push({ name: spec.name, status: 'fired', optional: !!spec.optional, notes: spec.notes })
  }

  const stateKeyReport: Array<{ key: string; populated: boolean; populated_when?: string }> = []
  let stateKeyFails = 0
  for (const spec of EXPECTED_STATE_KEYS) {
    const v = state == null ? undefined : state[spec.key]
    const populated = v !== undefined && v !== null
    stateKeyReport.push({ key: spec.key, populated, populated_when: spec.populated_when })
    if (!populated && !spec.optional) stateKeyFails++
  }

  const nestedReport: Array<{ path: string; populated: boolean; populated_when?: string }> = []
  for (const spec of EXPECTED_NESTED_KEYS) {
    const v = state == null ? undefined : getNested(state, spec.path)
    const populated = v !== undefined && v !== null
    nestedReport.push({ path: spec.path, populated, populated_when: spec.populated_when })
    if (!populated) stateKeyFails++
  }

  const overall = stepFails === 0 && stateKeyFails === 0 ? 'PASS' : 'FAIL'

  if (jsonOut) {
    console.log(JSON.stringify({ runDir, overall, stepFails, stateKeyFails, steps: stepReport, stateKeys: stateKeyReport, nestedKeys: nestedReport }, null, 2))
    process.exit(overall === 'PASS' ? 0 : 1)
  }

  // Human-readable report.
  console.log('═'.repeat(78))
  console.log(`ForgeOS chain completeness audit — ${runDir}`)
  console.log('═'.repeat(78))
  console.log()
  console.log('── STAGES (expected in serial-design-chain-v2.tsx) ──────────────────────────')
  for (const s of stepReport) {
    const mark = s.status === 'fired' ? '✓ FIRED ' : s.status === 'failed' ? '✗ FAILED' : (s.optional ? '○ MISSING (optional)' : '✗ MISSING')
    const tag = s.optional ? ' (optional)' : ''
    console.log(`  ${mark.padEnd(20)} ${s.name}${tag}`)
    if (s.notes) console.log(`                      └─ ${s.notes}`)
    if (s.error) console.log(`                      └─ error: ${s.error}`)
  }
  console.log()
  console.log('── STATE.JSON TOP-LEVEL KEYS ────────────────────────────────────────────────')
  for (const k of stateKeyReport) {
    const mark = k.populated ? '✓' : '✗'
    const tag = k.populated_when ? ` (${k.populated_when})` : ''
    console.log(`  ${mark} ${k.key}${tag}`)
  }
  console.log()
  console.log('── STATE.JSON NESTED KEYS ───────────────────────────────────────────────────')
  for (const k of nestedReport) {
    const mark = k.populated ? '✓' : '✗'
    const tag = k.populated_when ? ` (${k.populated_when})` : ''
    console.log(`  ${mark} ${k.path}${tag}`)
  }
  console.log()
  console.log('─'.repeat(78))
  console.log(`OVERALL: ${overall}  (step fails: ${stepFails}, state-key fails: ${stateKeyFails})`)
  console.log('─'.repeat(78))
  process.exit(overall === 'PASS' ? 0 : 1)
}

main()
