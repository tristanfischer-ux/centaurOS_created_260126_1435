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

  it('resolves power/sense/safety channel spines from netlist', () => {
    const nets = [
      { name: 'POWER_CHANNEL_EN_0', members: [] },
      { name: 'POWER_CHANNEL_OUT_0', members: [] },
      { name: 'SENSE_CHANNEL_EN_2', members: [] },
      { name: 'SENSE_CHANNEL_OUT_2', members: [] },
      { name: 'SAFETY_CHANNEL_EN_1', members: [] },
      { name: 'SAFETY_CHANNEL_OUT_1', members: [] },
    ]
    expect(resolveChannelNetNames('power_channel', nets, 0)).toEqual({
      enable_net: 'POWER_CHANNEL_EN_0',
      output_net: 'POWER_CHANNEL_OUT_0',
    })
    expect(resolveChannelNetNames('sense_channel', nets, 2)).toEqual({
      enable_net: 'SENSE_CHANNEL_EN_2',
      output_net: 'SENSE_CHANNEL_OUT_2',
    })
    expect(resolveChannelNetNames('safety_channel', nets, 1)).toEqual({
      enable_net: 'SAFETY_CHANNEL_EN_1',
      output_net: 'SAFETY_CHANNEL_OUT_1',
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
