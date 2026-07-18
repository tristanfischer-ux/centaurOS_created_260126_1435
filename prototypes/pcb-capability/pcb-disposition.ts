/**
 * @file Universal bespoke-PCB disposition policy (prototype only).
 * @description Decides whether an electronics function should use a purchased
 * component/module or enter a bespoke PCB workflow. The decision uses functional,
 * procurement, topology, and constraint evidence—never a product-class slug.
 *
 * Run: npx tsx prototypes/pcb-capability/pcb-disposition.ts --selftest
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
