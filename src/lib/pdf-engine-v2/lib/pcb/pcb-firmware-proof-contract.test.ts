import { buildFirmwareProofContract } from './pcb-firmware-proof-contract'

import type { PcbFirmwareProofSpec } from './pcb-firmware-proof-spec'

const thin: PcbFirmwareProofSpec = {
  schema: 'pcb-firmware-proof-spec/v1',
  proofTargetId: 'wet_lab_hat',
  kind: 'custom_board',
  boardRole: 'wet_lab_hat',
  workPerformed: ['enumerate_channels'],
  channels: [{ role: 'heater_channel', requiredCount: 1 }],
  domains: ['thermal'],
  safeByDefault: true,
}

describe('buildFirmwareProofContract', () => {
  it('fail-closes pin contract when design fitness is false (P9b)', () => {
    const fat = buildFirmwareProofContract({
      thin,
      designFitnessOk: false,
      mcu: { mpn: 'ATSAMD21G18A-AU' },
      components: [{ wordId: 'main_controller_mcu_word', mpn: 'ATSAMD21G18A-AU', refdes: 'U1' }],
    })
    expect(fat.design_fitness_ok).toBe(false)
    expect((fat.mcu as { pin_contract_complete: boolean }).pin_contract_complete).toBe(false)
    expect(fat.schema).toBe('pcb-firmware-proof-spec/v1')
    expect((fat.buses as Array<{ pins: Record<string, string> }>)[0].pins).toEqual({
      tx: 'TX',
      rx: 'RX',
      gnd: 'GND',
    })
  })

  it('marks pin contract complete only when fitness OK and MCU present', () => {
    const fat = buildFirmwareProofContract({
      thin,
      designFitnessOk: true,
      mcu: { mpn: 'ATSAMD21G18A-AU' },
      components: [],
    })
    expect((fat.mcu as { pin_contract_complete: boolean }).pin_contract_complete).toBe(true)
  })
})
