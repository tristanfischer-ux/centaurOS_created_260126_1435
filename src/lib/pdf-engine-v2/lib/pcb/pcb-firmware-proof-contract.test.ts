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

  it('marks pin contract complete only when fitness OK and on-board MCU present', () => {
    const fat = buildFirmwareProofContract({
      thin,
      designFitnessOk: true,
      mcu: { mpn: 'ATSAMD21G18A-AU' },
      components: [{
        wordId: 'main_controller_mcu_word',
        mpn: 'ATSAMD21G18A-AU',
        refdes: 'U1',
        functionClass: 'microcontroller',
      }],
    })
    expect((fat.mcu as { pin_contract_complete: boolean }).pin_contract_complete).toBe(true)
    expect(fat.kind).toBe('custom_board')
  })

  it('proveCatch: daughterboard without MCU is interconnect_only (no HAT MCU theatre)', () => {
    const odThin: PcbFirmwareProofSpec = {
      ...thin,
      proofTargetId: 'od_optics',
      boardRole: 'od_optics_board',
      channels: [{ role: 'od_measurement_channel', requiredCount: 1 }],
    }
    const fat = buildFirmwareProofContract({
      thin: odThin,
      designFitnessOk: true,
      // GOTCHA: callers used to pass the HAT MCU here — must be ignored.
      mcu: { mpn: 'ATSAMD21G18A-AU' },
      components: [{
        wordId: 'optical_adc_word',
        mpn: 'ADS1114IDGSR',
        functionClass: 'adc',
      }],
      implementedChannels: { od_measurement_channel: 1 },
    })
    expect(fat.kind).toBe('interconnect_only')
    expect(fat.mcu).toBeNull()
    expect(fat.buses).toEqual([])
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
        { name: 'HEATER_I2C_SDA', members: [{ instanceName: 'mcu', pin: 'PA22__31' }] },
        { name: 'HEATER_I2C_SCL', members: [{ instanceName: 'mcu', pin: 'PA23__32' }] },
      ],
    })
    const i2c = (fat.buses as Array<{ protocol: string; pins: Record<string, string> }>)
      .find((b) => b.protocol === 'i2c')
    expect(i2c?.pins.sda).toBe('PA22')
    expect(i2c?.pins.scl).toBe('PA23')
  })

  it('proveCatch: expanded channel instances use unique word_id (not shared BoM wordId)', () => {
    const channelThin: PcbFirmwareProofSpec = {
      ...thin,
      proofTargetId: 'channel_instrument',
      boardRole: 'channel_instrument',
      channels: [{ role: 'power_channel', requiredCount: 2 }],
    }
    const fat = buildFirmwareProofContract({
      thin: channelThin,
      designFitnessOk: true,
      mcu: { mpn: 'ATSAMD21G18A-AU' },
      components: [
        {
          wordId: 'main_controller_mcu_word',
          instanceName: 'main_controller_mcu_word',
          mpn: 'ATSAMD21G18A-AU',
          functionClass: 'microcontroller',
        },
        {
          wordId: 'per_channel_discharge_load_mosfet_word',
          instanceName: 'per_channel_discharge_load_mosfet_word__1',
          mpn: 'IRLB3813PBF',
        },
        {
          wordId: 'per_channel_discharge_load_mosfet_word',
          instanceName: 'per_channel_discharge_load_mosfet_word__2',
          mpn: 'IRLB3813PBF',
        },
      ],
      implementedChannels: { power_channel: 2 },
    })
    const comps = fat.components as Array<{ word_id: string }>
    const ids = comps.map((c) => c.word_id)
    expect(ids).toEqual(expect.arrayContaining([
      'per_channel_discharge_load_mosfet_word__1',
      'per_channel_discharge_load_mosfet_word__2',
    ]))
    expect(new Set(ids).size).toBe(ids.length)
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
      components: [{
        wordId: 'temperature_sensor_word',
        mpn: 'TMP1075DSGR',
        functionClass: 'temperature_sensor',
      }],
      implementedChannels: { heater_channel: 1, stir_channel: 0, pump_channel: 0 },
    })
    expect(fat.kind).toBe('interconnect_only')
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
