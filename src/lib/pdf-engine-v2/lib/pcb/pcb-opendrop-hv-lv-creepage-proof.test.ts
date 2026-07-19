/**
 * @file OpenDrop HV↔LV copper separation proveCatch tests.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  OPENDROP_GOLD_COMMIT,
  resolveOpenDropGoldRoot,
} from './pcb-opendrop-electrode-route-proof'
import {
  HV_LV_PAD_CENTER_FLOOR_MM,
  evaluateHvLvCreepageProof,
  extractOpenDropHvLvCreepageGoldEvidence,
  loadOpenDropHvLvCreepageGoldFixture,
  parseKicadPcbPadCenters,
  proveCatchHvLvCreepageProof,
} from './pcb-opendrop-hv-lv-creepage-proof'

const WORKSPACE_ROOT = resolve(__dirname, '../../../../../')

describe('OpenDrop HV↔LV creepage / copper separation proof', () => {
  it('loads gold fixture with pad-center floor above observed bridging risk', () => {
    const fixture = loadOpenDropHvLvCreepageGoldFixture(WORKSPACE_ROOT)

    expect(fixture.schema).toBe('opendrop-hv-lv-creepage-gold-evidence/v1')
    expect(fixture.sourceCommit).toBe(OPENDROP_GOLD_COMMIT)
    expect(fixture.minHvLvPadCenterMm).toBeGreaterThanOrEqual(HV_LV_PAD_CENTER_FLOOR_MM)
    expect(fixture.hvLvPadCenterFloorMm).toBe(HV_LV_PAD_CENTER_FLOOR_MM)
  })

  it('proveCatch fires on too-close and LV-only wrong-class boards', () => {
    expect(() => proveCatchHvLvCreepageProof(WORKSPACE_ROOT)).not.toThrow()
  })

  it('rejects adversarial HV↔LV pads 0.5 mm apart', () => {
    const pads = parseKicadPcbPadCenters(
      readFileSync(
        resolve(
          WORKSPACE_ROOT,
          'tests/fixtures/pcb/yuri/opendrop-adversarial-hv-lv-too-close.kicad_pcb',
        ),
        'utf8',
      ),
    )
    const verdict = evaluateHvLvCreepageProof({
      pads,
      hvNets: ['V_HV', 'V_HV_C'],
      lvNets: ['V_USB', '+3V3'],
      floorMm: HV_LV_PAD_CENTER_FLOOR_MM,
      claimsOpenDropHvController: true,
      architectureHasHighVoltage: true,
    })

    expect(verdict.ok).toBe(false)
    expect(verdict.separationOk).toBe(false)
    expect(verdict.minDistanceMm).toBeLessThan(1)
  })

  it('rejects LV-only copper claiming to be an OpenDrop HV controller', () => {
    const pads = parseKicadPcbPadCenters(
      readFileSync(
        resolve(
          WORKSPACE_ROOT,
          'tests/fixtures/pcb/yuri/opendrop-adversarial-lv-only-wrong-class.kicad_pcb',
        ),
        'utf8',
      ),
    )
    const verdict = evaluateHvLvCreepageProof({
      pads,
      hvNets: ['V_HV', 'V_HV_C'],
      lvNets: ['V_USB', '+3V3'],
      floorMm: HV_LV_PAD_CENTER_FLOOR_MM,
      claimsOpenDropHvController: true,
      architectureHasHighVoltage: true,
    })

    expect(verdict.ok).toBe(false)
    expect(verdict.hvPadsPresent).toBe(false)
    expect(verdict.findings.join(' ')).toMatch(/missing_hv_domain_copper/)
  })

  it('re-extracts gold PCB distances when the OpenDrop gold checkout is available', () => {
    const goldRoot = resolveOpenDropGoldRoot(WORKSPACE_ROOT)
    if (!goldRoot) {
      // eslint-disable-next-line no-console
      console.warn('[opendrop-hv-lv-creepage] gold checkout missing — skipping live extract')
      return
    }

    const live = extractOpenDropHvLvCreepageGoldEvidence(goldRoot)
    const fixture = loadOpenDropHvLvCreepageGoldFixture(WORKSPACE_ROOT)

    expect(live.minHvLvPadCenterMm).toBeCloseTo(fixture.minHvLvPadCenterMm, 2)
    expect(live.minHvLvPadCenterMm).toBeGreaterThanOrEqual(HV_LV_PAD_CENTER_FLOOR_MM)
  })
})
