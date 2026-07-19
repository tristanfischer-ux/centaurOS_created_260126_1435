/**
 * @file OpenDrop HV-domain / Mini-DIMM pin-map proveCatch tests.
 */

import { resolve } from 'node:path'

import {
  BRIEF_ELECTRODE_CHANNEL_FLOOR,
  GOLD_MINI_DIMM_MATING_PAD_COUNT,
  OPENDROP_GOLD_COMMIT,
  resolveOpenDropGoldRoot,
} from './pcb-opendrop-electrode-route-proof'
import {
  buildHvDomainPinmapProofInput,
  evaluateHvDomainPinmapProof,
  extractOpenDropHvDomainPinmapGoldEvidence,
  goldImpliedPinmapAssignments,
  loadOpenDropHvDomainPinmapGoldFixture,
  proveCatchHvDomainPinmapProof,
} from './pcb-opendrop-hv-domain-pinmap-proof'

const WORKSPACE_ROOT = resolve(__dirname, '../../../../../')

describe('OpenDrop HV-domain / Mini-DIMM pin-map proof', () => {
  it('loads the frozen gold fixture with HV rails, isolators, and Mini-DIMM mating', () => {
    const fixture = loadOpenDropHvDomainPinmapGoldFixture(WORKSPACE_ROOT)

    expect(fixture.schema).toBe('opendrop-hv-domain-pinmap-gold-evidence/v1')
    expect(fixture.sourceCommit).toBe(OPENDROP_GOLD_COMMIT)
    expect(fixture.mainObservedNets).toEqual(
      expect.arrayContaining(['V_HV', 'V_HV_C', 'GND_C', 'V_USB']),
    )
    expect(fixture.cartridgeObservedNets).toEqual(
      expect.arrayContaining(['V_HV_C', 'GND_C']),
    )
    expect(fixture.hvGeneratorPart).toMatch(/MAX1771/)
    expect(fixture.isolationPart).toBe('TLP222A')
    expect(fixture.isolationPartCount).toBeGreaterThanOrEqual(4)
    expect(fixture.matingPadCount).toBe(GOLD_MINI_DIMM_MATING_PAD_COUNT)
    expect(fixture.fluxlElectrodeRefCount).toBeGreaterThanOrEqual(
      BRIEF_ELECTRODE_CHANNEL_FLOOR,
    )
  })

  it('proveCatch fires on LV/domain collapses and passes the gold happy path', () => {
    expect(() => proveCatchHvDomainPinmapProof(
      loadOpenDropHvDomainPinmapGoldFixture(WORKSPACE_ROOT),
    )).not.toThrow()
  })

  it('rejects architecture that drops high_voltage (Rodeostat-template collapse)', () => {
    const fixture = loadOpenDropHvDomainPinmapGoldFixture(WORKSPACE_ROOT)
    const base = buildHvDomainPinmapProofInput(BRIEF_ELECTRODE_CHANNEL_FLOOR, fixture)
    const verdict = evaluateHvDomainPinmapProof({
      ...base,
      hvControllerDomains: ['logic', 'analog'],
      electrodeCartridgeDomains: ['analog', 'wet_interface'],
    })

    expect(verdict.ok).toBe(false)
    expect(verdict.architectureDomainsOk).toBe(false)
    expect(verdict.findings.join(' ')).toMatch(/high_voltage/)
  })

  it('rejects pin-map that parks electrode/FLUXL on USB/LV-only', () => {
    const fixture = loadOpenDropHvDomainPinmapGoldFixture(WORKSPACE_ROOT)
    const base = buildHvDomainPinmapProofInput(BRIEF_ELECTRODE_CHANNEL_FLOOR, fixture)
    const verdict = evaluateHvDomainPinmapProof({
      ...base,
      pinmapAssignments: [
        ...goldImpliedPinmapAssignments(fixture).filter(
          (assignment) => assignment.netOrFamily !== fixture.electrodeNetFamily,
        ),
        { netOrFamily: fixture.electrodeNetFamily, netClass: 'lv_host' },
      ],
    })

    expect(verdict.ok).toBe(false)
    expect(verdict.pinmapClassesOk).toBe(false)
    expect(verdict.findings.join(' ')).toMatch(/USB\/LV|electrode_array|lv_host/)
  })

  it('derives architecture domains + isolate_high_voltage work for electrode_count≥8', () => {
    const fixture = loadOpenDropHvDomainPinmapGoldFixture(WORKSPACE_ROOT)
    const input = buildHvDomainPinmapProofInput(BRIEF_ELECTRODE_CHANNEL_FLOOR, fixture)
    const verdict = evaluateHvDomainPinmapProof(input)

    expect(input.hvControllerDomains).toContain('high_voltage')
    expect(input.electrodeCartridgeDomains).toContain('high_voltage')
    expect(input.hvControllerWork).toContain('isolate_high_voltage')
    expect(verdict.ok).toBe(true)
    expect(verdict.findings).toEqual([])
  })

  it('re-extracts gold schematics when the OpenDrop gold checkout is available', () => {
    const goldRoot = resolveOpenDropGoldRoot(WORKSPACE_ROOT)
    if (!goldRoot) {
      // eslint-disable-next-line no-console
      console.warn('[opendrop-hv-pinmap-proof] gold checkout missing — skipping live extract')
      return
    }

    const live = extractOpenDropHvDomainPinmapGoldEvidence(goldRoot)
    const fixture = loadOpenDropHvDomainPinmapGoldFixture(WORKSPACE_ROOT)

    expect(live.mainObservedNets).toEqual(fixture.mainObservedNets)
    expect(live.cartridgeObservedNets).toEqual(fixture.cartridgeObservedNets)
    expect(live.isolationPartCount).toBe(fixture.isolationPartCount)
    expect(live.fluxlElectrodeRefCount).toBe(fixture.fluxlElectrodeRefCount)
    expect(live.sourceCommit).toBe(OPENDROP_GOLD_COMMIT)
  })
})
