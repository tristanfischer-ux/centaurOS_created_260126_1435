/**
 * gate-registry.ts — PROVE-THE-CATCH meta-test (Tristan 2026-06-24).
 *
 * THE RULE: a gate is not real until it proves it CATCHES. "There is a gate" is the letter;
 * "the gate stops a bad dossier and drives a fix" is the INTENT. You can satisfy the letter
 * (a wired function) while failing the intent (it never fires, or fires and ships anyway —
 * Goodhart's law). This file turns the intent into an executable property: every gate declares
 * the exact failure it exists to catch (an ADVERSARIAL input) and must demonstrate that, given
 * that input, its decision FIRES. A gate that cannot catch its own adversarial input is
 * decoration — the meta-test FAILS, surfacing the "gate you can walk straight through."
 *
 * It also records `enforcedByDefault` per gate: a gate that catches but is SHADOW / walk-through
 * by default is a walk-through-by-config — reported loudly so the gap is visible.
 *
 * COVERAGE ENFORCEMENT: every code in ALL_GATE_CODES must have a proof here, else the meta-test
 * fails — so a NEW gate cannot be added without a full adversarial proof.
 *
 * Run:  npx tsx scripts/lib/gate-registry.ts --selftest   (in scripts/verify-engine-guards.sh).
 */
import { execFileSync } from 'child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { resolve, join } from 'path'
import { computeCostSanity, evaluateCostSanityEnforcement, costSanityEnforceModeFromEnv } from '../../src/lib/pdf-engine-v2/lib/independent-cost-sanity-audit'
import { computeToolArchetypeCoherence, evaluateToolArchetypeEnforcement, toolArchetypeEnforceModeFromEnv } from '../../src/lib/pdf-engine-v2/lib/tool-archetype-coherence-audit'
import { issueIsBlocking, physicsCriticEnforceModeFromEnv } from './physics-critic-enforcement'
import { compareToBenchmark, type BenchmarkExpectation } from './benchmark-expectation'
import { checkMacroMaterialRate } from '../../src/lib/pdf-engine-v2/lib/material-prices'
import { detectNumericDrift } from './numeric-claim-drift-detector'
import { validateEmittedParts } from './parts-spec-validator'
import { auditSizing } from './sizing-vs-design-audit'
import { detectMisPins } from './slot-mispin-detector'
import { interpolateCoolingCurveKw } from './thermal-derating-audit'
import { auditBriefConstraintCompleteness } from './brief-constraint-completeness-audit'
import { extractOccurrences, cluster, buildFindings } from './cross-page-numeric-consistency-audit'
import { auditJurisdictionalStandards } from './jurisdictional-standards-audit'
import { STRUCTURED_PN_REGEX, CUSTOM_PREFIX_REGEX } from './fictional-pn-audit'
import { libraryOverridesConfirmedMiss } from '../../src/lib/pdf-engine-v2/lib/distributors/db-only-cascade'
import { classifySeverity, classifyLineSeverity, selftestPerLinePriceAudit } from './per-line-price-plausibility-audit'
import { selftestCascadePriceAdoption } from './cascade-price-adoption'
import { missingHardSlots } from '../../src/lib/pdf-engine-v2/lib/engineering-lock-gate'
import { runPayloadRatingAudit } from '../../src/lib/pdf-engine-v2/lib/payload-rating-audit'
import { evaluateSelfAuditEnforcement } from './semantic-self-audit'
import { scanContractForBriefLiterals, selftestContractStrict } from './brief-value-literal-scanner'
import {
  computeStructuralAdmission,
  evaluateStructuralAdmissionEnforcement,
  structuralAdmissionEnforceModeFromEnv,
  selftestStructuralAdmission,
} from './structural-admission-gate'
import {
  computeDesignClosure,
  evaluateDesignClosureEnforcement,
  designClosureEnforceModeFromEnv,
  selftestDesignClosure,
} from './design-closure-gate'

export interface GateProof {
  code: number
  name: string
  intent: string                 // the exact wrong thing this gate exists to catch
  proveCatch: () => boolean      // true iff the gate's decision FIRES on a deliberately BAD input
  enforcedByDefault: () => boolean
}

const REPO = resolve(__dirname, '../..')
const gateBlockEnforced = () => ['1', 'true', 'yes', 'on'].includes(String(process.env.CHAIN_GATE_ENFORCE || '').toLowerCase())
const pySelftestPasses = (rel: string) => {
  try { execFileSync('python3', [resolve(REPO, rel), '--selftest'], { stdio: 'pipe', timeout: 30_000 }); return true }
  catch { return false }
}

/** Drive a Python gate with a deliberately BAD input and assert it BLOCKS.
 *  Stronger than running its --selftest: this proves the gate's decision fires
 *  from the outside, which is what "prove the catch" actually means. */
const pyBlocksOnBadInput = (rel: string, argv: string[], expectExit: number) => {
  try {
    execFileSync('python3', [resolve(REPO, rel), ...argv], { stdio: 'pipe', timeout: 60_000 })
    return false                                  // exited 0 = walked straight through
  } catch (e) {
    return (e as { status?: number }).status === expectExit
  }
}
/** Drive a Python screen in-process and assert its verdict is a BLOCK. */
const pyVerdictBlocks = (code: string) => {
  try {
    const out = execFileSync('python3', ['-c', code], { stdio: 'pipe', timeout: 60_000 }).toString()
    return out.trim().endsWith('BLOCKS')
  } catch { return false }
}

