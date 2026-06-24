/**
 * gate-registry.ts — PROVE-THE-CATCH meta-test (Tristan 2026-06-24).
 *
 * THE RULE: a gate is not real until it proves it CATCHES. "There is a gate" is the letter;
 * "the gate stops a bad dossier and drives a fix" is the INTENT. You can satisfy the letter
 * (a wired function) while failing the intent (it never fires, or fires and ships anyway —
 * Goodhart's law). This file turns the intent into an executable property: every gate declares
 * the exact failure it exists to catch (an ADVERSARIAL input) and must demonstrate that, given
 * that input, its decision FIRES (would block when enforcing). A gate that cannot catch its own
 * adversarial input is decoration — the meta-test FAILS, which mechanically surfaces the
 * "gate you can walk straight through."
 *
 * It also records `enforcedByDefault` per gate: a gate that catches but is SHADOW by default is
 * a walk-through-by-config — reported loudly so the gap is visible, not hidden.
 *
 * Run:  npx tsx scripts/lib/gate-registry.ts --selftest   (exits non-zero if any proven gate
 *       fails to catch its adversarial input). Wired into scripts/verify-engine-guards.sh.
 */
import { computeCostSanity, evaluateCostSanityEnforcement, costSanityEnforceModeFromEnv } from '../../src/lib/pdf-engine-v2/lib/independent-cost-sanity-audit'
import { computeToolArchetypeCoherence, evaluateToolArchetypeEnforcement, toolArchetypeEnforceModeFromEnv } from '../../src/lib/pdf-engine-v2/lib/tool-archetype-coherence-audit'
import { issueIsBlocking, physicsCriticEnforceModeFromEnv } from './physics-critic-enforcement'
import { compareToBenchmark, type BenchmarkExpectation } from './benchmark-expectation'

export interface GateProof {
  code: number
  name: string
  intent: string                 // the exact wrong thing this gate exists to catch
  // returns true iff the gate's decision FIRES (catches + would block when enforcing) on a
  // deliberately BAD adversarial input. Throwing is treated as a failed proof.
  proveCatch: () => boolean
  // is the gate's blocking ON by default, or SHADOW (records but ships) until a flag is set?
  enforcedByDefault: () => boolean
}

// ── the adversarial proofs (each feeds the gate the exact failure it must catch) ───────────
const BENCH_EXP: BenchmarkExpectation = {
  expected_cost: { low_gbp: 750_000, expected_gbp: 1_000_000, high_gbp: 1_300_000, per_output_unit: '£/kWh', basis: '~£300/kWh × 3 MWh' },
  expected_outputs: [{ metric: 'nameplate', value: 3, unit: 'MWh' }],
  expected_bom: [{ item: 'battery cells', typical_pct_of_cost: 55 }],
  expected_sizing: { footprint_m2: 30, volume_m3: 86, envelope: 'one 40-ft ISO container', basis: '40-ft container' },
  required_components: ['power conversion system'], reasoning: 't', model: 'test',
}

export const GATES: GateProof[] = [
  {
    code: 32, name: 'independent-cost-sanity', intent: 'a dossier whose £/output-unit is wildly off the industry band (e.g. a 3 MWh BESS at £2,967/kWh)',
    proveCatch: () => {
      // £8.9M for a 3 MWh BESS → ~£2,967/kWh, far above any band → HIGH → blocks when enforcing
      const st: any = {
        keyMetrics: { product_class: 'bess' },
        parsedBrief: { constraints: { target_performance: { metrics: [{ key_metric: 'usable_energy_mwh', value: 3, unit: 'MWh', category: 'scale' }] } } },
        costStack: { oem_transfer_price_gbp: 8_900_000 },
      }
      const cs = computeCostSanity(st)
      return evaluateCostSanityEnforcement(cs, 'on').shouldExit === true
    },
    enforcedByDefault: () => costSanityEnforceModeFromEnv(undefined) !== 'off',
  },
  {
    code: 33, name: 'physics-critic', intent: 'a part the engine KNOWS will fail (a named part + a concrete failure mode at high confidence)',
    proveCatch: () => {
      const finding: any = {
        severity: 'high', confidence: 'high',
        where: 'design/modules[0]/sub_modules[1]/words[3]',
        issue: 'the MDPE buffer tank is spec\'d for a 120 °C MEA-stripper loop — MDPE max service temperature 60-80 °C, melts 120-130 °C, will lose structural integrity and fail',
      }
      return issueIsBlocking(finding).blocking === true
    },
    enforcedByDefault: () => physicsCriticEnforceModeFromEnv(undefined) !== 'off',
  },
  {
    code: 34, name: 'tool-archetype-coherence', intent: 'a marine/hull worked-calc rendered into a non-marine plant (a stand-in for a missing process tool)',
    proveCatch: () => {
      const st: any = {
        keyMetrics: { product_class: 'co2_mineralisation' },
        toolsUsedPage: { tools: [{ tool_id: 'pressure-vessel:design', label: 'pressure-vessel:design',
          worked: [{ label: 'External hydrostatic pressure', substitution: '29.8 m seawater depth, rho_water=1025 kg/m³' }] }] },
      }
      const res = computeToolArchetypeCoherence(st)
      const dec = evaluateToolArchetypeEnforcement(res, 'on')
      return dec.shouldExit === true || (Array.isArray(res.findings) && res.findings.some((f: any) => f.severity === 'high'))
    },
    enforcedByDefault: () => toolArchetypeEnforceModeFromEnv(undefined) !== 'off',
  },
  {
    code: 36, name: 'generative-benchmark-net', intent: 'a >2.5× divergence between the deterministic engine and an independent top-down expectation',
    proveCatch: () => {
      // £8.9M deterministic vs a £0.75-1.3M envelope → RADICAL → needs_full_check
      const st: any = { costStack: { oem_transfer_price_gbp: 8_900_000 }, keyMetrics: {}, requirementsBom: [] }
      return compareToBenchmark(BENCH_EXP, st).needs_full_check === true
    },
    // the chain wires BENCHMARK_NET_ENFORCING; unset → shadow
    enforcedByDefault: () => !['', '0', 'false', 'no', 'off', 'shadow'].includes(String(process.env.BENCHMARK_NET_ENFORCING || '').toLowerCase()),
  },
]

