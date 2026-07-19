/**
 * @file Pioreactor wet-actuation topology proof (heater channel from gold).
 * @description After fitted-MPN closure, Pioreactor heater/stir/pump remain
 * functional requirements. Gold `heater_20ml` @ ca40a91e decomposes the heater
 * channel into FFC + resistive loads + sense ICs, with power switching on the
 * unpublished host HAT — never a fitted DRV8876 stand-in.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const PIOREACTOR_GOLD_COMMIT = 'ca40a91e728801b139b1086853f7cf74ce76def9'

export interface HeaterChannelConstituent {
  role: string
  manufacturer: string
  partNumber: string
  package: string
  quantity?: number
  evidence: string
}

export interface PioreactorHeaterChannelTopology {
  schema: 'pioreactor-heater-channel-topology/v1'
  sourceCommit: string
  sourceRepo: string
  boardPath: string
  channelRole: 'heater_channel'
  topologyKind: string
  constituents: HeaterChannelConstituent[]
  powerSwitch: {
    placement: 'off_board_host_hat'
    status: string
    evidence: string[]
  }
  forbiddenSubstitutions: Array<{ partNumber: string, reason: string }>
  stirPumpChannels: {
    status: string
    evidence: string
  }
  notes: string[]
}

export interface WetActuationTopologyVerdict {
  ok: boolean
  findings: string[]
  heaterDaughterboardOk: boolean
  heaterSwitchHonest: boolean
  forbiddenSubstitutionRejected: boolean
  stirPumpBlockedHonestly: boolean
}

const FIXTURE_RELATIVE =
  'tests/fixtures/pcb/yuri/pioreactor-heater-channel-topology.json'

const REQUIRED_HEATER_ROLES = [
  'host_ffc_connector',
  'resistive_heater_element',
  'temperature_sense_ic',
  'magnetic_lid_sense_ic',
] as const

/**
 * @description Load the checked-in heater-channel topology fixture.
 */
export function loadPioreactorHeaterChannelTopology(
  workspaceRoot: string = process.cwd(),
): PioreactorHeaterChannelTopology {
  return JSON.parse(
    readFileSync(resolve(workspaceRoot, FIXTURE_RELATIVE), 'utf8'),
  ) as PioreactorHeaterChannelTopology
}

/**
 * @description Resolve frozen Pioreactor hardware gold when present.
 */
export function resolvePioreactorGoldRoot(
  cwd: string = process.cwd(),
): string | null {
  const envRoot = process.env.PIOREACTOR_GOLD_ROOT?.trim()
  const candidates = [
    envRoot,
    resolve(cwd, 'out/_gold-pioreactor-repo'),
    resolve(cwd, '../CentaurOS-oxccu-efuel/out/_gold-pioreactor-repo'),
    '/Users/tristanfischer/Developer/CentaurOS-oxccu-efuel/out/_gold-pioreactor-repo',
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    const bom = resolve(
      candidate,
      'heater_20ml/Heater_Jan_0824_Public/Assembly/Bill of Materials-Heater(DEV).xlsx',
    )
    if (existsSync(bom)) return candidate
  }
  return null
}

/**
 * @description SIGHT: confirm the gold heater BOM still names the fixture MPNs.
 * @param goldRoot Absolute `_gold-pioreactor-repo` path.
 * @param topology Fixture topology to verify against live BOM shared strings.
 */
export function goldHeaterBomContainsFixtureMpns(
  goldRoot: string,
  topology: PioreactorHeaterChannelTopology,
): { ok: boolean, missing: string[] } {
  const bomPath = resolve(
    goldRoot,
    'heater_20ml/Heater_Jan_0824_Public/Assembly/Bill of Materials-Heater(DEV).xlsx',
  )
  // DECISION: xlsx stores part numbers in xl/sharedStrings.xml inside the zip.
  // Reading the raw container bytes misses UTF-8 shared-string payloads; unzip -p
  // is the portable SIGHT path already available on macOS CI agents.
  const sharedStrings = execFileSync(
    'unzip',
    ['-p', bomPath, 'xl/sharedStrings.xml'],
    { encoding: 'utf8' },
  )
  const missing = topology.constituents
    .map((constituent) => constituent.partNumber)
    .filter((mpn) => {
      if (sharedStrings.includes(mpn)) return false
      if (mpn === '52207-0760') {
        return !(
          sharedStrings.includes('0522070760')
          || sharedStrings.includes('522070760')
        )
      }
      return true
    })
  return { ok: missing.length === 0, missing }
}