const BENCH_EXP: BenchmarkExpectation = {
  expected_cost: { low_gbp: 750_000, expected_gbp: 1_000_000, high_gbp: 1_300_000, per_output_unit: '£/kWh', basis: '~£300/kWh × 3 MWh' },
  expected_outputs: [{ metric: 'nameplate', value: 3, unit: 'MWh' }],
  expected_bom: [{ item: 'battery cells', typical_pct_of_cost: 55 }],
  expected_sizing: { footprint_m2: 30, volume_m3: 86, envelope: 'one 40-ft ISO container', basis: '40-ft container' },
  required_components: ['power conversion system'], reasoning: 't', model: 'test',
}

export const GATES: GateProof[] = [
  {
    code: 10, name: 'bom-material-rate (B-8)', intent: 'a part priced absurdly high per kg of material (an aluminium part at £180/kg vs ~£17/kg)',
    proveCatch: () => {
      const v: any = checkMacroMaterialRate({ word_name: 'Aluminium enclosure panel', unit_price_gbp: 180, dimension_basis: 'kg_mass', material: 'aluminium' })
      return !!v && v.severity === 'HIGH' && v.factor > 3 && v.direction === 'over'
    },
    enforcedByDefault: () => false, // gate-10 entrypoint needs a PDF; skipped in Excel-only default
  },
  {
    code: 11, name: 'layout-overlap', intent: 'two text spans stacked at the same X+Y in the rendered drawing (a smear)',
    proveCatch: () => pySelftestPasses('scripts/audit-pdf-layout.py'),
    enforcedByDefault: gateBlockEnforced,
  },
  {
    code: 12, name: 'numeric-claim-drift', intent: 'a contract count that diverges >20% from the BoM quantity (313 vs 165)',
    proveCatch: () => {
      const state: any = {
        orchestratorContract: { quantities: { bms_slave_count: { value: 313 } } },
        moduleDecomposition: { modules: [{ module: 'battery_management', sub_modules: [{ id: 'cell_monitoring', words: [{
          id: 'bms_slave_board', name_human: 'Custom 24-channel cell-voltage + temperature board',
          modifier_characters: [{ kind: 'quantity', value: '165x' }] }] }] }] },
      }
      const r = detectNumericDrift(state)
      return Array.isArray(r.findings) && r.findings.some((f: any) => f.severity === 'HIGH' && f.drift_pct > 20)
    },
    enforcedByDefault: gateBlockEnforced,
  },
  {
    code: 13, name: 'parts-spec-validator', intent: 'a pinned part over-claiming a spec ≥1.5× its datasheet (Schaltbau C310 at 1500 A, real 500 A)',
    proveCatch: () => {
      const state: any = { moduleDecomposition: { modules: [{ module: 'dc_switchgear', sub_modules: [{ id: 'dc_distribution', words: [{
        id: 'main_dc_contactor_word', name_human: 'Main DC contactor',
        modifier_characters: [{ kind: 'manufacturer', value: 'Schaltbau' }, { kind: 'part_number', value: 'C310' }, { kind: 'rating_primary', value: '1500 A continuous' }] }] }] }] } }
      const r = validateEmittedParts(state)
      return Array.isArray(r.findings) && r.findings.some((f: any) => f.severity === 'HIGH')
    },
    enforcedByDefault: gateBlockEnforced,
  },
  {
    code: 14, name: 'sizing-vs-design', intent: 'a component rated <50% of the design continuous load (100 A on an 1804 A bus)',
    proveCatch: () => {
      const state: any = {
        moduleDecomposition: { product_class: 'bess', modules: [{ module: 'power_distribution', sub_modules: [{ id: 'dc_distribution', words: [{
          id: 'main_contactor_word', name_human: 'Main DC bus contactor', content_character: { character_id: 'dc_main_contactor' },
          modifier_characters: [{ kind: 'rating_primary', value: '100 A' }] }] }] }] },
        orchestratorContract: { quantities: { bus_continuous_current_a: { value: 1443 } } },
      }
      const r = auditSizing(state)
      return Array.isArray(r.findings) && r.findings.some((f: any) => f.severity === 'HIGH' && f.ratio < 0.5)
    },
    enforcedByDefault: gateBlockEnforced,
  },
  {
    code: 15, name: 'slot-mispin', intent: 'a part of the wrong TYPE for its slot (an Eaton M22 pushbutton pinned as a door switch)',
    proveCatch: () => {
      const state: any = { moduleDecomposition: { product_class: 'bess', modules: [{ module: 'enclosure_safety', sub_modules: [{ id: 'access_control', words: [{
        id: 'door_switch_word', name_human: 'Door position switch', content_character: { character_id: 'door_position' },
        modifier_characters: [{ kind: 'manufacturer', value: 'Eaton' }, { kind: 'part_number', value: 'M22-DL-G' }] }] }] }] } }
      const r = detectMisPins(state)
      return Array.isArray(r.findings) && r.findings.length > 0
    },
    enforcedByDefault: gateBlockEnforced,
  },
  {
    code: 16, name: 'thermal-derating', intent: 'a chiller that derates below 60% of the design load at the brief ambient',
    proveCatch: () => {
      // pure decision driver: 47 kW @ 35°C → 28 kW @ 50°C; design load 40 kW × 1.20 margin = 48 → ratio 0.583 < 0.6
      const derated = interpolateCoolingCurveKw([{ ambient_c: 35, capacity_kw: 47 }, { ambient_c: 50, capacity_kw: 28 }], 50)
      return typeof derated === 'number' && (derated / (40 * 1.20)) < 0.6
    },
    enforcedByDefault: gateBlockEnforced,
  },
  {
    code: 17, name: 'brief-constraint-completeness', intent: 'a hard brief constraint silently absent from the compliance table (a cost ceiling with no cost row)',
    proveCatch: () => {
      const state: any = { parsedBrief: { product_class: 'bess', constraints: { unit_cost_ceiling: { value: 5_000_000, currency: 'GBP' } } } }
      const r = auditBriefConstraintCompleteness(state)
      return Array.isArray(r.findings) && r.findings.some((f: any) => f.severity === 'HIGH')
    },
    enforcedByDefault: gateBlockEnforced,
  },
  {
    code: 18, name: 'cross-page-numeric-consistency', intent: 'two pages quoting different values for one quantity (3.5 vs 2.69 MWh usable energy)',
    proveCatch: () => {
      const p1 = 'The system delivers usable energy capacity of 3.5 MWh to the grid.'
      const p2 = 'Mission: deliver 2.69 MWh of usable energy across the duty cycle.'
      const occ = [...extractOccurrences(p1, 1), ...extractOccurrences(p2, 2)]
      const { findings } = buildFindings(cluster(occ))
      return Array.isArray(findings) && findings.some((f: any) => f.severity === 'HIGH')
    },
    enforcedByDefault: gateBlockEnforced,
  },
  {
    code: 19, name: 'jurisdictional-standards', intent: 'a foreign-jurisdiction standard cited (NEC 706.10 in a UK brief)',
    proveCatch: () => {
      const state: any = { parsedBrief: { country: 'United Kingdom' }, moduleDecomposition: { modules: [{ module: 'energy_conversion', sub_modules: [{
        id: 'step_up_transformer', topology_clause: 'External pad-mount transformer per NEC 706.10 requirements.' }] }] } }
      const r = auditJurisdictionalStandards(state)
      return Array.isArray(r.findings) && r.findings.some((f: any) => f.severity === 'HIGH')
    },
    enforcedByDefault: gateBlockEnforced,
  },
  {
    code: 20, name: 'fictional-PN', intent: 'a hallucinated structured part number (looks like a real MPN but exists nowhere)',
    // FOUR proofs (extended 2026-07-08, fischer_farms_codema gate-20 false-positive fix):
    // (a) the structured-PN classifier still flags a structured MPN (→ HIGH when no distributor
    //     has it) but NOT a commodity descriptor — unchanged base behaviour.
    // (b) an honestly-declared "CUSTOM-<x>" MPN is NEVER treated as a structured hallucination
    //     candidate — the gate's own error message has promised this skip since 2026-05-25 but no
    //     code implemented it until this fix (proveNoFalsePositive: honest custom kit).
    // (c) a curated library row at/above the override floor (0.75) DOES override a confirmed
    //     cache-miss — the exact root cause of the false HIGH on Myron L "750-II-CS51" (a real,
    //     web-verified conductivity sensor, confidence 0.9) that Mouser/Digi-Key/Farnell — which
    //     don't stock industrial process instrumentation — had ALSO cached as a miss.
    // (d) proveNoFalsePositive / regression guard: a LOW-confidence row (e.g. emitter_completion:llm
    //     writeback at 0.6, or stage0_harvest:candidate at ~0.6) must NOT override a confirmed
    //     miss — an LLM-hallucinated placeholder that also misses live distributors is still caught.
    proveCatch: () =>
      STRUCTURED_PN_REGEX.test('ZXQW-9981-K7') === true &&
      STRUCTURED_PN_REGEX.test('M6') === false &&
      CUSTOM_PREFIX_REGEX.test('CUSTOM-316L-MANIFOLD') === true &&
      CUSTOM_PREFIX_REGEX.test('ZXQW-9981-K7') === false &&
      libraryOverridesConfirmedMiss({ confidence: 0.9 }) === true &&
      libraryOverridesConfirmedMiss({ confidence: 0.6 }) === false &&
      libraryOverridesConfirmedMiss(undefined) === false,
    enforcedByDefault: gateBlockEnforced,
  },
  {
    code: 21, name: 'per-line-price-plausibility', intent: 'a line priced >5× (or <0.2×) the catalogue price (a £18 part billed £180)',
    // Three proofs: (a) the gate's severity decision FIRES on a 10×/0.01× line; (b) the gate's
    // FIX-SIDE rule — cascade-price adoption (2026-07-03, codema v58: real pinned MPN whose
    // price exists in the DB cascade ADOPTS it; a TBD MPN never adopts; an explicit
    // distributor-sourced price is never overridden) — proves its catch on in-memory fixtures
    // with an injected lookup (no DB dependency); (c) UNIT-BASIS RECONCILIATION (2026-07-03,
    // bess-crossval-v1 Bergquist GP3000S30 false HIGH: per-piece £2.50 vs per-SHEET £56.48,
    // both right — the sheet die-cuts into ~23 pads) — a yield-consistent piece-of-stock
    // under-bill downgrades HIGH → MEDIUM with the reconciliation stated, while BOTH
    // over-billing directions still FIRE: the v58-shaped £420-over-catalogue DP switch stays
    // HIGH, and a piece-of-stock line >5× the FULL stock price stays HIGH (you cannot pay
    // more per piece than per sheet). selftestPerLinePriceAudit() proves both directions.
    proveCatch: () => classifySeverity(180 / 18) === 'HIGH' && classifySeverity(30 / 3000) === 'HIGH' && classifySeverity(100 / 90) === 'PASS'
      && classifyLineSeverity('cell insulation pad', 2.5, 56.48).severity === 'MEDIUM'          // false HIGH reconciled
      && classifyLineSeverity('differential pressure switch', 420, 45.68).severity === 'HIGH'   // v58 over-bill still fires
      && classifyLineSeverity('cell insulation pad', 420, 56.48).severity === 'HIGH'            // piece >5× FULL stock still fires
      && selftestPerLinePriceAudit().ok
      && selftestCascadePriceAdoption().ok,
    enforcedByDefault: gateBlockEnforced,
  },
  {
    code: 22, name: 'engineering-lock', intent: 'a HARD-required derived slot still missing (a BESS with no cell_count)',
    proveCatch: () => {
      const miss = missingHardSlots('bess', { nameplate_capacity_kwh: { value: 3500 }, continuous_power_kw: { value: 1000 }, dc_bus_voltage_v: { value: 800 } })
      const ok = missingHardSlots('bess', { nameplate_capacity_kwh: { value: 3500 }, continuous_power_kw: { value: 1000 }, dc_bus_voltage_v: { value: 800 }, cell_count: { value: 3920 } })
      return miss.includes('cell_count') && ok.length === 0
    },
    enforcedByDefault: () => true, // exits 22 directly — but see the try/catch swallow coverage note
  },
  {
    code: 30, name: 'payload-rating', intent: 'in-container mass exceeding the container payload rating (41 t in a 35 t cap)',
    proveCatch: () => {
      const r: any = runPayloadRatingAudit({ container_payload_rating_kg: { value: 35000 }, in_container_mass_kg: { value: 41000 } })
      const skip: any = runPayloadRatingAudit({ in_container_mass_kg: { value: 41000 } })
      return r.passed === false && r.breach_kg === 6000 && skip.passed === true
    },
    enforcedByDefault: () => false, // downgraded to non-fatal 2026-05-30
  },
  {
    code: 31, name: 'semantic-self-audit', intent: 'a deterministic deception (a £0 bill of materials / a blank headline)',
    proveCatch: () => {
      const sa: any = { product_class: 'bess', min_score: null, mean_score: null, blocking_defects: [], sections: [], summary: '', hard_signals: ['BOM_TOTAL_ZERO'], model: 'test', mode: 'enforcing', generated_at: '', ok: true }
      const block = evaluateSelfAuditEnforcement(sa, 'deterministic')
      const honest = evaluateSelfAuditEnforcement({ ...sa, hard_signals: ['COMPLIANCE_FAIL_2'] }, 'deterministic')
      return block.shouldExit === true && block.exitCode === 31 && honest.shouldExit === false
    },
    enforcedByDefault: () => { try { const { selfAuditEnforceModeFromEnv } = require('./semantic-self-audit'); return selfAuditEnforceModeFromEnv(undefined) !== 'off' } catch { return false } },
  },
  {
    code: 32, name: 'independent-cost-sanity', intent: 'a dossier whose £/output-unit is wildly off the industry band (a 3 MWh BESS at £2,967/kWh)',
    proveCatch: () => {
      const st: any = { keyMetrics: { product_class: 'bess' }, parsedBrief: { constraints: { target_performance: { metrics: [{ key_metric: 'usable_energy_mwh', value: 3, unit: 'MWh', category: 'scale' }] } } }, costStack: { oem_transfer_price_gbp: 8_900_000 } }
      const bessFires = evaluateCostSanityEnforcement(computeCostSanity(st), 'on').shouldExit === true
      // S6 (2026-07-20): a per-UNIT device whose ex-works price busts the BRIEF ceiling must be
      // HIGH even though £429/unit sits inside the wide £100–£5M/unit industry band.
      const s6St: any = { keyMetrics: { product_class: 'benchtop_bioreactor' }, isInstrumentDevice: true,
        parsedBrief: { constraints: { unit_cost_ceiling: { value: 385, currency: 'GBP' },
          target_performance: { metrics: [{ key_metric: 'working_volume_ml', value: 20, unit: 'ml', category: 'scale' }] } } },
        costStack: { oem_transfer_price_gbp: 429 } }
      const s6 = computeCostSanity(s6St)
      const s6Fires = s6.output_family === 'unit' && s6.verdict === 'high'
      // proveNoFalsePositive: the SAME device UNDER its ceiling (£300) is not S6-flagged HIGH.
      const s6OkSt: any = { ...s6St, costStack: { oem_transfer_price_gbp: 300 } }
      const s6Ok = computeCostSanity(s6OkSt).verdict !== 'high'
      // proveNoFalsePositive (Sol 2026-07-27): dissipation W on a multi-channel lab
      // instrument must NOT become a power-plant £/kW denominator.
      const dissSt: any = {
        keyMetrics: { product_class: 'consumer_electronics' },
        isInstrumentDevice: true,
        parsedBrief: {
          constraints: {
            target_performance: {
              metrics: [
                { key_metric: 'channel_count', value: 8, unit: 'channels', category: 'scale' },
                { key_metric: 'max_simultaneous_dissipation_w', value: 200, unit: 'W', category: 'scale' },
              ],
            },
          },
        },
        costStack: { oem_transfer_price_gbp: 2757 },
      }
      const diss = computeCostSanity(dissSt)
      const dissNotPowerPlant = diss.output_family !== 'power'
        && !/£\/kW|\/kW/.test(String(diss.message ?? ''))
      return bessFires && s6Fires && s6Ok && dissNotPowerPlant
    },
    enforcedByDefault: () => costSanityEnforceModeFromEnv(undefined) !== 'off',
  },
  {
    code: 33, name: 'physics-critic', intent: 'a part the engine KNOWS will fail (a named part + a concrete failure mode at high confidence)',
    proveCatch: () => issueIsBlocking({ severity: 'high', confidence: 'high', where: 'design/modules[0]/sub_modules[1]/words[3]',
      issue: 'the MDPE buffer tank is spec\'d for a 120 °C MEA-stripper loop — MDPE max service temperature 60-80 °C, melts 120-130 °C, will lose structural integrity and fail' } as any).blocking === true,
    enforcedByDefault: () => physicsCriticEnforceModeFromEnv(undefined) !== 'off',
  },
  {
    code: 34, name: 'tool-archetype-coherence', intent: 'a marine/hull OR additive-manufacturing worked-calc rendered into a foreign-domain product (a stand-in for a missing in-class tool)',
    proveCatch: () => {
      // (a) MARINE family: a submersible-hull worked-calc on a non-marine plant → HIGH.
      const marineSt: any = { keyMetrics: { product_class: 'co2_mineralisation' }, toolsUsedPage: { tools: [{ tool_id: 'pressure-vessel:design', label: 'pressure-vessel:design',
        worked: [{ label: 'External hydrostatic pressure', substitution: '29.8 m seawater depth, rho_water=1025 kg/m³' }] }] } }
      const marineRes = computeToolArchetypeCoherence(marineSt)
      const marineFires = evaluateToolArchetypeEnforcement(marineRes, 'on').shouldExit === true
        || (Array.isArray(marineRes.findings) && marineRes.findings.some((f: any) => f.severity === 'high'))
      // (b) ADDITIVE-MANUFACTURING family (2026-07-20, Cursor ⚠): an FDM hot-end / filament-melt
      //     worked-calc leaked onto a benchtop BIOREACTOR (a 37 °C thermal loop mis-rendered as a
      //     210 °C printer hot-end) → HIGH on the non-printer class.
      const amTool = [{ tool_id: 'thermal:hot-end', label: 'thermal:hot-end',
        worked: [{ label: 'Nozzle temperature', substitution: 'E3D V6 with silicone sock, melt incoming filament to 210.48 °C' }] }]
      const amLeakSt: any = { keyMetrics: { product_class: 'benchtop_bioreactor' }, toolsUsedPage: { tools: amTool } }
      const amRes = computeToolArchetypeCoherence(amLeakSt)
      const amFires = Array.isArray(amRes.findings) && amRes.findings.some((f: any) => f.severity === 'high')
      // (c) proveNoFalsePositive: the SAME additive tool on a 3D-PRINTER class is IN-domain → no finding.
      const amOkSt: any = { keyMetrics: { product_class: 'fdm_3d_printer' }, toolsUsedPage: { tools: amTool } }
      const amOkRes = computeToolArchetypeCoherence(amOkSt)
      const amSuppressedOnPrinter = !(Array.isArray(amOkRes.findings) && amOkRes.findings.some((f: any) => f.severity === 'high'
        && String(f.family ?? f.marker_family ?? '') === 'additive_manufacturing'))
      // (d) PLANT_SCALE family (F1f Layer 4): a DN process pipe / skid worked-calc leaked onto a
      //     BENCHTOP identity → HIGH; the SAME on a plant identity → suppressed (legitimate there).
      const dnTool = [{ tool_id: 'pipe:sizing', label: 'pipe:sizing',
        worked: [{ label: 'Line size', substitution: 'DN50 process pipe at 2 m/s, skid frame' }] }]
      const psLeak: any = { designIdentity: { scale_tier: 'benchtop' }, isInstrumentDevice: true,
        keyMetrics: { product_class: 'benchtop_bioreactor' }, toolsUsedPage: { tools: dnTool } }
      const psFires = (computeToolArchetypeCoherence(psLeak).findings ?? []).some((f: any) =>
        f.severity === 'high' && String(f.family ?? f.marker_family ?? '') === 'plant_scale')
      const psOk: any = { designIdentity: { scale_tier: 'plant' },
        keyMetrics: { product_class: 'water_treatment' }, toolsUsedPage: { tools: dnTool } }
      const psSuppressedOnPlant = !(computeToolArchetypeCoherence(psOk).findings ?? []).some((f: any) =>
        f.severity === 'high' && String(f.family ?? f.marker_family ?? '') === 'plant_scale')
      return marineFires && amFires && amSuppressedOnPrinter && psFires && psSuppressedOnPlant
    },
    enforcedByDefault: () => toolArchetypeEnforceModeFromEnv(undefined) !== 'off',
  },
  {
    code: 35, name: 'drawing-gates', intent: 'an illegible (9:1) or qty-mismatched engineering drawing',
    proveCatch: () => pySelftestPasses('scripts/blender-universal/drawing_gates.py'),
    enforcedByDefault: () => ['1', 'true', 'yes', 'on'].includes(String(process.env.DRAWING_GATES_ENFORCING || '').toLowerCase()),
  },
  {
    code: 36, name: 'generative-benchmark-net',
    intent: 'a >2.5× engine-vs-benchmark divergence with NO basis in the brief (the 132.6 GW cover) — while an engine value the BRIEF itself states downgrades to a review note, never a block (gate-36 round 4, the v57/v57b re-rolled framings)',
    proveCatch: () => {
      // (a) the un-anchored cost RADICAL still blocks (the real BESS £8.9M vs a £1.3M envelope)
      const cost = compareToBenchmark(BENCH_EXP, { costStack: { oem_transfer_price_gbp: 8_900_000 }, keyMetrics: {}, requirementsBom: [] } as any)
      // (b) the 132.6-GW-shaped output absurdity (v51 era): NO basis in the brief → still blocks,
      //     even with other brief anchors present
      const gw = compareToBenchmark(
        { ...BENCH_EXP, expected_cost: { low_gbp: 0, expected_gbp: 0, high_gbp: 0 } as any, expected_outputs: [{ metric: 'rated_power', value: 2000, unit: 'kW' }] },
        { keyMetrics: {}, requirementsBom: [],
          parsedBrief: { constraints: { target_performance: { metrics: [{ key_metric: 'nameplate_capacity', value: 3, unit: 'MWh' }] } } },
          orchestratorContract: { quantities: { rated_power_kw: { value: 132_600_000, unit: 'kW' } } } } as any)
      // (c) the corroboration direction (v57b): a 6.2× divergence whose ENGINE value is the
      //     brief's own stated arithmetic (45 m³/h per department × 2 departments = 90) must
      //     downgrade to WARN — a review note, not an exit-36 block
      const anchored = compareToBenchmark(
        { ...BENCH_EXP, expected_cost: { low_gbp: 0, expected_gbp: 0, high_gbp: 0 } as any, expected_outputs: [{ metric: 'treated_water_throughput', value: 14.5, unit: 'm3/h' }] },
        { keyMetrics: {}, requirementsBom: [],
          parsedBrief: { original_text: 'maximum demand of 45 cubic metres per hour per department (two departments)',
            constraints: { target_performance: { metrics: [{ key_metric: 'max_irrigation_demand_per_department', value: 45, unit: 'm3/h' }] } } },
          orchestratorContract: { quantities: { uv_disinfection_throughput_m3_h: { value: 90, unit: 'm³/h', source: 'calculator', source_detail: 'sized to the peak recirculated flow (= irrigation demand 90 m³/h)' } } } } as any)
      return cost.needs_full_check === true && gw.needs_full_check === true
        && anchored.needs_full_check === false && anchored.worst === 'warn'
    },
    enforcedByDefault: () => !['', '0', 'false', 'no', 'off', 'shadow'].includes(String(process.env.BENCHMARK_NET_ENFORCING || '').toLowerCase()),
  },
  {
    code: 25, name: 'brief-value-literal-scanner (contract-strict)',
    intent: 'a brief-MIRROR value hardcoded as a literal in engineering-contract.ts (`const dcBusVoltage = 800` while the brief states 1,500 V) — the file gate 25 was STRUCTURALLY blind to until 2026-06-25',
    proveCatch: () => {
      // (a) the contract-strict scan CATCHES the named-slot hardcode that contradicts
      //     the brief, AND (b) its bundled selftest (catch + no-false-positive on the
      //     real contract's constants/ladders/rates/fallbacks) passes both directions.
      const bug = scanContractForBriefLiterals('const dcBusVoltage = 800', { dc_bus_voltage_v: 1500 }, 'bess')
      const fires = bug.hits.some((h: any) => h.brief_key === 'dc_bus_voltage_v' && h.value === 800)
      return fires && selftestContractStrict().passed
    },
    enforcedByDefault: () => true, // gate 25 is an always-on hard process.exit(25) (no flag)
  },
  {
    code: 39, name: 'structural-admission',
    intent: 'class-only justification OR plant/liquid anatomy (shell-and-tube, distribution manifold, ht:ntu-heat-exchanger) on a device-scale instrument — the cell-cycler contamination class',
    proveCatch: () => {
      // Bundled selftest covers class-only fire, liquid-on-benchtop fire, HX tool fire,
      // clean instrument pass, plant BESS no-false-positive, and enforcement mode.
      return selftestStructuralAdmission() === 0
        && evaluateStructuralAdmissionEnforcement(
          computeStructuralAdmission({
            keyMetrics: { product_class: 'consumer_electronics' },
            isInstrumentDevice: true,
            structuralJustifications: [{ justified_by: 'class=consumer_electronics' }],
          }),
          'on',
        ).shouldExit === true
    },
    enforcedByDefault: () => structuralAdmissionEnforceModeFromEnv(undefined) !== 'off',
  },
  {
    code: 40, name: 'design-closure',
    intent: 'pre-paint ledger closure — bare OR per_<scope>_ channel roles unbound vs channel_count, zero dim/rating on thermal demand, nonconserving heatsink watt allocation (cold-v13 8×200 W), fillable-TBD on critical roles (cold-v5 disease)',
    proveCatch: () => {
      // Representative of DELIVERED cold-v5: bare-named channel role at ×1.
      const bareOpen = computeDesignClosure({
        orchestratorContract: {
          quantities: {
            channel_count: { value: 8 },
            channel_max_dissipation_w: { value: 25 },
          },
        },
        moduleDecomposition: {
          modules: [{
            module: 'safety_protection',
            sub_modules: [{
              words: [{
                name_human: 'Charge Current Source',
                content_character: { character_id: 'charge_current_source' },
                modifier_characters: [
                  { kind: 'quantity', value: '×1' },
                  { kind: 'part_number', value: 'TBD (detailed design)' },
                ],
              }],
            }],
          }],
        },
      })
      return selftestDesignClosure() === 0
        && bareOpen.unbound_words >= 1
        && bareOpen.findings.some((f) => f.kind === 'unbound_multiplicity' && /Charge Current Source/.test(f.issue))
        && evaluateDesignClosureEnforcement(bareOpen, 'on').shouldExit === true
    },
    enforcedByDefault: () => designClosureEnforceModeFromEnv(undefined) !== 'off',
  },
  {
    code: 41, name: 'claim-provenance',
    intent: 'a quantitative claim shipped with NO fresh artefact behind it — the number quoted from memory, from a stale solve, or hand-carried past a re-run (FE front MGU 2026-08-01: mean|T| figures of 118 / 93.6 / 57.84 were quoted for days over a machine whose excitation was never in synchronism)',
    // ADVERSARIAL INPUT: a claim whose artefact does not exist at all. The gate
    // must exit 41, not report and continue.
    proveCatch: () => {
      const dir = mkdtempSync(join(tmpdir(), 'gate41-'))
      const claims = join(dir, 'claims.json')
      writeFileSync(claims, JSON.stringify({
        claims: [{
          name: 'torque_nm', value: 125.21,
          artefact: 'no_such_solver_output.json',
          key_path: 'works.torque_nm',
          run_to_fix: 'run the solver',
        }],
      }))
      const fired = pyBlocksOnBadInput('scripts/lib/claim_provenance_gate.py',
        ['--claims', claims, '--enforce'], 41)
      // ...and an EMPTY registry must not read as a pass either.
      writeFileSync(claims, JSON.stringify({ claims: [] }))
      const emptyFired = pyBlocksOnBadInput('scripts/lib/claim_provenance_gate.py',
        ['--claims', claims, '--enforce'], 41)
      rmSync(dir, { recursive: true, force: true })
      return fired && emptyFired && pySelftestPasses('scripts/lib/claim_provenance_gate.py')
    },
    enforcedByDefault: () => !['0', 'false', 'no', 'off', 'shadow'].includes(String(process.env.CLAIM_PROVENANCE_ENFORCING ?? 'on').trim().toLowerCase()),
  },
  {
    code: 42, name: 'excitation-tracking',
    intent: 'a rotating-machine duty judged on a mean taken while the stator field was walking PAST the rotor — torque swinging through zero, so the "mean" describes no operating point at all (FE front MGU: async harmonics 53.65/80.17 N.m against a DC of 3.75)',
    // ADVERSARIAL INPUT through the CLI's OWN EXIT PATH (not an in-process
    // import), so this proves the gate BLOCKS operationally, matching gate 41.
    proveCatch: () => {
      const dir = mkdtempSync(join(tmpdir(), 'gate42-'))
      const ms = join(dir, '_motor_stack'); mkdirSync(ms, { recursive: true })
      const pts: unknown[] = []
      for (let i = 0; i < 37; i++) {
        const t = 2 * Math.PI * i / 36
        pts.push({
          rotor_position_mechanical_deg: 45 * i / 36,
          // the live fault: tiny DC, huge async k=1/k=2, real cogging at k=3
          torque_nm: 3.75 + 53.65 * Math.sin(t) + 80.17 * Math.sin(2 * t) + 31.11 * Math.sin(3 * t),
        })
      }
      writeFileSync(join(ms, 'em_fia_front_kit_case.json'), JSON.stringify({
        machine: { stator_slots: 24, rotor_poles: 8 },
        rotor_position_sweep: { points: pts },
      }))
      const fired = pyBlocksOnBadInput('scripts/lib/machine_excitation_tracking.py',
        ['--twin', dir, '--output', join(dir, 'out.json'), '--enforce'], 42)
      // ...and a SYNCHRONISED machine with real cogging must NOT block, or the
      // gate is decoration that fires on everything.
      const good: unknown[] = []
      for (let i = 0; i < 37; i++) {
        good.push({
          rotor_position_mechanical_deg: 45 * i / 36,
          torque_nm: 125 + 18 * Math.sin(2 * Math.PI * 3 * i / 36),
        })
      }
      writeFileSync(join(ms, 'em_fia_front_kit_case.json'), JSON.stringify({
        machine: { stator_slots: 24, rotor_poles: 8 },
        rotor_position_sweep: { points: good },
      }))
      let healthyPasses = false
      try {
        execFileSync('python3', [resolve(REPO, 'scripts/lib/machine_excitation_tracking.py'),
          '--twin', dir, '--output', join(dir, 'out2.json'), '--enforce'],
          { stdio: 'pipe', timeout: 60_000 })
        healthyPasses = true
      } catch { healthyPasses = false }
      rmSync(dir, { recursive: true, force: true })
      return fired && healthyPasses
    },
    enforcedByDefault: () => !['', '0', 'false', 'no', 'off', 'shadow'].includes(String(process.env.EXCITATION_TRACKING_ENFORCING ?? 'on').trim().toLowerCase()),
  },
  {
    code: 43, name: 'magnet-flux-focusing',
    intent: 'a permanent-magnet machine whose magnets spend their volume on THICKNESS (which saturates at a few multiples of mur*g) while the pole FACE is starved, so the magnet de-focuses flux — legal in every existing screen and structurally incapable of its duty (FE front MGU: A_m/A_g = 0.562 at 12x mur*g, i.e. 95.5% of Br)',
    // ADVERSARIAL INPUT through the CLI's OWN EXIT PATH, matching gates 41-42.
    proveCatch: () => {
      const dir = mkdtempSync(join(tmpdir(), 'gate43-'))
      const spec = join(dir, 'machine.json')
      const write = (o: unknown) => writeFileSync(spec, JSON.stringify(o))
      // the live starved geometry: thickness saturated, face area starved
      write({
        remanence_t: 1.24, recoil_permeability: 1.05, magnet_thickness_mm: 8.85,
        magnet_length_mm: 14.5793, magnets_per_pole: 2, magnet_tilt_deg: 20.0,
        rotor_outer_diameter_mm: 139.4, bridge_mm: 1.0, poles: 8, airgap_mm: 0.7,
      })
      const fired = pyBlocksOnBadInput('scripts/lib/machine_magnet_flux_focusing.py',
        ['--machine-json', spec, '--output', join(dir, 'o.json'), '--enforce'], 43)
      // a WELL-focused magnet must not block
      write({
        remanence_t: 1.24, recoil_permeability: 1.05, magnet_thickness_mm: 5.0,
        magnet_length_mm: 25.9, magnets_per_pole: 2, magnet_tilt_deg: 0.0,
        rotor_outer_diameter_mm: 139.4, bridge_mm: 1.0, poles: 8, airgap_mm: 0.7,
      })
      let healthyPasses = false
      try {
        execFileSync('python3', [resolve(REPO, 'scripts/lib/machine_magnet_flux_focusing.py'),
          '--machine-json', spec, '--output', join(dir, 'o2.json'), '--enforce'],
          { stdio: 'pipe', timeout: 60_000 })
        healthyPasses = true
      } catch { healthyPasses = false }
      rmSync(dir, { recursive: true, force: true })
      return fired && healthyPasses
    },
    enforcedByDefault: () => !['0', 'false', 'no', 'off', 'shadow'].includes(String(process.env.MAGNET_FOCUSING_ENFORCING ?? 'on').trim().toLowerCase()),
  },
]

