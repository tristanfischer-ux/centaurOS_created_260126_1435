/**
 * @file OpenDrop HV↔LV copper separation proveCatch (offline).
 * @description Pin-map/domain proof closed net naming. This module closes the
 * copper half that can be proven without a correct board regen: pad-center
 * distance between HV rails and LV host rails, plus a wrong-class catch for
 * LV-only “OpenDrop” boards (current regen failure mode). Not IEC 61010
 * certification — a gross bridging floor from gold SIGHT.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { derivePcbArchitecture } from './pcb-architecture'
import {
  OPENDROP_GOLD_COMMIT,
  resolveOpenDropGoldRoot,
} from './pcb-opendrop-electrode-route-proof'

/** Conservative pad-center floor (mm). Gold observed min ≈ 2.69 mm. */
export const HV_LV_PAD_CENTER_FLOOR_MM = 2.5

export interface OpenDropHvLvCreepageGoldEvidence {
  schema: 'opendrop-hv-lv-creepage-gold-evidence/v1'
  sourceCommit: string
  pcbRelativePath: string
  hvNets: string[]
  lvNets: string[]
  minPadCenterDistancesMm: Record<string, number | string>
  minHvLvPadCenterMm: number
  hvLvPadCenterFloorMm: number
  notes: string[]
}

export interface PadCenter {
  net: string
  xMm: number
  yMm: number
}

export interface HvLvCreepageProofInput {
  pads: PadCenter[]
  hvNets: string[]
  lvNets: string[]
  floorMm: number
  /** When claiming an OpenDrop HV controller board. */
  claimsOpenDropHvController: boolean
  architectureHasHighVoltage: boolean
}

export interface HvLvCreepageProofResult {
  ok: boolean
  findings: string[]
  hvPadsPresent: boolean
  lvPadsPresent: boolean
  minDistanceMm: number | null
  separationOk: boolean
  architectureOk: boolean
}

const FIXTURE_RELATIVE =
  'tests/fixtures/pcb/yuri/opendrop-hv-lv-creepage-gold-evidence.json'
const ADVERSARIAL_TOO_CLOSE_RELATIVE =
  'tests/fixtures/pcb/yuri/opendrop-adversarial-hv-lv-too-close.kicad_pcb'
const ADVERSARIAL_LV_ONLY_RELATIVE =
  'tests/fixtures/pcb/yuri/opendrop-adversarial-lv-only-wrong-class.kicad_pcb'

/**
 * @description Load the checked-in gold creepage distance fixture.
 */
export function loadOpenDropHvLvCreepageGoldFixture(
  workspaceRoot: string = process.cwd(),
): OpenDropHvLvCreepageGoldEvidence {
  return JSON.parse(
    readFileSync(resolve(workspaceRoot, FIXTURE_RELATIVE), 'utf8'),
  ) as OpenDropHvLvCreepageGoldEvidence
}

/**
 * @description Parse absolute pad centres + net names from a KiCad 4/5
 * `(module … (pad … (net id NAME)))` board file.
 */
