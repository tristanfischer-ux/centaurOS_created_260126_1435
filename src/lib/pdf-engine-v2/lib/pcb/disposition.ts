/**
 * @file Universal bespoke-PCB disposition policy — ENGINE-SIDE (Phase A, 2026-07-12).
 * @description Decides whether an electronics function should use a purchased
 * component/module or enter a bespoke PCB workflow. The decision uses functional,
 * procurement, topology, and constraint evidence — never a product-class slug.
 *
 * `evaluatePcbDisposition` is ported VERBATIM from
 * `prototypes/pcb-capability/pcb-disposition.ts` (validated: 10/10 selftest cases
 * pass) — the policy logic is unchanged, only the import path (this file's own
 * `pcb-contract.ts`) differs so the engine never depends on `prototypes/`.
 *
 * `decidePcbDisposition` is NEW: the chain's shadow PCB stage (`pcb-stage.ts`) works
 * at DESIGN level (one electronic-complexity signal set per run), not per-candidate-
 * word level. It builds one aggregate `PcbCandidateEvidence` from the stage's derived
 * signals, runs it through the SAME validated `evaluatePcbDisposition` policy, then
 * collapses the six-way `PcbDisposition` down to the three-way stage vocabulary the
 * chain records (`bespoke | cots-modules | none`) with an auditable rationale trail.
 *
 * Run: npx tsx src/lib/pdf-engine-v2/lib/pcb/disposition.ts --selftest
 */

import type {
  PcbCandidateEvidence,
  PcbDispositionDecision,
} from './pcb-contract'

const BOARD_ROLE_PATTERN =
  /\b(pcb|pcba|board|controller|control unit|afe|analog front end|gate driver|sensor interface|cell monitor|bms slave|safety i\/?o|motor control|display driver|comms board|communication board|power distribution board)\b/i

const BARE_COMPONENT_PATTERN =
  /\b(mcu|microcontroller|soc|integrated circuit|transceiver|resistor|capacitor|diode|mosfet|igbt|sensor ic|monitor ic|processor)\b/i

const PURCHASED_MODULE_PATTERN =
  /\b(plc|industrial pc|panel pc|touch panel|gateway|managed switch|vfd|variable frequency drive|complete inverter|power conversion system|payment terminal|rfid reader|autopilot|flight controller|esc module|power supply module)\b/i

function evidenceText(evidence: PcbCandidateEvidence): string {
  return [
    evidence.moduleId,
    evidence.subModuleId,
    evidence.wordId,
    evidence.name,
    evidence.characterId ?? '',
    evidence.characterType ?? '',
    evidence.form ?? '',
  ].join(' ')
}

function isBoardRole(evidence: PcbCandidateEvidence): boolean {
  return BOARD_ROLE_PATTERN.test(evidenceText(evidence))
}

function isBareComponent(evidence: PcbCandidateEvidence): boolean {
  const text = evidenceText(evidence)
  return BARE_COMPONENT_PATTERN.test(text) && !/\b(pcb|pcba|board|module)\b/i.test(text)
}

function isPurchasedModuleRole(evidence: PcbCandidateEvidence): boolean {
  return PURCHASED_MODULE_PATTERN.test(evidenceText(evidence))
}

/**
 * @description Classifies one electronics function using procurement and design evidence.
 * @param evidence - Normalised evidence collected after emitter/OEM-parent resolution.
 * @returns A disposition plus auditable reason codes.
 */