// COVERAGE: every gate code here MUST have a proof in GATES, else the meta-test fails — so a NEW
// gate cannot land without a full adversarial proof. (23-29 are pre-render STATE-structural guards
// with direct un-swallowed exits — a separate extension; tracked here so they aren't forgotten.)
export const ALL_GATE_CODES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 25, 30, 31, 32, 33, 34, 35, 36, 39, 40, 41, 42, 43]

function _selftest() {
  let bad = 0
  const have = new Set(GATES.map(g => g.code))
  const missing = ALL_GATE_CODES.filter(c => !have.has(c))
  console.log('── PROVE-THE-CATCH: every gate must catch its own adversarial input ──')
  for (const g of GATES) {
    let caught = false, err = ''
    try { caught = g.proveCatch() } catch (e) { err = (e as Error).message.slice(0, 90) }
    const enf = (() => { try { return g.enforcedByDefault() } catch { return false } })()
    const mark = caught ? '🟢 CATCHES' : '🔴 WALK-THROUGH'
    const dflt = enf ? 'enforced-by-default' : '⚠ shadow/soft-by-default (needs its enforcing flag)'
    console.log(`  ${mark}  gate ${g.code} ${g.name} — ${dflt}${err ? `  [proof error: ${err}]` : ''}`)
    if (!caught) { console.log(`     intent NOT honoured: ${g.intent}`); bad++ }
  }
  if (missing.length) { console.log(`\n🔴 COVERAGE: ${missing.length} gate(s) in ALL_GATE_CODES have NO proof: ${missing.join(', ')}`); bad += missing.length }
  const shadow = GATES.filter(g => { try { return !g.enforcedByDefault() } catch { return true } }).map(g => g.code)
  console.log(`\n${GATES.length} gates proven; ${ALL_GATE_CODES.length} in the canonical set.`)
  console.log(`⚠ shadow/walk-through-by-default (catch, but do not block unless a flag is set): ${shadow.join(', ')}`)
  console.log(bad === 0 ? 'gate-registry selftest: OK' : `gate-registry selftest: FAIL (${bad})`)
  if (bad) process.exit(1)
}

if (process.argv.includes('--selftest')) _selftest()
