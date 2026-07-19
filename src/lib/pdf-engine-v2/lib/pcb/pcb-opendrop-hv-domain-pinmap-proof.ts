/**
 * @file OpenDrop HV-domain / Mini-DIMM pin-map proveCatch (offline gold proof).
 * @description Route/mating pad proof closed the electrode geometry half. The
 * remaining offline half is voltage-domain honesty: controller↔cartridge must
 * keep an HV rail + return + electrode array pin-map class, never collapse to a
 * single LV/USB (Rodeostat-template) domain. Board-regen creepage on copper
 * stays deferred — this module encodes the SOURCE domain/pin-map contract.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { derivePcbArchitecture, type PcbBoardPlan } from './pcb-architecture'
import {
  BRIEF_ELECTRODE_CHANNEL_FLOOR,
  GOLD_MINI_DIMM_MATING_PAD_COUNT,
  OPENDROP_GOLD_COMMIT,
  resolveOpenDropGoldRoot,
} from './pcb-opendrop-electrode-route-proof'

export interface OpenDropHvDomainPinmapGoldEvidence {
  schema: 'opendrop-hv-domain-pinmap-gold-evidence/v1'
  sourceCommit: string
  briefElectrodeChannelFloor: number
  mainBoardSchematicRelativePath: string
  cartridgeSchematicRelativePath: string
  footprintRelativePath: string
  matingFamily: string
  matingPadCount: number
  hvGeneratorPart: string
  isolationPart: string
  isolationPartCount: number
  mainRequiredNets: string[]
  cartridgeRequiredNets: string[]
  mainObservedNets: string[]
  cartridgeObservedNets: string[]
  electrodeNetFamily: string
  fluxlElectrodeRefCount: number
  lvHostNet: string
  notes: string[]
}

/** Pin-map class for a mating / board net family. */
export type OpenDropPinmapNetClass =
  | 'hv_power'
  | 'hv_return'
  | 'electrode_array'
  | 'lv_host'
  | 'logic_control'
  | 'unknown'

export interface OpenDropPinmapAssignment {
  netOrFamily: string
  netClass: OpenDropPinmapNetClass
}

export interface HvDomainPinmapProofInput {
  briefElectrodeCount: number
  gold: OpenDropHvDomainPinmapGoldEvidence
  hvControllerDomains: string[]
  electrodeCartridgeDomains: string[]
  hvControllerWork: string[]
  /** Declared pin-map classes for mating / electrode nets (architecture truth). */
  pinmapAssignments: OpenDropPinmapAssignment[]
}

export interface HvDomainPinmapProofResult {
  ok: boolean
  findings: string[]
  goldNetsOk: boolean
  goldHvPartsOk: boolean
  architectureDomainsOk: boolean
  isolationWorkOk: boolean
  pinmapClassesOk: boolean
}

const FIXTURE_RELATIVE =
  'tests/fixtures/pcb/yuri/opendrop-hv-domain-pinmap-gold-evidence.json'

/**
 * @description Load the checked-in HV-domain / pin-map gold fixture.
 * @param workspaceRoot Repo / worktree root containing tests/fixtures.
 */
export function loadOpenDropHvDomainPinmapGoldFixture(
  workspaceRoot: string = process.cwd(),
): OpenDropHvDomainPinmapGoldEvidence {
  const path = resolve(workspaceRoot, FIXTURE_RELATIVE)
  return JSON.parse(readFileSync(path, 'utf8')) as OpenDropHvDomainPinmapGoldEvidence
}

function extractGLabels(schematicText: string): string[] {
  return [...new Set(
    [...schematicText.matchAll(/Text GLabel[^\n]*\n([A-Za-z0-9_]+)/g)].map(
      (match) => match[1],
    ),
  )].sort()
}

/**
 * @description Extract live HV-domain / pin-map evidence from a gold OpenDrop
 * checkout (SIGHT of delivered schematics, not state.json).
 * @param goldRoot Absolute path to `_gold-opendrop-repo`.
 */
