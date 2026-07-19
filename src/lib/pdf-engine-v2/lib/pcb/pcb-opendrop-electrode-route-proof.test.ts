/**
 * @file OpenDrop electrode route/mating proveCatch tests.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  BRIEF_ELECTRODE_CHANNEL_FLOOR,
  GOLD_MINI_DIMM_MATING_PAD_COUNT,
  OPENDROP_GOLD_COMMIT,
  buildElectrodeRouteMatingProofInput,
  evaluateElectrodeRouteMatingProof,
  extractOpenDropElectrodeGoldEvidence,
  loadOpenDropElectrodeGoldFixture,
  proveCatchElectrodeRouteMatingProof,
  resolveOpenDropGoldRoot,
} from './pcb-opendrop-electrode-route-proof'

const WORKSPACE_ROOT = resolve(__dirname, '../../../../../')

describe('OpenDrop electrode route / mating proof', () => {
  const tmpDirs: string[] = []

  afterEach(() => {
    while (tmpDirs.length > 0) {
      const dir = tmpDirs.pop()
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
  })

  it('loads the frozen gold evidence fixture with Mini-DIMM + brief floor', () => {
    const fixture = loadOpenDropElectrodeGoldFixture(WORKSPACE_ROOT)

    expect(fixture.schema).toBe('opendrop-electrode-gold-evidence/v1')
    expect(fixture.sourceCommit).toBe(OPENDROP_GOLD_COMMIT)
    expect(fixture.briefElectrodeChannelFloor).toBe(BRIEF_ELECTRODE_CHANNEL_FLOOR)
    expect(fixture.fluxlElectrodeRefCount).toBeGreaterThanOrEqual(BRIEF_ELECTRODE_CHANNEL_FLOOR)
    expect(fixture.matingPadCount).toBe(GOLD_MINI_DIMM_MATING_PAD_COUNT)
    expect(fixture.footprintName).toContain('Mini_Dimm')
  })

  it('proveCatch fires on known-bad collapses and passes the gold happy path', () => {
    expect(() => proveCatchElectrodeRouteMatingProof(
      loadOpenDropElectrodeGoldFixture(WORKSPACE_ROOT),
    )).not.toThrow()
  })

  it('rejects collapsing 64 channels onto a 2-pin JST mating package', () => {
    const fixture = loadOpenDropElectrodeGoldFixture(WORKSPACE_ROOT)
    const verdict = evaluateElectrodeRouteMatingProof({
      briefElectrodeCount: BRIEF_ELECTRODE_CHANNEL_FLOOR,
      gold: fixture,
      architectureElectrodeChannelCount: BRIEF_ELECTRODE_CHANNEL_FLOOR,
      electrodeChannelImplementation: 'fitted_connector_package',
      matingConnectorPackage: 'Connector_JST:JST_XH_B2B-XH-A_1x02_P2.50mm_Vertical',
    })

    expect(verdict.ok).toBe(false)
    expect(verdict.implementationOk).toBe(false)
    expect(verdict.findings.join(' ')).toMatch(/low-density connector|passive_board_geometry/)
  })

  it('derives architecture + generator contracts that keep electrode_channel as passive geometry', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'opendrop-electrode-proof-'))
    tmpDirs.push(tmpDir)
    const fixture = loadOpenDropElectrodeGoldFixture(WORKSPACE_ROOT)
    const input = buildElectrodeRouteMatingProofInput(
      BRIEF_ELECTRODE_CHANNEL_FLOOR,
      fixture,
      tmpDir,
    )
    const verdict = evaluateElectrodeRouteMatingProof(input)

    expect(input.architectureElectrodeChannelCount).toBe(BRIEF_ELECTRODE_CHANNEL_FLOOR)
    expect(input.electrodeChannelImplementation).toBe('passive_board_geometry')
    expect(verdict.ok).toBe(true)
    expect(verdict.findings).toEqual([])
  })

  it('re-extracts gold CAD when the OpenDrop gold checkout is available', () => {
    const goldRoot = resolveOpenDropGoldRoot(WORKSPACE_ROOT)
    if (!goldRoot) {
      // eslint-disable-next-line no-console
      console.warn('[opendrop-electrode-proof] gold checkout missing — skipping live extract')
      return
    }

    const live = extractOpenDropElectrodeGoldEvidence(goldRoot)
    const fixture = loadOpenDropElectrodeGoldFixture(WORKSPACE_ROOT)

    expect(live.fluxlElectrodeRefCount).toBe(fixture.fluxlElectrodeRefCount)
    expect(live.matingPadCount).toBe(fixture.matingPadCount)
    expect(live.matingPadMin).toBe(1)
    expect(live.matingPadMax).toBe(GOLD_MINI_DIMM_MATING_PAD_COUNT)
    expect(live.sourceCommit).toBe(OPENDROP_GOLD_COMMIT)
  })
})
