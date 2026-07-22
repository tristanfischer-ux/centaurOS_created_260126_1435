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
    // SAMD21 reference map → real I2C pads (not synthetic TX/RX theatre).
    const i2c = (fat.buses as Array<{ protocol: string; pins: Record<string, string> }>)
      .find((b) => b.protocol === 'i2c')
    expect(i2c?.pins).toEqual({ sda: 'PA22', scl: 'PA23', gnd: 'GND' })
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

  it('prefers netlist MCU pads over reference fallback when nets are supplied', () => {
    const fat = buildFirmwareProofContract({
      thin,
      designFitnessOk: true,
      mcu: { mpn: 'ATSAMD21G18A-AU' },
      components: [{
        wordId: 'main_controller_mcu_word',
        mpn: 'ATSAMD21G18A-AU',
        refdes: 'mcu',
        instanceName: 'mcu',
        functionClass: 'microcontroller',
      }],
      nets: [
        { name: 'HEATER_I2C_SDA', members: [{ instanceName: 'mcu', pin: 'PA22_1' }] },
        { name: 'HEATER_I2C_SCL', members: [{ instanceName: 'mcu', pin: 'PA23_1' }] },
      ],
    })
    const i2c = (fat.buses as Array<{ protocol: string; pins: Record<string, string> }>)
      .find((b) => b.protocol === 'i2c')
    expect(i2c?.pins.sda).toBe('PA22_1')
    expect(i2c?.pins.scl).toBe('PA23_1')
  })

  it('proveCatch: instances come from implementedChannels, never requiredCount', () => {
    const actuation: PcbFirmwareProofSpec = {
      ...thin,
      proofTargetId: 'wet_actuation',
      boardRole: 'heater_stir_actuation_board',
      channels: [
        { role: 'heater_channel', requiredCount: 1 },
        { role: 'stir_channel', requiredCount: 1 },
        { role: 'pump_channel', requiredCount: 1 },
      ],
    }
    const fat = buildFirmwareProofContract({
      thin: actuation,
      designFitnessOk: true,
      mcu: { mpn: 'ATSAMD21G18A-AU' },
      components: [],
      implementedChannels: { heater_channel: 1, stir_channel: 0, pump_channel: 0 },
    })
    const channels = fat.channels as Array<{
      role: string
      required_count: number
      instances: unknown[]
    }>
    expect(channels.find((c) => c.role === 'heater_channel')?.instances).toHaveLength(1)
    expect(channels.find((c) => c.role === 'stir_channel')?.instances).toHaveLength(0)
    expect(channels.find((c) => c.role === 'pump_channel')?.instances).toHaveLength(0)
    expect(channels.find((c) => c.role === 'stir_channel')?.required_count).toBe(1)
  })
})