export function extractOpenDropHvDomainPinmapGoldEvidence(
  goldRoot: string,
): OpenDropHvDomainPinmapGoldEvidence {
  const mainBoardSchematicRelativePath =
    'OpenDropV4/Electronics/OpenDropV4_MainBoard/PCB/OpenDropV4.sch'
  const cartridgeSchematicRelativePath =
    'OpenDropV4/Electronics/CartridgeV4/DIMMCartridgeV4/DIMMCartridgeV4.sch'
  const footprintRelativePath =
    'KiCadLibrary/GaudiLabsFootPrints.pretty/Mini_Dimm_Cartridge_06_244.kicad_mod'

  const main = readFileSync(resolve(goldRoot, mainBoardSchematicRelativePath), 'utf8')
  const cart = readFileSync(resolve(goldRoot, cartridgeSchematicRelativePath), 'utf8')
  const footprint = existsSync(resolve(goldRoot, footprintRelativePath))
    ? readFileSync(resolve(goldRoot, footprintRelativePath), 'utf8')
    : ''

  const mainLabels = extractGLabels(main)
  const cartLabels = extractGLabels(cart)
  const mainRequiredNets = ['V_HV', 'V_HV_C', 'GND_C', 'V_USB']
  const cartridgeRequiredNets = ['V_HV_C', 'GND_C']
  const fluxlElectrodeRefs = [...new Set(
    [...cart.matchAll(/F 0 "(FLUXL_[^"]+)"/g)].map((match) => match[1]),
  )]
  const isolationPartCount = [...main.matchAll(/L [^\n]*TLP222A/g)].length
  const matingPads = [...new Set(
    [...footprint.matchAll(/\(pad (\d+) /g)].map((match) => Number(match[1])),
  )]

  return {
    schema: 'opendrop-hv-domain-pinmap-gold-evidence/v1',
    sourceCommit: OPENDROP_GOLD_COMMIT,
    briefElectrodeChannelFloor: BRIEF_ELECTRODE_CHANNEL_FLOOR,
    mainBoardSchematicRelativePath,
    cartridgeSchematicRelativePath,
    footprintRelativePath,
    matingFamily: 'Mini_Dimm',
    matingPadCount: matingPads.length || GOLD_MINI_DIMM_MATING_PAD_COUNT,
    hvGeneratorPart: 'MAX1771ESA',
    isolationPart: 'TLP222A',
    isolationPartCount,
    mainRequiredNets,
    cartridgeRequiredNets,
    mainObservedNets: mainRequiredNets.filter((net) => mainLabels.includes(net)),
    cartridgeObservedNets: cartridgeRequiredNets.filter((net) => cartLabels.includes(net)),
    electrodeNetFamily: 'FLUXL_',
    fluxlElectrodeRefCount: fluxlElectrodeRefs.length,
    lvHostNet: 'V_USB',
    notes: [
      `Extracted HV/LV nets + ${isolationPartCount}× TLP222A isolators from gold ${OPENDROP_GOLD_COMMIT}.`,
    ],
  }
}

/**
 * @description Default pin-map class assignments implied by gold net names
 * (power/return vs electrode array vs LV host). Used for the happy path.
 */
export function goldImpliedPinmapAssignments(
  gold: OpenDropHvDomainPinmapGoldEvidence,
): OpenDropPinmapAssignment[] {
  return [
    { netOrFamily: 'V_HV', netClass: 'hv_power' },
    { netOrFamily: 'V_HV_C', netClass: 'hv_power' },
    { netOrFamily: 'GND_C', netClass: 'hv_return' },
    { netOrFamily: gold.electrodeNetFamily, netClass: 'electrode_array' },
    { netOrFamily: gold.lvHostNet, netClass: 'lv_host' },
  ]
}

function boardById(boards: PcbBoardPlan[], boardId: string): PcbBoardPlan | undefined {
  return boards.find((board) => board.boardId === boardId)
}

/**
 * @description Pure decision: does gold + architecture + pin-map class contract
 * keep an HV/LV split for OpenDrop-class electrode products?
 * @param input Brief count, gold evidence, architecture domains/work, pin-map.
 */
export function evaluateHvDomainPinmapProof(
  input: HvDomainPinmapProofInput,
): HvDomainPinmapProofResult {
  // INTENT: EWOD controller↔cartridge must never look like a single-domain LV
  // AFE. Gold shows V_HV / V_HV_C / GND_C / FLUXL_* plus a separate V_USB host
  // rail — the architecture and pin-map classes must preserve that split.
  const findings: string[] = []
  const floor = Math.max(
    BRIEF_ELECTRODE_CHANNEL_FLOOR,
    input.gold.briefElectrodeChannelFloor,
    input.briefElectrodeCount,
  )

  const mainNetsOk = input.gold.mainRequiredNets.every((net) =>
    input.gold.mainObservedNets.includes(net),
  )
  const cartNetsOk = input.gold.cartridgeRequiredNets.every((net) =>
    input.gold.cartridgeObservedNets.includes(net),
  )
  const electrodeRefsOk = input.gold.fluxlElectrodeRefCount >= floor
  const matingOk =
    /mini[_ -]?dimm/i.test(input.gold.matingFamily)
    && input.gold.matingPadCount === GOLD_MINI_DIMM_MATING_PAD_COUNT
  const goldNetsOk = mainNetsOk && cartNetsOk && electrodeRefsOk && matingOk
  if (!mainNetsOk) {
    findings.push(
      `gold main missing required nets (have ${input.gold.mainObservedNets.join(',')}; need ${input.gold.mainRequiredNets.join(',')})`,
    )
  }
  if (!cartNetsOk) {
    findings.push(
      `gold cartridge missing required nets (have ${input.gold.cartridgeObservedNets.join(',')}; need ${input.gold.cartridgeRequiredNets.join(',')})`,
    )
  }
  if (!electrodeRefsOk) {
    findings.push(
      `gold FLUXL electrode refs ${input.gold.fluxlElectrodeRefCount} < floor ${floor}`,
    )
  }
  if (!matingOk) {
    findings.push(
      `gold mating family ${input.gold.matingFamily} / pads ${input.gold.matingPadCount} must be Mini_Dimm × ${GOLD_MINI_DIMM_MATING_PAD_COUNT}`,
    )
  }

  const goldHvPartsOk =
    /MAX1771/i.test(input.gold.hvGeneratorPart)
    && /TLP222A/i.test(input.gold.isolationPart)
    && input.gold.isolationPartCount >= 4
  if (!goldHvPartsOk) {
    findings.push(
      `gold HV parts incomplete (generator=${input.gold.hvGeneratorPart}, isolation=${input.gold.isolationPart}×${input.gold.isolationPartCount})`,
    )
  }

  const architectureDomainsOk =
    input.hvControllerDomains.includes('high_voltage')
    && input.electrodeCartridgeDomains.includes('high_voltage')
  if (!architectureDomainsOk) {
    findings.push(
      `architecture missing high_voltage domain (hv_controller=[${input.hvControllerDomains.join(',')}], cartridge=[${input.electrodeCartridgeDomains.join(',')}])`,
    )
  }

  const isolationWorkOk = input.hvControllerWork.includes('isolate_high_voltage')
  if (!isolationWorkOk) {
    findings.push('hv_controller_main work must include isolate_high_voltage')
  }

  const byNet = new Map(
    input.pinmapAssignments.map((assignment) => [
      assignment.netOrFamily,
      assignment.netClass,
    ]),
  )
  const hvPowerOk =
    byNet.get('V_HV') === 'hv_power' && byNet.get('V_HV_C') === 'hv_power'
  const hvReturnOk = byNet.get('GND_C') === 'hv_return'
  const electrodeOk =
    byNet.get(input.gold.electrodeNetFamily) === 'electrode_array'
  const lvOk = byNet.get(input.gold.lvHostNet) === 'lv_host'
  const electrodeNotLv = ![...byNet.entries()].some(
    ([net, netClass]) =>
      (net.startsWith('FLUXL') || net === input.gold.electrodeNetFamily)
      && (netClass === 'lv_host' || netClass === 'logic_control'),
  )
  const pinmapClassesOk =
    hvPowerOk && hvReturnOk && electrodeOk && lvOk && electrodeNotLv
  if (!hvPowerOk) {
    findings.push('pin-map must classify V_HV and V_HV_C as hv_power on the mating interface')
  }
  if (!hvReturnOk) {
    findings.push('pin-map must classify GND_C as hv_return')
  }
  if (!electrodeOk) {
    findings.push(
      `pin-map must classify ${input.gold.electrodeNetFamily} as electrode_array`,
    )
  }
  if (!lvOk) {
    findings.push(`pin-map must keep ${input.gold.lvHostNet} as lv_host (separate from HV)`)
  }
  if (!electrodeNotLv) {
    findings.push('electrode/FLUXL nets must not be classified as USB/LV-only')
  }

  return {
    ok:
      goldNetsOk
      && goldHvPartsOk
      && architectureDomainsOk
      && isolationWorkOk
      && pinmapClassesOk,
    findings,
    goldNetsOk,
    goldHvPartsOk,
    architectureDomainsOk,
    isolationWorkOk,
    pinmapClassesOk,
  }
}

/**
 * @description Build proof input from brief electrode count + gold fixture,
 * deriving live architecture domains/work.
 * @param briefElectrodeCount Brief `electrode_count` quantity.
 * @param gold Gold evidence (fixture or live extract).
 */
export function buildHvDomainPinmapProofInput(
  briefElectrodeCount: number,
  gold: OpenDropHvDomainPinmapGoldEvidence,
): HvDomainPinmapProofInput {
  const architecture = derivePcbArchitecture({
    orchestratorContract: {
      quantities: {
        electrode_count: { value: briefElectrodeCount },
      },
    },
  })
  const hv = boardById(architecture.boards, 'hv_controller_main')
  const cartridge = boardById(architecture.boards, 'electrode_cartridge')

  return {
    briefElectrodeCount,
    gold,
    hvControllerDomains: hv?.domains ?? [],
    electrodeCartridgeDomains: cartridge?.domains ?? [],
    hvControllerWork: hv?.workPerformed ?? [],
    pinmapAssignments: goldImpliedPinmapAssignments(gold),
  }
}

/**
 * @description proveCatch: known-bad LV/domain collapses must fire; gold happy
 * path must pass. Throws when the gate fails its own catch contract.
 */
export function proveCatchHvDomainPinmapProof(
  gold: OpenDropHvDomainPinmapGoldEvidence = loadOpenDropHvDomainPinmapGoldFixture(),
): void {
  const good = evaluateHvDomainPinmapProof(
    buildHvDomainPinmapProofInput(BRIEF_ELECTRODE_CHANNEL_FLOOR, gold),
  )
  if (!good.ok) {
    throw new Error(
      `proveCatch happy-path failed: ${good.findings.join('; ') || 'unknown'}`,
    )
  }

  const base = buildHvDomainPinmapProofInput(BRIEF_ELECTRODE_CHANNEL_FLOOR, gold)
  const badCases: Array<{ name: string, input: HvDomainPinmapProofInput }> = [
    {
      name: 'lv_only_domains',
      input: {
        ...base,
        hvControllerDomains: ['logic', 'analog'],
        electrodeCartridgeDomains: ['analog', 'wet_interface'],
      },
    },
    {
      name: 'missing_isolate_work',
      input: {
        ...base,
        hvControllerWork: base.hvControllerWork.filter(
          (work) => work !== 'isolate_high_voltage',
        ),
      },
    },
    {
      name: 'electrode_on_usb_lv',
      input: {
        ...base,
        pinmapAssignments: [
          { netOrFamily: 'V_HV', netClass: 'hv_power' },
          { netOrFamily: 'V_HV_C', netClass: 'hv_power' },
          { netOrFamily: 'GND_C', netClass: 'hv_return' },
          { netOrFamily: gold.electrodeNetFamily, netClass: 'lv_host' },
          { netOrFamily: gold.lvHostNet, netClass: 'lv_host' },
        ],
      },
    },
    {
      name: 'missing_hv_mating_rails',
      input: {
        ...base,
        pinmapAssignments: [
          { netOrFamily: 'V_USB', netClass: 'lv_host' },
          { netOrFamily: gold.electrodeNetFamily, netClass: 'electrode_array' },
        ],
      },
    },
    {
      name: 'gold_missing_v_hv',
      input: {
        ...base,
        gold: {
          ...gold,
          mainObservedNets: gold.mainObservedNets.filter((net) => net !== 'V_HV'),
        },
      },
    },
  ]

  for (const badCase of badCases) {
    const verdict = evaluateHvDomainPinmapProof(badCase.input)
    if (verdict.ok) {
      throw new Error(
        `proveCatch failed to fire on known-bad case ${badCase.name}`,
      )
    }
  }

  // Optional live gold extract when checkout present — must agree with fixture nets.
  const goldRoot = resolveOpenDropGoldRoot()
  if (goldRoot) {
    const live = extractOpenDropHvDomainPinmapGoldEvidence(goldRoot)
    for (const net of gold.mainRequiredNets) {
      if (!live.mainObservedNets.includes(net)) {
        throw new Error(`live gold main missing net ${net}`)
      }
    }
  }
}
