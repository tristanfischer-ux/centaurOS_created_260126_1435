import {
  buildBoardSimModel,
  defaultI2cAddressForPart,
  proveCatchBoardSimModel,
  resolveChannelNetNames,
} from './pcb-firmware-board-sim-model'

describe('pcb-firmware-board-sim-model', () => {
  it('proveCatch both directions (pad + channel bind)', () => {
    expect(() => proveCatchBoardSimModel()).not.toThrow()
  })

  it('resolves stir nets from netlist nouns', () => {
    const resolved = resolveChannelNetNames(
      'stir_channel',
      [
        { name: 'STIR_MOTOR_CTRL', members: [] },
        { name: 'STIR_MOTOR_A', members: [] },
      ],
      0,
    )
    expect(resolved).toEqual({
      enable_net: 'STIR_MOTOR_CTRL',
      output_net: 'STIR_MOTOR_A',
    })
  })

  it('assigns distinct I2C defaults for TMP1075 vs ADS1114', () => {
    expect(defaultI2cAddressForPart('TMP1075DSGR', 'temperature_sensor')).toBe(0x48)
    expect(defaultI2cAddressForPart('ADS1114IDGSR', 'sensor_ic')).toBe(0x49)
  })

  it('skips interconnect_only without inventing PASS theatre', () => {
    const model = buildBoardSimModel({
      proofTargetId: 'od_optics',
      kind: 'interconnect_only',
      buses: [],
      channels: [],
      nets: [],
      components: [{ instanceName: 'adc', partNumber: 'ADS1114IDGSR', functionClass: 'adc' }],
    })
    expect(model.skipped).toBe(true)
    expect(model.bind_errors).toEqual([])
  })
})
