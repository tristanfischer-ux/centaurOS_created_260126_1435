import {
  applySystemNetTags,
  boardIsHostHat,
  boardIsOdOptics,
  boardSkipsUsbHostDensify,
  planSystemNets,
  type CrossBoardTaggableNet,
} from './pcb-cross-board-nets'

import type { PcbBoardPlan } from './pcb-architecture'

function board(
  boardId: string,
  role: string,
): PcbBoardPlan {
  return {
    boardId,
    role,
    requiredWordIds: ['x'],
    domains: ['logic'],
    channelRequirements: [],
    workPerformed: [],
    shape: {
      shapeFamily: 'rect',
      outlineBasis: 'test',
      mountingHoles: 0,
      rationale: 'test',
    },
    requiresKiCadDeliverable: true,
  }
}

describe('pcb-cross-board-nets', () => {
  it('plans heater FFC + OD host cables for culture multi-board', () => {
    const plan = planSystemNets([
      board('wet_lab_hat', 'wet_lab_hat'),
      board('od_optics', 'od_optics_board'),
      board('wet_actuation', 'heater_stir_actuation_board'),
    ])
    expect(plan.hasHeaterFfc).toBe(true)
    expect(plan.hasOdHostI2c).toBe(true)
    expect(plan.crossBoardNetNames).toEqual(
      expect.arrayContaining([
        'HEATER_I2C_SCL',
        'HEATER_I2C_SDA',
        'HEATER_HALL',
        'HEATER_RES_A',
        'OD_I2C_SCL',
        'OD_I2C_SDA',
      ]),
    )
  })

  it('stamps crossBoard on matching net names', () => {
    const nets: CrossBoardTaggableNet[] = [
      { name: 'HEATER_I2C_SCL' },
      { name: 'USB_DP' },
    ]
    const tagged = applySystemNetTags(nets, {
      crossBoardNetNames: ['HEATER_I2C_SCL'],
      hasHeaterFfc: true,
      hasOdHostI2c: false,
      boardIds: [],
    })
    expect(tagged[0]?.crossBoard).toBe(true)
    expect(tagged[1]?.crossBoard).toBeUndefined()
  })

  it('classifies host hat / OD / heater skip-USB helpers', () => {
    expect(boardIsHostHat('wet_lab_hat', 'wet_lab_hat')).toBe(true)
    expect(boardIsOdOptics('od_optics', 'od_optics_board')).toBe(true)
    expect(boardSkipsUsbHostDensify('wet_actuation', 'heater_stir_actuation_board')).toBe(true)
    expect(boardSkipsUsbHostDensify('wet_lab_hat', 'wet_lab_hat')).toBe(false)
  })
})