/**
 * @description Pure decision for the heater-channel topology contract.
 * @param topology Gold-derived heater topology fixture.
 * @param proposedHeaterDriverMpn Optional MPN someone tried to assign as the heater switch IC.
 */
export function evaluatePioreactorWetActuationTopology(
  topology: PioreactorHeaterChannelTopology,
  proposedHeaterDriverMpn: string | null = null,
): WetActuationTopologyVerdict {
  // INTENT: Gold heater_20ml is a resistive FFC daughterboard. Promoting a
  // motor-driver IC as the "heater channel" is the known false closure mode.
  const findings: string[] = []
  const roles = new Set(topology.constituents.map((item) => item.role))
  const heaterDaughterboardOk = REQUIRED_HEATER_ROLES.every((role) => roles.has(role))
    && topology.constituents.every((item) => item.partNumber.trim().length > 0)
  if (!heaterDaughterboardOk) {
    findings.push('heater_20ml gold constituents incomplete (FFC/resistors/TMP1075/DRV5021 required)')
  }

  const heaterSwitchHonest =
    topology.powerSwitch.placement === 'off_board_host_hat'
    && /unpublished|off[_ -]?board/i.test(topology.powerSwitch.status)
  if (!heaterSwitchHonest) {
    findings.push('heater power switch must remain honestly off-board on the unpublished host HAT')
  }

  const forbidden = topology.forbiddenSubstitutions.map((item) =>
    item.partNumber.trim().toUpperCase())
  const proposed = proposedHeaterDriverMpn?.trim().toUpperCase() ?? null
  const forbiddenSubstitutionRejected = !(proposed && forbidden.includes(proposed))
  if (!forbiddenSubstitutionRejected && proposed) {
    findings.push(
      `forbidden heater substitution ${proposed} — gold topology is resistive FFC, not a motor driver IC`,
    )
  }

  const stirPumpBlockedHonestly =
    /blocked|unpublished/i.test(topology.stirPumpChannels.status)
  if (!stirPumpBlockedHonestly) {
    findings.push('stir/pump channels must stay blocked until HAT electricals are published')
  }

  return {
    ok:
      heaterDaughterboardOk
      && heaterSwitchHonest
      && forbiddenSubstitutionRejected
      && stirPumpBlockedHonestly,
    findings,
    heaterDaughterboardOk,
    heaterSwitchHonest,
    forbiddenSubstitutionRejected,
    stirPumpBlockedHonestly,
  }
}

/**
 * @description proveCatch: good gold topology passes; DRV8876-as-heater fires.
 */
export function proveCatchPioreactorWetActuationTopology(
  topology: PioreactorHeaterChannelTopology = loadPioreactorHeaterChannelTopology(),
): void {
  const good = evaluatePioreactorWetActuationTopology(topology, null)
  if (!good.ok) {
    throw new Error(`proveCatch happy-path failed: ${good.findings.join('; ')}`)
  }

  const badDriver = evaluatePioreactorWetActuationTopology(topology, 'DRV8876PWPR')
  if (badDriver.ok || badDriver.forbiddenSubstitutionRejected) {
    throw new Error('proveCatch failed to reject DRV8876 as heater-channel driver')
  }

  const inventedSwitchOnBoard: PioreactorHeaterChannelTopology = {
    ...topology,
    powerSwitch: {
      placement: 'off_board_host_hat',
      status: 'fitted_on_heater_pcb',
      evidence: ['invented'],
    },
  }
  // Force dishonest placement by mutating the typed placement through a cast —
  // the gate must reject any non off_board_host_hat story.
  const dishonest = {
    ...inventedSwitchOnBoard,
    powerSwitch: {
      placement: 'on_heater_pcb' as unknown as 'off_board_host_hat',
      status: 'fitted_mosfet',
      evidence: ['invented'],
    },
  }
  const badSwitch = evaluatePioreactorWetActuationTopology(dishonest)
  if (badSwitch.ok || badSwitch.heaterSwitchHonest) {
    throw new Error('proveCatch failed to reject on-board invented heater switch')
  }
}
