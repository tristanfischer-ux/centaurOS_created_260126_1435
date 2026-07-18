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

  it('reports gold mismatches and unassigned roles honestly instead of weakening expectations', () => {
    const report = verifyYuriGoldStates({
      fixturePath: FIXTURE_PATH,
      sourceOutRoot: MAIN_OUT_ROOT,
    })
    const failuresByProduct = Object.fromEntries(
      report.products.map((product) => [product.product, product.failureCodes]),
    )

    expect(failuresByProduct.Colorimeter).toContain('channel_requirement_mismatch')
    expect(failuresByProduct.NinjaPCR).toContain('channel_requirement_mismatch')
    expect(failuresByProduct.Poseidon).toContain('disposition_mismatch')
    expect(failuresByProduct.OpenFlexure).not.toContain('disposition_mismatch')
    expect(failuresByProduct.Pioreactor).toEqual(expect.arrayContaining([
      'channel_requirement_mismatch',
      'empty_board_scope',
    ]))
    expect(failuresByProduct.Rodeostat).toContain('channel_requirement_mismatch')
    expect(failuresByProduct.OpenDrop).toEqual(expect.arrayContaining([
      'channel_requirement_mismatch',
      'unassigned_electronic_roles',
    ]))
    expect(report.products.find((product) => product.product === 'OpenDrop')?.unassignedWordIds).toEqual([
      'current_measurement_tia_word',
      'status_indicator_word',
    ])
  })
})
