/**
 * @file Forge-curated host-HAT actuation drive topology.
 * @description Pioreactor gold publishes heater_20ml (resistive FFC daughterboard)
 * but NOT HAT electricals (`hats/` is EEPROM utils). Culture instruments still need
 * heater PWM + stir/pump drive on the host HAT. This module is that published
 * Forge topology — never invent DRV8876 on the heater PCB (see wet-actuation proveCatch).
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface HostHatActuationConstituent {
  role: string
  manufacturer: string
  partNumber: string
  package: string
  placement: 'host_hat'
  evidence: string
}

export interface ForgeHostHatActuationDrive {
  schema: 'forge-host-hat-actuation-drive/v1'
  sourceKind: string
  goldConstraint: string
  gpioContractEvidence: string[]
  constituents: HostHatActuationConstituent[]
  forbiddenOnHeaterDaughterboard: string[]
  notes: string[]
}

export interface HostHatActuationDriveVerdict {
  ok: boolean
  findings: string[]
  heaterSwitchOnHat: boolean
  stirPumpDriversOnHat: boolean
  noHeaterBoardDrivers: boolean
}

const FIXTURE_RELATIVE =
  'tests/fixtures/pcb/yuri/forge-host-hat-actuation-drive.json'

const REQUIRED_ROLES = [
  'heater_pwm_switch',
  'stir_motor_driver',
  'pump_motor_driver',
] as const

/**
 * @description Load the checked-in Forge host-HAT actuation drive fixture.
 */
export function loadForgeHostHatActuationDrive(
  workspaceRoot: string = process.cwd(),
): ForgeHostHatActuationDrive {
  const path = resolve(workspaceRoot, FIXTURE_RELATIVE)
  if (!existsSync(path)) {
    throw new Error(`host-HAT actuation drive fixture missing: ${path}`)
  }
  return JSON.parse(readFileSync(path, 'utf8')) as ForgeHostHatActuationDrive
}

/**
 * @description Pure decision: fixture publishes heater MOSFET + stir/pump DRV8876 on HAT only.
 */
export function evaluateHostHatActuationDrive(
  topology: ForgeHostHatActuationDrive,
): HostHatActuationDriveVerdict {
  const findings: string[] = []
  const roles = new Set(topology.constituents.map((c) => c.role))
  const heaterSwitchOnHat =
    roles.has('heater_pwm_switch')
    && topology.constituents.some(
      (c) => c.role === 'heater_pwm_switch' && c.placement === 'host_hat' && c.partNumber.trim(),
    )
  if (!heaterSwitchOnHat) {
    findings.push('heater_pwm_switch must be published on host_hat with a real MPN')
  }

  const stirPumpDriversOnHat = (['stir_motor_driver', 'pump_motor_driver'] as const).every(
    (role) =>
      roles.has(role)
      && topology.constituents.some(
        (c) => c.role === role && c.placement === 'host_hat' && /DRV8876/i.test(c.partNumber),
      ),
  )
  if (!stirPumpDriversOnHat) {
    findings.push('stir/pump motor drivers must be DRV8876 on host_hat')
  }

  const noHeaterBoardDrivers = topology.constituents.every((c) => c.placement === 'host_hat')
    && REQUIRED_ROLES.every((role) => roles.has(role))
    && topology.forbiddenOnHeaterDaughterboard.some((mpn) => /DRV8876/i.test(mpn))
  if (!noHeaterBoardDrivers) {
    findings.push('fixture must keep all drive ICs on host_hat and forbid DRV8876 on heater PCB')
  }

  return {
    ok: heaterSwitchOnHat && stirPumpDriversOnHat && noHeaterBoardDrivers && findings.length === 0,
    findings,
    heaterSwitchOnHat,
    stirPumpDriversOnHat,
    noHeaterBoardDrivers,
  }
}

/**
 * @description True when the Forge host-HAT drive fixture is present and evaluates ok.
 * Universal — no product slug; culture boards read this before minting stir/pump channels.
 */
export function isHostHatActuationDrivePublished(
  workspaceRoot: string = process.cwd(),
): boolean {
  try {
    const topology = loadForgeHostHatActuationDrive(workspaceRoot)
    return evaluateHostHatActuationDrive(topology).ok
  } catch {
    return false
  }
}

/**
 * @description proveCatch: happy path passes; missing stir driver / heater-board placement fires.
 */
export function proveCatchHostHatActuationDrive(
  topology: ForgeHostHatActuationDrive = loadForgeHostHatActuationDrive(),
): void {
  const good = evaluateHostHatActuationDrive(topology)
  if (!good.ok) {
    throw new Error(`proveCatch happy-path failed: ${good.findings.join('; ')}`)
  }

  const missingStir: ForgeHostHatActuationDrive = {
    ...topology,
    constituents: topology.constituents.filter((c) => c.role !== 'stir_motor_driver'),
  }
  const badStir = evaluateHostHatActuationDrive(missingStir)
  if (badStir.ok || badStir.stirPumpDriversOnHat) {
    throw new Error('proveCatch failed to reject missing stir_motor_driver')
  }

  const onHeaterBoard: ForgeHostHatActuationDrive = {
    ...topology,
    constituents: topology.constituents.map((c) =>
      c.role === 'heater_pwm_switch'
        ? { ...c, placement: 'host_hat' as const }
        : c),
    // Force dishonest by emptying forbidden list — evaluator requires DRV8876 forbid.
    forbiddenOnHeaterDaughterboard: [],
  }
  const badForbid = evaluateHostHatActuationDrive(onHeaterBoard)
  if (badForbid.ok || badForbid.noHeaterBoardDrivers) {
    throw new Error('proveCatch failed to reject missing DRV8876 heater-board forbid')
  }
}
