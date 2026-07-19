/**
 * @file OpenDrop electrode route / mating proveCatch (offline gold proof).
 * @description After fitted-MPN residuals closed, the remaining OpenDrop
 * electrode_cartridge gap is geometry: every brief electrode channel must stay
 * a routed cartridge net mated through the Mini-DIMM edge, never a collapsed
 * low-density connector package. This module proves that catch from frozen
 * gold artefacts + the architecture/generator contracts.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { derivePcbArchitecture } from './pcb-architecture'
import { generateAtopileProject } from './atopile-generator'

/** Frozen GaudiLabs OpenDrop V4 revision used for electrode/mating evidence. */
export const OPENDROP_GOLD_COMMIT = '934a44db3ed41c24ae4dddb5b805a22e4166284b'

/** Brief / architecture electrode-channel floor for EWOD-class products. */
export const BRIEF_ELECTRODE_CHANNEL_FLOOR = 64

/** Gold Mini-DIMM cartridge edge contact count (contiguous pads 1–244). */
export const GOLD_MINI_DIMM_MATING_PAD_COUNT = 244

export interface OpenDropElectrodeGoldEvidence {
  schema: 'opendrop-electrode-gold-evidence/v1'
  sourceCommit: string
  briefElectrodeChannelFloor: number
  fluxlElectrodeRefCount: number
  matingPadCount: number
  matingPadMin: number
  matingPadMax: number
  footprintName: string
  schematicRelativePath: string
  footprintRelativePath: string
  notes: string[]
}

export type ElectrodeChannelImplementation =
  | 'passive_board_geometry'
  | 'unresolved_board_function'
  | 'fitted_connector_package'
  | string

export interface ElectrodeRouteMatingProofInput {
  briefElectrodeCount: number
  gold: OpenDropElectrodeGoldEvidence
  architectureElectrodeChannelCount: number
  electrodeChannelImplementation: ElectrodeChannelImplementation
  /** Optional package id if the generator tried to materialise a connector. */
  matingConnectorPackage?: string | null
}

export interface ElectrodeRouteMatingProofResult {
  ok: boolean
  findings: string[]
  goldElectrodeRefsOk: boolean
  matingPadsOk: boolean
  architectureCountOk: boolean
  implementationOk: boolean
}

const FIXTURE_RELATIVE = 'tests/fixtures/pcb/yuri/opendrop-electrode-gold-evidence.json'

const LOW_DENSITY_CONNECTOR = /(?:conn_01x0[12]|jst[_ -]?xh[_ -]?b2b|1x02|2[_ -]?pin)/i

/**
 * @description Resolve the frozen OpenDrop gold checkout when present (main
 * tree `out/`, sibling worktree, or OPENDROP_GOLD_ROOT).
 * @returns Absolute gold root, or null when unavailable offline.
 */
export function resolveOpenDropGoldRoot(
  cwd: string = process.cwd(),
): string | null {
  const envRoot = process.env.OPENDROP_GOLD_ROOT?.trim()
  const candidates = [
    envRoot,
    resolve(cwd, 'out/_gold-opendrop-repo'),
    resolve(cwd, '../CentaurOS-oxccu-efuel/out/_gold-opendrop-repo'),
    resolve(cwd, '../../CentaurOS-oxccu-efuel/out/_gold-opendrop-repo'),
    '/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/_gold-opendrop-repo',
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    const schematic = resolve(
      candidate,
      'OpenDropV4/Electronics/CartridgeV4/DIMMCartridgeV4/DIMMCartridgeV4.sch',
    )
    if (existsSync(schematic)) return candidate
  }
  return null
}

/**
 * @description Load the checked-in gold evidence fixture (always available).
 * @param workspaceRoot Repo / worktree root containing tests/fixtures.
 */
export function loadOpenDropElectrodeGoldFixture(
  workspaceRoot: string = process.cwd(),
): OpenDropElectrodeGoldEvidence {
  const path = resolve(workspaceRoot, FIXTURE_RELATIVE)
  return JSON.parse(readFileSync(path, 'utf8')) as OpenDropElectrodeGoldEvidence
}

/**
 * @description Extract live electrode-ref and mating-pad counts from a gold
 * OpenDrop checkout (SIGHT of the delivered CAD, not state.json).
 * @param goldRoot Absolute path to `_gold-opendrop-repo`.
 */