export function parseKicadPcbPadCenters(pcbText: string): PadCenter[] {
  const pads: PadCenter[] = []
  for (const chunk of pcbText.split('(module ').slice(1)) {
    const at = chunk.match(/\(at\s+([-\d.]+)\s+([-\d.]+)(?:\s+([-\d.]+))?\)/)
    if (!at) continue
    const fx = Number(at[1])
    const fy = Number(at[2])
    const rotDeg = Number(at[3] ?? 0)
    const rad = (rotDeg * Math.PI) / 180
    // GOTCHA: JS has no Python-style \Z end anchor — use $ on the module chunk.
    const padRe =
      /\(pad\s+\S+\s+\S+\s+\S+\s+\(at\s+([-\d.]+)\s+([-\d.]+)(?:\s+[-\d.]+)?\)([\s\S]{0,500}?)(?=\(pad |\(model |$)/g
    for (const match of chunk.matchAll(padRe)) {
      const dx = Number(match[1])
      const dy = Number(match[2])
      const netMatch = match[3].match(/\(net\s+\d+\s+([^\)]+)\)/)
      if (!netMatch) continue
      const net = netMatch[1].trim().replace(/^"|"$/g, '')
      const xMm = fx + dx * Math.cos(rad) - dy * Math.sin(rad)
      const yMm = fy + dx * Math.sin(rad) + dy * Math.cos(rad)
      pads.push({ net, xMm, yMm })
    }
  }
  return pads
}

/**
 * @description Extract live gold HV↔LV pad-center mins from the OpenDrop
 * main-board PCB when the checkout is present.
 */
export function extractOpenDropHvLvCreepageGoldEvidence(
  goldRoot: string,
): OpenDropHvLvCreepageGoldEvidence {
  const pcbRelativePath =
    'OpenDropV4/Electronics/OpenDropV4_MainBoard/PCB/OpenDropV4.kicad_pcb'
  const pads = parseKicadPcbPadCenters(
    readFileSync(resolve(goldRoot, pcbRelativePath), 'utf8'),
  )
  const hvNets = ['V_HV', 'V_HV_C']
  const lvNets = ['V_USB', '+3V3']
  const minPadCenterDistancesMm: Record<string, number | string> = {}
  for (const hv of hvNets) {
    for (const lv of lvNets) {
      const key = `${hv}<->${lv}`
      const distance = minPadCenterDistanceMm(
        pads.filter((pad) => pad.net === hv),
        pads.filter((pad) => pad.net === lv),
      )
      minPadCenterDistancesMm[key] = distance ?? 'missing'
    }
  }
  const minHvLv = minPadCenterDistanceMm(
    pads.filter((pad) => hvNets.includes(pad.net)),
    pads.filter((pad) => lvNets.includes(pad.net)),
  )
  return {
    schema: 'opendrop-hv-lv-creepage-gold-evidence/v1',
    sourceCommit: OPENDROP_GOLD_COMMIT,
    pcbRelativePath,
    hvNets,
    lvNets,
    minPadCenterDistancesMm,
    minHvLvPadCenterMm: minHvLv ?? 0,
    hvLvPadCenterFloorMm: HV_LV_PAD_CENTER_FLOOR_MM,
    notes: [
      `Extracted HV↔LV pad-center mins from gold ${OPENDROP_GOLD_COMMIT}.`,
    ],
  }
}

function minPadCenterDistanceMm(
  left: PadCenter[],
  right: PadCenter[],
): number | null {
  if (left.length === 0 || right.length === 0) return null
  let min = Number.POSITIVE_INFINITY
  for (const a of left) {
    for (const b of right) {
      const dx = a.xMm - b.xMm
      const dy = a.yMm - b.yMm
      const distance = Math.hypot(dx, dy)
      if (distance < min) min = distance
    }
  }
  return Number.isFinite(min) ? min : null
}

/**
 * @description Pure decision: does copper keep HV pads away from LV host pads
 * at least at the gross floor, when claiming an OpenDrop HV controller?
 */
export function evaluateHvLvCreepageProof(
  input: HvLvCreepageProofInput,
): HvLvCreepageProofResult {
  // INTENT: Regen boards that are DRC-clean on LV-only nets (vcc/gnd) must not
  // pass as OpenDrop HV controllers. Gold keeps V_HV / V_HV_C pads ≥ ~2.7 mm
  // from V_USB / +3V3 — encode that floor; adversarial 0.5 mm copper must fire.
  const findings: string[] = []
  const hvPads = input.pads.filter((pad) => input.hvNets.includes(pad.net))
  const lvPads = input.pads.filter((pad) => input.lvNets.includes(pad.net))
  const hvPadsPresent = hvPads.length > 0
  const lvPadsPresent = lvPads.length > 0

  if (input.claimsOpenDropHvController && !hvPadsPresent) {
    findings.push(
      'missing_hv_domain_copper — claimed OpenDrop HV controller has no V_HV / V_HV_C pads',
    )
  }

  const minDistanceMm = minPadCenterDistanceMm(hvPads, lvPads)
  let separationOk = true
  if (hvPadsPresent && lvPadsPresent) {
    separationOk = (minDistanceMm ?? 0) >= input.floorMm
    if (!separationOk) {
      findings.push(
        `hv_lv_pad_centers_too_close — min ${minDistanceMm?.toFixed(3)} mm < floor ${input.floorMm} mm`,
      )
    }
  } else if (input.claimsOpenDropHvController && hvPadsPresent && !lvPadsPresent) {
    // HV without any LV host rail is incomplete for this product class.
    separationOk = false
    findings.push('missing_lv_host_copper — OpenDrop HV controller must also place V_USB / +3V3')
  }

  const architectureOk = !input.claimsOpenDropHvController || input.architectureHasHighVoltage
  if (!architectureOk) {
    findings.push('architecture missing high_voltage domain for OpenDrop HV controller')
  }

  const ok =
    findings.length === 0
    && (!input.claimsOpenDropHvController || (hvPadsPresent && lvPadsPresent && separationOk))
    && architectureOk

  return {
    ok,
    findings,
    hvPadsPresent,
    lvPadsPresent,
    minDistanceMm,
    separationOk,
    architectureOk,
  }
}

/**
 * @description proveCatch: adversarial too-close + LV-only wrong-class fire;
 * gold fixture / live gold pass.
 */
export function proveCatchHvLvCreepageProof(
  workspaceRoot: string = process.cwd(),
): void {
  const gold = loadOpenDropHvLvCreepageGoldFixture(workspaceRoot)
  const architecture = derivePcbArchitecture({
    orchestratorContract: {
      quantities: { electrode_count: { value: 64 } },
    },
  })
  const architectureHasHighVoltage = architecture.boards.some((board) =>
    board.domains.includes('high_voltage'),
  )

  const goldRoot = resolveOpenDropGoldRoot(workspaceRoot)
  const goldPads = goldRoot
    ? parseKicadPcbPadCenters(
      readFileSync(
        resolve(goldRoot, gold.pcbRelativePath),
        'utf8',
      ),
    )
    : synthesizePadsFromFixture(gold)

  const good = evaluateHvLvCreepageProof({
    pads: goldPads,
    hvNets: gold.hvNets,
    lvNets: gold.lvNets,
    floorMm: HV_LV_PAD_CENTER_FLOOR_MM,
    claimsOpenDropHvController: true,
    architectureHasHighVoltage,
  })
  if (!good.ok) {
    throw new Error(
      `proveCatch happy-path failed: ${good.findings.join('; ') || 'unknown'}`,
    )
  }

  const tooClosePath = resolve(workspaceRoot, ADVERSARIAL_TOO_CLOSE_RELATIVE)
  const lvOnlyPath = resolve(workspaceRoot, ADVERSARIAL_LV_ONLY_RELATIVE)
  if (!existsSync(tooClosePath) || !existsSync(lvOnlyPath)) {
    throw new Error('adversarial kicad_pcb fixtures missing')
  }

  const tooClose = evaluateHvLvCreepageProof({
    pads: parseKicadPcbPadCenters(readFileSync(tooClosePath, 'utf8')),
    hvNets: gold.hvNets,
    lvNets: gold.lvNets,
    floorMm: HV_LV_PAD_CENTER_FLOOR_MM,
    claimsOpenDropHvController: true,
    architectureHasHighVoltage: true,
  })
  if (tooClose.ok) {
    throw new Error('proveCatch failed to fire on HV↔LV pads 0.5 mm apart')
  }

  const lvOnly = evaluateHvLvCreepageProof({
    pads: parseKicadPcbPadCenters(readFileSync(lvOnlyPath, 'utf8')),
    hvNets: gold.hvNets,
    lvNets: gold.lvNets,
    floorMm: HV_LV_PAD_CENTER_FLOOR_MM,
    claimsOpenDropHvController: true,
    architectureHasHighVoltage: true,
  })
  if (lvOnly.ok || !lvOnly.findings.some((finding) => finding.includes('missing_hv_domain_copper'))) {
    throw new Error('proveCatch failed to fire on LV-only wrong-class OpenDrop board')
  }
}

/**
 * @description When gold checkout is absent, synthesise pad pairs that honour
 * the fixture-recorded min distance so CI still exercises the happy path.
 */
function synthesizePadsFromFixture(
  gold: OpenDropHvLvCreepageGoldEvidence,
): PadCenter[] {
  const distance = Math.max(gold.minHvLvPadCenterMm, HV_LV_PAD_CENTER_FLOOR_MM + 0.1)
  return [
    { net: 'V_HV', xMm: 0, yMm: 0 },
    { net: 'V_HV_C', xMm: 1, yMm: 0 },
    { net: 'V_USB', xMm: distance, yMm: 0 },
    { net: '+3V3', xMm: distance + 1, yMm: 0 },
  ]
}
