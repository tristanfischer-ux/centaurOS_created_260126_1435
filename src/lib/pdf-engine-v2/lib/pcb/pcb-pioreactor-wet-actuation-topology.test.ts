/**
 * @file Pioreactor wet-actuation topology proveCatch tests.
 */

import { resolve } from 'node:path'

import {
  PIOREACTOR_GOLD_COMMIT,
  evaluatePioreactorWetActuationTopology,
  goldHeaterBomContainsFixtureMpns,
  loadPioreactorHeaterChannelTopology,
  proveCatchPioreactorWetActuationTopology,
  resolvePioreactorGoldRoot,
} from './pcb-pioreactor-wet-actuation-topology'

const WORKSPACE_ROOT = resolve(__dirname, '../../../../../')

describe('Pioreactor wet-actuation topology (heater_20ml gold)', () => {
  it('loads the gold heater-channel decomposition fixture', () => {
    const topology = loadPioreactorHeaterChannelTopology(WORKSPACE_ROOT)

    expect(topology.schema).toBe('pioreactor-heater-channel-topology/v1')
    expect(topology.sourceCommit).toBe(PIOREACTOR_GOLD_COMMIT)
    expect(topology.constituents.map((item) => item.partNumber).sort()).toEqual([
      '52207-0760',
      'DRV5021A3QDBZR',
      'ESR18EZPJ3R9',
      'TMP1075DSGR',
    ].sort())
    expect(topology.powerSwitch.placement).toBe('off_board_host_hat')
    expect(topology.stirPumpChannels.status).toMatch(/blocked|unpublished/i)
  })

  it('proveCatch rejects DRV8876-as-heater and invented on-board switches', () => {
    expect(() => proveCatchPioreactorWetActuationTopology(
      loadPioreactorHeaterChannelTopology(WORKSPACE_ROOT),
    )).not.toThrow()
  })

  it('passes the honest gold heater topology without a fitted motor-driver stand-in', () => {
    const topology = loadPioreactorHeaterChannelTopology(WORKSPACE_ROOT)
    const verdict = evaluatePioreactorWetActuationTopology(topology, null)

    expect(verdict.ok).toBe(true)
    expect(verdict.findings).toEqual([])
  })

  it('fires when DRV8876 is proposed as the heater channel driver', () => {
    const topology = loadPioreactorHeaterChannelTopology(WORKSPACE_ROOT)
    const verdict = evaluatePioreactorWetActuationTopology(topology, 'DRV8876PWPR')

    expect(verdict.ok).toBe(false)
    expect(verdict.forbiddenSubstitutionRejected).toBe(false)
    expect(verdict.findings.join(' ')).toMatch(/DRV8876|resistive FFC/i)
  })

  it('fires when stir/pump are falsely marked resolved without HAT electricals', () => {
    const topology = loadPioreactorHeaterChannelTopology(WORKSPACE_ROOT)
    const verdict = evaluatePioreactorWetActuationTopology({
      ...topology,
      stirPumpChannels: {
        status: 'resolved_with_DRV8876',
        evidence: 'invented',
      },
    })

    expect(verdict.ok).toBe(false)
    expect(verdict.stirPumpBlockedHonestly).toBe(false)
  })

  it('re-checks gold heater BOM MPNs when the Pioreactor gold checkout is available', () => {
    const goldRoot = resolvePioreactorGoldRoot(WORKSPACE_ROOT)
    if (!goldRoot) {
      // eslint-disable-next-line no-console
      console.warn('[pioreactor-wet-actuation] gold checkout missing — skipping live BOM SIGHT')
      return
    }

    const topology = loadPioreactorHeaterChannelTopology(WORKSPACE_ROOT)
    const sight = goldHeaterBomContainsFixtureMpns(goldRoot, topology)

    expect(sight.ok).toBe(true)
    expect(sight.missing).toEqual([])
  })
})