export function evaluatePcbDisposition(
  evidence: PcbCandidateEvidence,
): PcbDispositionDecision {
  const reasons: string[] = []
  const boardRole = isBoardRole(evidence)

  // DECISION: A purchased parent owns its internal electronics. Exploding a PCS,
  // PLC, HMI, VFD, or other complete assembly into custom boards is a procurement error.
  if (
    evidence.parentIsPurchasedAssembly ||
    evidence.explicitCotsIntent ||
    evidence.catalogueResolution === 'confirmed_finished_module'
  ) {
    if (evidence.parentIsPurchasedAssembly) reasons.push('inside_purchased_parent')
    if (evidence.explicitCotsIntent) reasons.push('brief_requires_cots')
    if (evidence.catalogueResolution === 'confirmed_finished_module') {
      reasons.push('finished_module_catalogue_match')
    }
    return {
      disposition: 'catalogue_module',
      reasons,
      requiresKiCadDeliverable: false,
      confidence: 'high',
    }
  }

  if (isBareComponent(evidence)) {
    return {
      disposition: 'catalogue_component',
      reasons: ['bare_component_is_not_a_board_deliverable'],
      requiresKiCadDeliverable: false,
      confidence: 'high',
    }
  }

  if (!boardRole && !isPurchasedModuleRole(evidence)) {
    return {
      disposition: 'not_applicable',
      reasons: ['no_electronic_board_function'],
      requiresKiCadDeliverable: false,
      confidence: 'high',
    }
  }

  const constraintEvidence = [
    ['compact_product_envelope', evidence.compactProductEnvelope],
    ['custom_form_factor', evidence.customFormFactor],
    ['multi_function_integration', evidence.multiFunctionIntegration],
    ['safety_specific_integration', evidence.safetySpecificIntegration],
    ['rf_or_high_speed_layout', evidence.rfOrHighSpeedLayout],
    ['repeated_application_specific_board', evidence.repeatedApplicationSpecificBoard],
  ] as const
  const activeConstraints = constraintEvidence
    .filter(([, active]) => active)
    .map(([reason]) => reason)

  if (evidence.explicitCustomIntent && boardRole) {
    return {
      disposition: 'bespoke_required',
      reasons: ['brief_requires_custom_electronics', ...activeConstraints],
      requiresKiCadDeliverable: true,
      confidence: 'high',
    }
  }

  // INTENT: "No catalogue match" is not enough by itself; a weak catalogue can
  // miss an ordinary PLC/module. Require independent application-specific evidence.
  if (
    evidence.catalogueResolution === 'confirmed_no_finished_module' &&
    boardRole &&
    activeConstraints.length >= 1
  ) {
    return {
      disposition: 'bespoke_required',
      reasons: ['no_finished_module_match', ...activeConstraints],
      requiresKiCadDeliverable: true,
      confidence: activeConstraints.length >= 2 ? 'high' : 'medium',
    }
  }

  if (
    boardRole &&
    activeConstraints.length >= 2 &&
    evidence.catalogueResolution === 'not_checked'
  ) {
    return {
      disposition: 'bespoke_candidate',
      reasons: ['cots_search_required', ...activeConstraints],
      requiresKiCadDeliverable: false,
      confidence: 'medium',
    }
  }

  if (
    evidence.catalogueResolution === 'confirmed_component_only' &&
    boardRole
  ) {
    return {
      disposition: 'bespoke_candidate',
      reasons: ['catalogue_hit_is_component_not_finished_board', ...activeConstraints],
      requiresKiCadDeliverable: false,
      confidence: 'medium',
    }
  }

  return {
    disposition: 'unresolved',
    reasons: [
      boardRole ? 'board_function_without_sufficient_procurement_evidence' : 'module_role_unresolved',
      ...activeConstraints,
    ],
    requiresKiCadDeliverable: false,
    confidence: 'low',
  }
}

// ── STAGE-LEVEL WRAPPER (new, 2026-07-12) ───────────────────────────────────────────
// The chain's shadow PCB stage doesn't have per-word procurement evidence yet (Phase B/C
// build the real BoM→net mapping); it has DESIGN-level electronic-complexity signals
// (does the design show a board-role electronic cluster; how many distinct electronic
// functions; is the envelope compact; is production repeated). This wrapper turns those
// signals into ONE aggregate PcbCandidateEvidence, reuses the validated policy above
// unchanged, then collapses the result to the three-way vocabulary the stage records.

export type PcbStageDisposition = 'bespoke' | 'cots-modules' | 'none'

