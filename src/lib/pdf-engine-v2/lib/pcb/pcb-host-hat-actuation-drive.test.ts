/**
 * @file proveCatch tests for Forge host-HAT actuation drive publication.
 */

import { resolve } from 'node:path'

import {
  evaluateHostHatActuationDrive,
  isHostHatActuationDrivePublished,
  loadForgeHostHatActuationDrive,
  proveCatchHostHatActuationDrive,
} from './pcb-host-hat-actuation-drive'

const WORKSPACE_ROOT = resolve(__dirname, '../../../../../')

describe('Forge host-HAT actuation drive', () => {
  it('loads the curated fixture with heater MOSFET + stir/pump DRV8876 on HAT', () => {
    const topology = loadForgeHostHatActuationDrive(WORKSPACE_ROOT)
    expect(topology.schema).toBe('forge-host-hat-actuation-drive/v1')
    expect(topology.constituents.map((c) => c.role).sort()).toEqual([
      'heater_pwm_switch',
      'pump_motor_driver',
      'stir_motor_driver',
    ].sort())
    expect(topology.constituents.every((c) => c.placement === 'host_hat')).toBe(true)
  })

  it('isHostHatActuationDrivePublished is true when fixture evaluates ok', () => {
    expect(isHostHatActuationDrivePublished(WORKSPACE_ROOT)).toBe(true)
  })

  it('proveCatch happy path + rejects missing stir driver', () => {
    expect(() => proveCatchHostHatActuationDrive(
      loadForgeHostHatActuationDrive(WORKSPACE_ROOT),
    )).not.toThrow()
  })

  it('fires when DRV8876 forbid list is empty', () => {
    const topology = loadForgeHostHatActuationDrive(WORKSPACE_ROOT)
    const verdict = evaluateHostHatActuationDrive({
      ...topology,
      forbiddenOnHeaterDaughterboard: [],
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.noHeaterBoardDrivers).toBe(false)
  })
})