export function extractOpenDropElectrodeGoldEvidence(
  goldRoot: string,
): OpenDropElectrodeGoldEvidence {
  const schematicRelativePath =
    'OpenDropV4/Electronics/CartridgeV4/DIMMCartridgeV4/DIMMCartridgeV4.sch'
  const footprintRelativePath =
    'KiCadLibrary/GaudiLabsFootPrints.pretty/Mini_Dimm_Cartridge_06_244.kicad_mod'
  const schematic = readFileSync(resolve(goldRoot, schematicRelativePath), 'utf8')
  const footprint = readFileSync(resolve(goldRoot, footprintRelativePath), 'utf8')

  const fluxlElectrodeRefs = [...new Set(
    [...schematic.matchAll(/F 0 "(FLUXL_[^"]+)"/g)].map((match) => match[1]),
  )].sort()
  const matingPads = [...new Set(
    [...footprint.matchAll(/\(pad (\d+) /g)].map((match) => Number(match[1])),
  )].sort((left, right) => left - right)

  return {
    schema: 'opendrop-electrode-gold-evidence/v1',
    sourceCommit: OPENDROP_GOLD_COMMIT,
    briefElectrodeChannelFloor: BRIEF_ELECTRODE_CHANNEL_FLOOR,
    fluxlElectrodeRefCount: fluxlElectrodeRefs.length,
    matingPadCount: matingPads.length,
    matingPadMin: matingPads[0] ?? 0,
    matingPadMax: matingPads[matingPads.length - 1] ?? 0,
    footprintName: 'Mini_Dimm_Cartridge_06_244',
    schematicRelativePath,
    footprintRelativePath,
    notes: [
      `Extracted ${fluxlElectrodeRefs.length} FLUXL electrode refs and ${matingPads.length} Mini-DIMM pads from gold ${OPENDROP_GOLD_COMMIT}.`,
    ],
  }
}

/**
 * @description Pure decision: does gold + architecture + generator contract
 * prove the electrode route/mating obligation, or has it collapsed?
 * @param input Brief count, gold evidence, architecture channel count, implementation.
 */
export function evaluateElectrodeRouteMatingProof(
  input: ElectrodeRouteMatingProofInput,
): ElectrodeRouteMatingProofResult {
  // INTENT: A 64-channel EWOD cartridge is passive copper + a dense mating
  // edge. Collapsing it to a 2-pin JST (or any low-density package) is the
  // known failure mode the punchlist recorded — this gate must catch it.
  const findings: string[] = []
  const floor = Math.max(
    BRIEF_ELECTRODE_CHANNEL_FLOOR,
    input.gold.briefElectrodeChannelFloor,
    input.briefElectrodeCount,
  )

  const goldElectrodeRefsOk = input.gold.fluxlElectrodeRefCount >= floor
  if (!goldElectrodeRefsOk) {
    findings.push(
      `gold FLUXL electrode refs ${input.gold.fluxlElectrodeRefCount} < required floor ${floor}`,
    )
  }

  const matingPadsOk =
    input.gold.matingPadCount === GOLD_MINI_DIMM_MATING_PAD_COUNT
    && input.gold.matingPadMin === 1
    && input.gold.matingPadMax === GOLD_MINI_DIMM_MATING_PAD_COUNT
  if (!matingPadsOk) {
    findings.push(
      `gold Mini-DIMM mating pads ${input.gold.matingPadCount} (min=${input.gold.matingPadMin}, max=${input.gold.matingPadMax}) must be contiguous 1–${GOLD_MINI_DIMM_MATING_PAD_COUNT}`,
    )
  }

  const architectureCountOk = input.architectureElectrodeChannelCount >= floor
  if (!architectureCountOk) {
    findings.push(
      `architecture electrode_channel count ${input.architectureElectrodeChannelCount} < brief floor ${floor}`,
    )
  }

  const packageId = input.matingConnectorPackage ?? ''
  const collapsedPackage = LOW_DENSITY_CONNECTOR.test(packageId)
  const implementationOk =
    input.electrodeChannelImplementation === 'passive_board_geometry'
    && !collapsedPackage
  if (input.electrodeChannelImplementation !== 'passive_board_geometry') {
    findings.push(
      `electrode_channel implementation is ${input.electrodeChannelImplementation}, expected passive_board_geometry`,
    )
  }
  if (collapsedPackage) {
    findings.push(
      `electrode mating collapsed to low-density connector package ${packageId}`,
    )
  }

  return {
    ok:
      goldElectrodeRefsOk
      && matingPadsOk
      && architectureCountOk
      && implementationOk,
    findings,
    goldElectrodeRefsOk,
    matingPadsOk,
    architectureCountOk,
    implementationOk,
  }
}

/**
 * @description Build the proof input from a brief electrode count + gold
 * fixture/evidence, deriving architecture and generator implementation live.
 * @param briefElectrodeCount Brief `electrode_count` quantity.
 * @param gold Gold evidence (fixture or live extract).
 * @param tmpDir Scratch directory for atopile generation.
 */
export function buildElectrodeRouteMatingProofInput(
  briefElectrodeCount: number,
  gold: OpenDropElectrodeGoldEvidence,
  tmpDir: string,
): ElectrodeRouteMatingProofInput {
  const architecture = derivePcbArchitecture({
    orchestratorContract: {
      quantities: {
        electrode_count: { value: briefElectrodeCount },
      },
    },
  })
  const cartridge = architecture.boards.find((board) => board.boardId === 'electrode_cartridge')
  const architectureElectrodeChannelCount =
    cartridge?.channelRequirements.find((channel) => channel.role === 'electrode_channel')?.count
    ?? 0

  const generated = generateAtopileProject(
    { moduleDecomposition: { modules: [] }, orchestratorContract: { topology: [] } },
    tmpDir,
    {
      requiredWordIds: [],
      requiredFunctionRoles: ['electrode_channel'],
    },
  )
  const electrodeRequirement = generated.functionRequirements.find(
    (requirement) => requirement.role === 'electrode_channel',
  )

  return {
    briefElectrodeCount,
    gold,
    architectureElectrodeChannelCount,
    electrodeChannelImplementation:
      electrodeRequirement?.implementation ?? 'missing',
    matingConnectorPackage: null,
  }
}

/**
 * @description proveCatch: known-bad collapses must fire; the gold/fixture
 * happy path must pass. Throws when the gate fails its own catch contract.
 */
export function proveCatchElectrodeRouteMatingProof(
  gold: OpenDropElectrodeGoldEvidence = loadOpenDropElectrodeGoldFixture(),
): void {
  const good = evaluateElectrodeRouteMatingProof({
    briefElectrodeCount: BRIEF_ELECTRODE_CHANNEL_FLOOR,
    gold,
    architectureElectrodeChannelCount: BRIEF_ELECTRODE_CHANNEL_FLOOR,
    electrodeChannelImplementation: 'passive_board_geometry',
    matingConnectorPackage: null,
  })
  if (!good.ok) {
    throw new Error(
      `proveCatch happy-path failed: ${good.findings.join('; ') || 'unknown'}`,
    )
  }

  const badCases: Array<{ name: string, input: ElectrodeRouteMatingProofInput }> = [
    {
      name: 'sparse_gold_electrode_refs',
      input: {
        briefElectrodeCount: BRIEF_ELECTRODE_CHANNEL_FLOOR,
        gold: { ...gold, fluxlElectrodeRefCount: 8 },
        architectureElectrodeChannelCount: BRIEF_ELECTRODE_CHANNEL_FLOOR,
        electrodeChannelImplementation: 'passive_board_geometry',
      },
    },
    {
      name: 'two_pad_mating_edge',
      input: {
        briefElectrodeCount: BRIEF_ELECTRODE_CHANNEL_FLOOR,
        gold: {
          ...gold,
          matingPadCount: 2,
          matingPadMin: 1,
          matingPadMax: 2,
        },
        architectureElectrodeChannelCount: BRIEF_ELECTRODE_CHANNEL_FLOOR,
        electrodeChannelImplementation: 'passive_board_geometry',
      },
    },
    {
      name: 'architecture_collapsed_channel_count',
      input: {
        briefElectrodeCount: BRIEF_ELECTRODE_CHANNEL_FLOOR,
        gold,
        architectureElectrodeChannelCount: 1,
        electrodeChannelImplementation: 'passive_board_geometry',
      },
    },
    {
      name: 'fitted_jst_collapse',
      input: {
        briefElectrodeCount: BRIEF_ELECTRODE_CHANNEL_FLOOR,
        gold,
        architectureElectrodeChannelCount: BRIEF_ELECTRODE_CHANNEL_FLOOR,
        electrodeChannelImplementation: 'fitted_connector_package',
        matingConnectorPackage: 'Connector_JST:JST_XH_B2B-XH-A_1x02_P2.50mm_Vertical',
      },
    },
  ]

  for (const badCase of badCases) {
    const verdict = evaluateElectrodeRouteMatingProof(badCase.input)
    if (verdict.ok) {
      throw new Error(
        `proveCatch failed to fire on known-bad case ${badCase.name}`,
      )
    }
  }
}