export interface PcbStageDispositionInput {
  /** From the stage's own word/brief scan — see pcb-stage.ts::scanDesignForElectronicSignals. */
  isPcbBearing: boolean
  electronicPartCount: number
  distinctElectronicCategories: string[]
  compactProductEnvelope: boolean
  customFormFactor: boolean
  multiFunctionIntegration: boolean
  safetySpecificIntegration: boolean
  rfOrHighSpeedLayout: boolean
  repeatedApplicationSpecificBoard: boolean
  explicitCustomIntent: boolean
  explicitCotsIntent: boolean
  parentIsPurchasedAssembly: boolean
}

export interface PcbStageDispositionResult {
  disposition: PcbStageDisposition
  rationale: string[]
  requiresKiCadDeliverable: boolean
  confidence: 'high' | 'medium' | 'low'
  /** The full six-way decision from the (unmodified) validated policy, for audit. */
  underlying: PcbDispositionDecision
}

function mapToStageDisposition(d: PcbDispositionDecision['disposition']): PcbStageDisposition {
  if (d === 'catalogue_module' || d === 'catalogue_component') return 'cots-modules'
  if (d === 'bespoke_required' || d === 'bespoke_candidate') return 'bespoke'
  // 'unresolved': a board-role function was detected but procurement evidence is thin.
  // The stage already independently confirmed isPcbBearing=true before calling in here
  // (see the not_applicable short-circuit below), so treat 'unresolved' as a cautious
  // bespoke-candidate — never silently downgrade a detected board function to 'none'.
  if (d === 'unresolved') return 'bespoke'
  return 'none'
}

/**
 * @description Decides the stage-level PCB disposition for a whole design from its own
 * electronic-complexity signals (part count, distinct functions, envelope, volume).
 * @param input - Signals derived from the design's own content — never a class table.
 * @returns bespoke | cots-modules | none, with the full reasoning trail preserved.
 */
export function decidePcbDisposition(
  input: PcbStageDispositionInput,
): PcbStageDispositionResult {
  if (!input.isPcbBearing) {
    return {
      disposition: 'none',
      rationale: ['no_electronic_board_function_detected'],
      requiresKiCadDeliverable: false,
      confidence: 'high',
      underlying: {
        disposition: 'not_applicable',
        reasons: ['no_electronic_board_function_detected'],
        requiresKiCadDeliverable: false,
        confidence: 'high',
      },
    }
  }

  const evidence: PcbCandidateEvidence = {
    moduleId: 'pcb_stage_aggregate',
    subModuleId: 'electronic_function_cluster',
    wordId: 'design_electronic_control_board',
    // "control board" deliberately hits BOARD_ROLE_PATTERN so a design the stage has
    // already confirmed isPcbBearing=true for never falls through to not_applicable here.
    name: `Electronic control board (${input.distinctElectronicCategories.join(', ') || 'electronics'})`,
    quantity: Math.max(1, input.electronicPartCount),
    parentIsPurchasedAssembly: input.parentIsPurchasedAssembly,
    // Phase A never runs a live COTS-module catalogue search (that's Phase B/C territory);
    // 'not_checked' is the honest starting resolution for every run today.
    catalogueResolution: 'not_checked',
    explicitCustomIntent: input.explicitCustomIntent,
    explicitCotsIntent: input.explicitCotsIntent,
    compactProductEnvelope: input.compactProductEnvelope,
    customFormFactor: input.customFormFactor,
    multiFunctionIntegration: input.multiFunctionIntegration,
    safetySpecificIntegration: input.safetySpecificIntegration,
    rfOrHighSpeedLayout: input.rfOrHighSpeedLayout,
    repeatedApplicationSpecificBoard: input.repeatedApplicationSpecificBoard,
  }
  const decision = evaluatePcbDisposition(evidence)
  return {
    disposition: mapToStageDisposition(decision.disposition),
    rationale: decision.reasons,
    requiresKiCadDeliverable: decision.requiresKiCadDeliverable,
    confidence: decision.confidence,
    underlying: decision,
  }
}

