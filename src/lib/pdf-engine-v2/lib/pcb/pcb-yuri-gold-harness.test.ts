import { join, resolve } from 'node:path'

import { verifyYuriGoldStates } from './pcb-yuri-gold-harness'

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

  it('closes every architecture-level gold finding while preserving downstream generator findings', () => {
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

  it('keeps an explicit all-seven residual report for downstream work', () => {
    const report = verifyYuriGoldStates({
      fixturePath: FIXTURE_PATH,
      sourceOutRoot: MAIN_OUT_ROOT,
    })

    expect(Object.fromEntries(
      report.products.map((product) => [product.product, product.failureCodes]),
    )).toEqual({
      Colorimeter: ['board_scope_reclassified_off_board'],
      NinjaPCR: ['board_scope_reclassified_off_board'],
      Poseidon: [],
      OpenFlexure: [],
      Pioreactor: [
        'board_scope_reclassified_off_board',
        'unresolved_components',
        'empty_generated_project',
      ],
      Rodeostat: ['board_scope_reclassified_off_board'],
      OpenDrop: [
        'board_scope_reclassified_off_board',
        'empty_generated_project',
      ],
    })
  })
})
