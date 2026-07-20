import { mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  verifyYuriGoldPipelines,
  verifyYuriGoldStates,
} from './pcb-yuri-gold-harness'

import type { PcbPipelineResult } from './pcb-pipeline'

const WORKTREE_ROOT = resolve(__dirname, '../../../../../')
const MAIN_OUT_ROOT = process.env.YURI_ACCEPTED_OUT_ROOT ??
  resolve(WORKTREE_ROOT, '../CentaurOS-oxccu-efuel/out')
const FIXTURE_PATH = join(WORKTREE_ROOT, 'tests/fixtures/pcb/yuri/gold-expectations.json')

describe('Yuri PCB gold architecture harness', () => {
  it('checks all seven accepted states and emits only board-scoped temporary Atopile projects', () => {
    const report = verifyYuriGoldStates({
      fixturePath: FIXTURE_PATH,
      sourceOutRoot: MAIN_OUT_ROOT,
    })

    expect(report.schema).toBe('pcb-yuri-gold-verification/v1')
    expect(report.products.map((product) => product.product)).toEqual([
      'Colorimeter',
      'NinjaPCR',
      'Poseidon',
      'OpenFlexure',
      'Pioreactor',
      'Rodeostat',
      'OpenDrop',
    ])
    expect(report.products.map((product) => product.generatedProjectCount)).toEqual([1, 1, 0, 0, 3, 1, 2])
    expect(report.products.every((product) => product.routingArtifactsFound.length === 0)).toBe(true)
    expect(report.products.flatMap((product) => product.generatedBoards)
      .every((board) => board.usedTemporaryDirectory)).toBe(true)
    expect(report.products.every((product) =>
      !product.failureCodes.includes('board_shape_mismatch') &&
      !product.failureCodes.includes('missing_expected_board'))).toBe(true)
  })

  it('closes every architecture-level gold finding independently of generator checks', () => {
    const report = verifyYuriGoldStates({
      fixturePath: FIXTURE_PATH,
      sourceOutRoot: MAIN_OUT_ROOT,
    })
    const architectureFailureCodes = [
      'disposition_mismatch',
      'board_role_mismatch',
      'board_shape_mismatch',
      'channel_requirement_mismatch',
      'unassigned_electronic_roles',
      'empty_board_scope',
      'missing_expected_board',
    ]

    expect(report.products.map((product) => ({
      product: product.product,
      architectureFailures: product.failureCodes.filter((code) =>
        architectureFailureCodes.includes(code)),
      architectureFailureDetails: product.failureDetails.filter((detail) =>
        detail.includes('has no assigned electronic roles')),
      unassignedWordIds: product.unassignedWordIds,
    }))).toEqual(report.products.map((product) => ({
      product: product.product,
      architectureFailures: [],
      architectureFailureDetails: [],
      unassignedWordIds: [],
    })))
  })

  it('retains evidence-backed non-components in whole-system assignments but outside board BOM scope', () => {
    const report = verifyYuriGoldStates({
      fixturePath: FIXTURE_PATH,
      sourceOutRoot: MAIN_OUT_ROOT,
    })
    const expected = {
      Colorimeter: {
        detector_mount_plate_word: 'mechanical_only',
      },
      NinjaPCR: {
        usb_interface_tool_grounded_word: 'interconnect_only',
      },
      Pioreactor: {
        // P4 USB role honesty: power entry is an on-board receptacle when the
        // HAT owns the port; data/interface stays interconnect-only; SPI flash
        // that the planner scopes onto the HAT is on_board (not a COTS module).
        usb_interface_word: 'interconnect_only',
        firmware_storage_word: 'on_board',
        host_protocol_bridge_word: 'interconnect_only',
        usb_power_entry_word: 'on_board',
      },
      Rodeostat: {
        usb_power_entry_word: 'off_board_module',
        usb_interface_word: 'off_board_module',
        host_protocol_bridge_word: 'interconnect_only',
      },
      OpenDrop: {
        usb_interface_word: 'interconnect_only',
      },
    } as const

    for (const product of report.products) {
      const expectedAssignments = expected[
        product.product as keyof typeof expected
      ]
      if (!expectedAssignments) continue
      const assignments = (
        product as typeof product & {
          observedAssignments: Record<string, string>
        }
      ).observedAssignments
      expect(assignments).toMatchObject(expectedAssignments)
      // Only non-on_board placements must stay outside board BOM scope.
      // on_board assignments (e.g. usb_power_entry receptacle) belong in scopes.
      const outsideBoardKeys = Object.entries(expectedAssignments)
        .filter(([, placement]) => placement !== 'on_board')
        .map(([wordId]) => wordId)
      const boardWordIds = Object.values(product.observedBoardScopes).flat()
      expect(boardWordIds).toEqual(expect.not.arrayContaining(outsideBoardKeys))
    }
  })

  it('reports unimplemented board functions without minting package identities', () => {
    const report = verifyYuriGoldStates({
      fixturePath: FIXTURE_PATH,
      sourceOutRoot: MAIN_OUT_ROOT,
    })

    expect(Object.fromEntries(
      report.products.map((product) => [product.product, product.failureCodes]),
    )).toEqual({
      Colorimeter: [],
      NinjaPCR: [],
      Poseidon: [],
      OpenFlexure: [],
      Pioreactor: ['empty_generated_project'],
      Rodeostat: [],
      OpenDrop: ['empty_generated_project'],
    })
    const pioreactor = report.products.find((product) => product.product === 'Pioreactor')
    const openDrop = report.products.find((product) => product.product === 'OpenDrop')
    // wet_actuation now emits real heater/stir drive footprints (componentCount > 0).
    // The remaining unimplemented board function is OD optics on its own board.
    expect(pioreactor?.generatedBoards.find((board) => board.boardId === 'wet_actuation'))
      .toMatchObject({
        componentCount: expect.any(Number),
      })
    expect(
      (pioreactor?.generatedBoards.find((board) => board.boardId === 'wet_actuation')
        ?.componentCount ?? 0) > 0,
    ).toBe(true)
    expect(pioreactor?.generatedBoards.find((board) => board.boardId === 'od_optics'))
      .toMatchObject({
        componentCount: 0,
        functionRequirements: [
          expect.objectContaining({
            role: 'od_measurement_channel',
            implementation: 'unresolved_board_function',
          }),
        ],
      })
    expect(openDrop?.generatedBoards.find((board) => board.boardId === 'electrode_cartridge'))
      .toMatchObject({
        componentCount: 0,
        functionRequirements: [
          expect.objectContaining({
            role: 'electrode_channel',
            implementation: 'passive_board_geometry',
          }),
        ],
      })
  })

  it('runs every required board through an isolated pipeline and records honest metrics', () => {
    const outputRoot = mkdtempSync('/tmp/pcb-yuri-pipeline-test-')
    const invocations: Array<{ projectDir: string; runDir: string }> = []
    let invocationCount = 0
    const runPipeline = (projectDir: string, runDir: string): PcbPipelineResult => {
      invocationCount += 1
      invocations.push({ projectDir, runDir })
      const isHonestFailure = invocationCount === 2
      return {
        ok: !isHonestFailure,
        stageReached: isHonestFailure ? 'freerouting' : 'complete',
        routed: !isHonestFailure,
        drc: {
          ran: !isHonestFailure,
          violations: isHonestFailure ? null : 0,
        },
        boardSizeMm: { w: 40 + invocationCount, h: 30 + invocationCount },
        components: 10 + invocationCount,
        nets: 5 + invocationCount,
        unroutedAfterFreerouting: isHonestFailure ? 3 : 0,
        errors: isHonestFailure ? ['autorouter did not converge'] : [],
      }
    }

    try {
      const report = verifyYuriGoldPipelines({
        fixturePath: FIXTURE_PATH,
        sourceOutRoot: MAIN_OUT_ROOT,
        outputRoot,
        runPipeline,
      })

      expect(report.schema).toBe('pcb-yuri-pipeline-verification/v1')
      expect(report.outputRoot).toBe(outputRoot)
      expect(report.products.map((product) => product.product)).toEqual([
        'Colorimeter',
        'NinjaPCR',
        'Poseidon',
        'OpenFlexure',
        'Pioreactor',
        'Rodeostat',
        'OpenDrop',
      ])
      expect(report.products.map((product) => product.boards.length)).toEqual([1, 1, 0, 0, 3, 1, 2])
      expect(invocations).toHaveLength(8)
      expect(invocations.every(({ projectDir, runDir }) =>
        projectDir.startsWith(outputRoot) &&
        runDir.startsWith(outputRoot) &&
        projectDir !== runDir)).toBe(true)

      const boards = report.products.flatMap((product) => product.boards)
      // P3/P4 identity honesty resolves USB receptacle + LED candidates that used
      // to stay package_family-only — unverified MPN count drops 6 → 3.
      expect(boards[0]).toMatchObject({
        boardId: 'optical_source',
        pipelineOk: true,
        drcRan: true,
        drcViolations: 0,
        unroutedAfterFreerouting: 0,
        boardSizeMm: { w: 41, h: 31 },
        pipelineComponentCount: 11,
        verifiedIdentityCount: 0,
        unresolvedIdentityCount: 3,
        unverifiedMpnCount: 3,
        resolutionTierCounts: { package_family: 3 },
        identitySources: [],
        identityBlockers: expect.arrayContaining([
          expect.objectContaining({
            wordId: expect.any(String),
            reason: expect.stringContaining('curated role-compatible candidate'),
          }),
        ]),
        engineeringFindings: [
          '3 generated component(s) lack verified MPN/symbol/pinout identity',
        ],
        errors: [],
      })
      expect(boards[1]).toMatchObject({
        pipelineOk: false,
        stageReached: 'freerouting',
        drcRan: false,
        drcViolations: null,
        unroutedAfterFreerouting: 3,
        errors: ['autorouter did not converge'],
      })
      expect(report.summary).toEqual({
        products: 7,
        requiredBoards: 8,
        pipelineOkBoards: 7,
        failedBoards: 1,
      })
    } finally {
      rmSync(outputRoot, { recursive: true, force: true })
    }
  })
})