function fixture(
  overrides: Partial<PcbCandidateEvidence>,
): PcbCandidateEvidence {
  return {
    moduleId: 'control_compute_communication',
    subModuleId: 'embedded_controller',
    wordId: 'controller_board',
    name: 'Embedded controller board',
    quantity: 1,
    parentIsPurchasedAssembly: false,
    catalogueResolution: 'not_checked',
    explicitCustomIntent: false,
    explicitCotsIntent: false,
    compactProductEnvelope: false,
    customFormFactor: false,
    multiFunctionIntegration: false,
    safetySpecificIntegration: false,
    rfOrHighSpeedLayout: false,
    repeatedApplicationSpecificBoard: false,
    ...overrides,
  }
}

function selftest(): void {
  const cases: Array<{
    name: string
    evidence: PcbCandidateEvidence
    expected: PcbDispositionDecision['disposition']
  }> = [
    {
      name: 'purchased PCS does not expose an internal gate-driver PCB',
      evidence: fixture({
        name: 'Gate driver board inside complete inverter',
        parentIsPurchasedAssembly: true,
      }),
      expected: 'catalogue_module',
    },
    {
      name: 'confirmed Siemens-class PLC remains a catalogue module',
      evidence: fixture({
        name: 'Industrial PLC controller',
        catalogueResolution: 'confirmed_finished_module',
      }),
      expected: 'catalogue_module',
    },
    {
      name: 'a bare monitor IC is a component, not a PCB',
      evidence: fixture({
        wordId: 'cell_monitor_ic',
        name: 'Battery monitor IC',
        form: '18-channel integrated circuit',
        catalogueResolution: 'confirmed_component_only',
      }),
      expected: 'catalogue_component',
    },
    {
      name: 'replicated application-specific BMS slave requires a board',
      evidence: fixture({
        subModuleId: 'cell_monitoring_unit',
        name: 'BMS slave cell-monitor board',
        quantity: 24,
        catalogueResolution: 'confirmed_no_finished_module',
        repeatedApplicationSpecificBoard: true,
        multiFunctionIntegration: true,
      }),
      expected: 'bespoke_required',
    },
    {
      name: 'compact wearable AFE requires a board after a confirmed COTS miss',
      evidence: fixture({
        name: 'Electrochemical sensor analog front end board',
        catalogueResolution: 'confirmed_no_finished_module',
        compactProductEnvelope: true,
        multiFunctionIntegration: true,
        safetySpecificIntegration: true,
      }),
      expected: 'bespoke_required',
    },
    {
      name: 'RF board requires custom layout after a confirmed module miss',
      evidence: fixture({
        name: 'Beamforming RF PCB',
        catalogueResolution: 'confirmed_no_finished_module',
        rfOrHighSpeedLayout: true,
      }),
      expected: 'bespoke_required',
    },
    {
      name: 'two custom constraints trigger candidate status before COTS search',
      evidence: fixture({
        customFormFactor: true,
        multiFunctionIntegration: true,
      }),
      expected: 'bespoke_candidate',
    },
    {
      name: 'a component-only catalogue hit cannot satisfy a board function',
      evidence: fixture({
        name: 'BMS master controller PCBA',
        catalogueResolution: 'confirmed_component_only',
      }),
      expected: 'bespoke_candidate',
    },
    {
      name: 'explicit custom board intent requires KiCad deliverable',
      evidence: fixture({
        explicitCustomIntent: true,
        customFormFactor: true,
      }),
      expected: 'bespoke_required',
    },
    {
      name: 'standard mechanical equipment is not applicable',
      evidence: fixture({
        moduleId: 'mass_fluid_transport_process',
        subModuleId: 'recirculation_pump',
        wordId: 'pump_casing',
        name: 'Centrifugal pump casing',
      }),
      expected: 'not_applicable',
    },
  ]

  const failures = cases.flatMap((testCase) => {
    const actual = evaluatePcbDisposition(testCase.evidence)
    if (actual.disposition === testCase.expected) return []
    return [
      `${testCase.name}: expected ${testCase.expected}, got ${actual.disposition} (${actual.reasons.join(', ')})`,
    ]
  })
  if (failures.length) {
    throw new Error(`pcb-disposition selftest failed:\n${failures.join('\n')}`)
  }
  console.log(`pcb-disposition selftest: OK (${cases.length} cases)`)
}

if (process.argv.includes('--selftest')) selftest()