// Gates in the canonical exit-code table NOT yet covered by an adversarial proof here. Listing
// them keeps the COVERAGE GAP visible (a gate with no proof is unverified — possibly a
// walk-through). Populating a proof for each is the standing work the rule drives.
export const UNPROVEN_GATES: Array<{ code: number; name: string; note: string }> = [
  { code: 10, name: 'audit-pdf-bom', note: 'PDF-gated; skipped in Excel-only default' },
  { code: 11, name: 'layout-overlap', note: 'gateBlock — walk-through unless CHAIN_GATE_ENFORCE' },
  { code: 12, name: 'numeric-drift', note: 'gateBlock — walk-through' },
  { code: 13, name: 'parts-spec', note: 'gateBlock — walk-through' },
  { code: 14, name: 'sizing-vs-design', note: 'gateBlock — walk-through' },
  { code: 15, name: 'slot-mispin', note: 'gateBlock — walk-through' },
  { code: 16, name: 'thermal-derating', note: 'gateBlock — walk-through' },
  { code: 17, name: 'brief-completeness', note: 'gateBlock — walk-through' },
  { code: 18, name: 'cross-page-consistency', note: 'gateBlock — walk-through' },
  { code: 19, name: 'jurisdictional-standards', note: 'gateBlock — walk-through' },
  { code: 20, name: 'fictional-PN', note: 'gateBlock — walk-through' },
  { code: 21, name: 'per-line-price', note: 'gateBlock — walk-through' },
  { code: 22, name: 'engineering-lock', note: 'exit(22) inside a try/catch — can be SWALLOWED' },
  { code: 30, name: 'payload-rating', note: 'downgraded to non-fatal 2026-05-30' },
  { code: 31, name: 'semantic-self-audit', note: 'shadow by default; proof pending' },
  { code: 35, name: 'drawing-gates', note: 'python; shadow by default; proof pending' },
]

function _selftest() {
  let bad = 0
  console.log('── PROVE-THE-CATCH: every gate must catch its own adversarial input ──')
  for (const g of GATES) {
    let caught = false, err = ''
    try { caught = g.proveCatch() } catch (e) { err = (e as Error).message.slice(0, 80) }
    const enf = (() => { try { return g.enforcedByDefault() } catch { return false } })()
    const mark = caught ? '🟢 CATCHES' : '🔴 WALK-THROUGH'
    const dflt = enf ? 'enforced-by-default' : '⚠ SHADOW-by-default (needs its *_ENFORCING flag)'
    console.log(`  ${mark}  gate ${g.code} ${g.name} — ${dflt}${err ? `  [proof error: ${err}]` : ''}`)
    if (!caught) { console.log(`     intent NOT honoured: ${g.intent}`); bad++ }
  }
  console.log(`\n── COVERAGE GAP: ${UNPROVEN_GATES.length} gate(s) have NO adversarial proof yet (unverified) ──`)
  for (const u of UNPROVEN_GATES) console.log(`  ◻ gate ${u.code} ${u.name} — ${u.note}`)
  const proven = GATES.length, total = proven + UNPROVEN_GATES.length
  console.log(`\nproven-to-catch: ${proven}/${total} gates. ${bad === 0 ? 'all proven gates CATCH their adversarial input.' : `${bad} proven gate(s) FAILED to catch — a walk-through regression.`}`)
  console.log(bad === 0 ? 'gate-registry selftest: OK' : 'gate-registry selftest: FAIL')
  if (bad) process.exit(1)
}

if (process.argv.includes('--selftest')) _selftest()
