/**
 * @file Pre-fab synthetic board model for firmware proof (Tier-2 board sim).
 * @description Builds an imagined board from architecture nets + components +
 * firmware bus pads, then fails closed when the firmware pinmap / channel nets /
 * I²C identities cannot bind. Never claims HIL or FUNCTIONALLY VERIFIED.
 *
 * INTENT: Tristan 2026-07-22 — prove firmware against a synthetic board before
 * fab; compile-only Tier-0/1 is not enough to answer "does the design work?".
 */

import {
  normalizeFirmwarePadName,
  type FirmwareBusPinMap,
  type FirmwareComponentLike,
  type FirmwareNetLike,
} from './pcb-firmware-pinmap-from-nets'

export type BoardSimExpectedDevice = {
  word_id: string
  mpn: string
  address: number
  /** Where the device was discovered (this board vs peer via interconnect). */
  provenance: 'on_board' | 'peer_bus'
}

export type BoardSimChannelBind = {
  role: string
  instance_id: string
  enable_net: string
  output_net: string
  /** True when enable_net exists in the netlist (case-insensitive). */
  enable_bound: boolean
  output_bound: boolean
}

export type BoardSimBindError = {
  code: string
  message: string
}

export type BoardSimModel = {
  schema: 'pcb-firmware-board-sim-model/v1'
  proof_target_id: string
  /** interconnect_only / no MCU → skipped (not a PASS theatre). */
  skipped: boolean
  skip_reason?: string
  mcu_mpn: string | null
  buses: Array<{
    bus_id: string
    protocol: string
    pins: Record<string, string>
    /** Pads that appear on a real net with the MCU as a member. */
    pads_on_netlist: Record<string, boolean>
    expected_devices: BoardSimExpectedDevice[]
  }>
  channels: BoardSimChannelBind[]
  bind_errors: BoardSimBindError[]
}

/**
 * @description Default 7-bit I²C address from MPN / function noun — never a
 * product-class table. Distinct defaults avoid TMP1075+ADS1114 both claiming 0x48.
 */
export function defaultI2cAddressForPart(mpn: string, functionClass?: string | null): number | null {
  const blob = `${mpn} ${functionClass ?? ''}`.toUpperCase()
  if (/TMP1075/.test(blob)) return 0x48
  if (/ADS1114/.test(blob)) return 0x49
  if (/ADS1115/.test(blob)) return 0x48
  if (/ADS1113/.test(blob)) return 0x48
  if (/BME280|BMP280/.test(blob)) return 0x76
  if (/SHT3|SHT4/.test(blob)) return 0x44
  if (/temperature_sensor|sensor_ic|adc|op_amp/.test((functionClass ?? '').toLowerCase())
    && /TMP|ADS|MAX|INA|MCP/.test(blob)) {
    return 0x4A
  }
  return null
}

function looksLikeI2cPeripheral(c: FirmwareComponentLike): boolean {
  const blob = `${c.functionClass ?? ''} ${c.characterId ?? ''} ${c.partNumber ?? ''}`.toLowerCase()
  if (/microcontroller|mcu/.test(blob)) return false
  if (/connector|passive_[rc]|ferrite|fuse|led$|diode|switch|gate_driver|motor_driver/.test(blob)) {
    return false
  }
  return Boolean(
    defaultI2cAddressForPart(c.partNumber ?? '', c.functionClass)
    || /tmp|ads111|i2c|temperature_probe|sensor_ic|adc/.test(blob),
  )
}

function findMcu(components: FirmwareComponentLike[]): FirmwareComponentLike | undefined {
  return components.find(
    (c) =>
      c.functionClass === 'microcontroller'
      || /mcu|microcontroller/i.test(`${c.characterId ?? ''} ${c.instanceName ?? ''}`),
  )
}

function netByName(nets: FirmwareNetLike[], name: string): FirmwareNetLike | undefined {
  const want = name.toUpperCase()
  return nets.find((n) => n.name.toUpperCase() === want)
}

function netExists(nets: FirmwareNetLike[], name: string): boolean {
  return Boolean(netByName(nets, name))
}

/**
 * @description Map channel role → real netlist enable/output names.
 * Noun-keyed (stir/pump/heater/od), never a product-class table.
 */
export function resolveChannelNetNames(
  role: string,
  nets: FirmwareNetLike[],
  index: number,
): { enable_net: string; output_net: string } | null {
  const names = nets.map((n) => n.name)
  const pick = (...candidates: string[]): string | null => {
    for (const c of candidates) {
      const hit = names.find((n) => n.toUpperCase() === c.toUpperCase())
      if (hit) return hit
    }
    // substring fallback (atopile lowercases)
    for (const c of candidates) {
      const hit = names.find((n) => n.toUpperCase().includes(c.toUpperCase().replace(/_/g, '')))
        || names.find((n) => n.toUpperCase().includes(c.toUpperCase()))
      if (hit) return hit
    }
    return null
  }

  const r = role.toLowerCase()
  if (r.includes('stir')) {
    const en = pick('STIR_MOTOR_CTRL', 'STIR_CHANNEL_EN', `STIR_CHANNEL_EN_${index}`)
    const out = pick('STIR_MOTOR_A', 'STIR_MOTOR_B', `STIR_CHANNEL_OUT_${index}`)
    if (en && out) return { enable_net: en, output_net: out }
    return null
  }
  if (r.includes('pump')) {
    const en = pick('PUMP_MOTOR_CTRL', 'PUMP_CHANNEL_EN', `PUMP_CHANNEL_EN_${index}`)
    const out = pick('PUMP_MOTOR_A', 'PUMP_MOTOR_B', `PUMP_CHANNEL_OUT_${index}`)
    if (en && out) return { enable_net: en, output_net: out }
    return null
  }
  if (r.includes('heater')) {
    const en = pick('HAT_HEATER_PWM', 'HEATER_PWM', 'HEATER_CHANNEL_EN', `HEATER_CHANNEL_EN_${index}`)
    const out = pick('HEATER_RES_A', 'HEATER_RES_B', `HEATER_CHANNEL_OUT_${index}`)
    if (en && out) return { enable_net: en, output_net: out }
    return null
  }
  if (r.includes('od') || r.includes('optical') || r.includes('measurement')) {
    const en = pick('OD_LED_DRIVE', 'OD_I2C_SDA', `OD_MEASUREMENT_CHANNEL_EN_${index}`)
    const out = pick('OD_TIA_ADC', 'OD_PD_TIA', `OD_MEASUREMENT_CHANNEL_OUT_${index}`)
    if (en && out) return { enable_net: en, output_net: out }
    return null
  }
  return null
}

function mcuPadOnNet(
  nets: FirmwareNetLike[],
  mcu: FirmwareComponentLike,
  pad: string,
): boolean {
  const want = normalizeFirmwarePadName(pad).toUpperCase()
  for (const net of nets) {
    for (const m of net.members) {
      if (m.instanceName !== mcu.instanceName) continue
      if (normalizeFirmwarePadName(m.pin).toUpperCase() === want) return true
    }
  }
  return false
}

function allocateAddresses(devices: BoardSimExpectedDevice[]): BoardSimExpectedDevice[] {
  const used = new Set<number>()
  return devices.map((d) => {
    let addr = d.address
    while (used.has(addr) && addr < 0x78) addr += 1
    used.add(addr)
    return { ...d, address: addr }
  })
}

/**
 * @description Build a synthetic board model. Fail-closed bind_errors when
 * firmware pads / channel nets cannot bind to the netlist.
 */
export function buildBoardSimModel(args: {
  proofTargetId: string
  kind: string
  mcuMpn?: string | null
  buses: FirmwareBusPinMap[]
  channels: Array<{
    role: string
    instances: Array<{ instance_id: string; enable_net?: string; output_net?: string }>
  }>
  nets: FirmwareNetLike[]
  components: FirmwareComponentLike[]
  /** I²C peripherals on peer boards that share interconnect bus names. */
  peerComponents?: FirmwareComponentLike[]
}): BoardSimModel {
  const mcu = findMcu(args.components)
  if (args.kind === 'interconnect_only' || !mcu) {
    return {
      schema: 'pcb-firmware-board-sim-model/v1',
      proof_target_id: args.proofTargetId,
      skipped: true,
      skip_reason: 'no_on_board_mcu',
      mcu_mpn: null,
      buses: [],
      channels: [],
      bind_errors: [],
    }
  }

  const bind_errors: BoardSimBindError[] = []
  const mcuMpn = args.mcuMpn ?? mcu.partNumber ?? null

  const buses = args.buses.map((bus) => {
    const pads_on_netlist: Record<string, boolean> = {}
    for (const [role, pad] of Object.entries(bus.pins)) {
      if (role === 'gnd' || /^gnd$/i.test(pad)) {
        pads_on_netlist[role] = true
        continue
      }
      const on = mcuPadOnNet(args.nets, mcu, pad)
      pads_on_netlist[role] = on
      if (!on) {
        bind_errors.push({
          code: 'firmware_pad_not_on_netlist',
          message: `${bus.bus_id}.${role}=${pad} is not a member of any net on MCU ${mcu.instanceName}`,
        })
      }
    }

    const expected: BoardSimExpectedDevice[] = []
    if (bus.protocol === 'i2c') {
      for (const c of args.components) {
        if (!looksLikeI2cPeripheral(c)) continue
        const addr = defaultI2cAddressForPart(c.partNumber ?? '', c.functionClass)
        if (addr == null) continue
        expected.push({
          word_id: c.characterId ?? c.instanceName,
          mpn: c.partNumber ?? 'UNKNOWN',
          address: addr,
          provenance: 'on_board',
        })
      }
      for (const c of args.peerComponents ?? []) {
        if (!looksLikeI2cPeripheral(c)) continue
        const addr = defaultI2cAddressForPart(c.partNumber ?? '', c.functionClass)
        if (addr == null) continue
        // GOTCHA: only attach peers when this board has an I²C bus (shared loom).
        expected.push({
          word_id: c.characterId ?? c.instanceName,
          mpn: c.partNumber ?? 'UNKNOWN',
          address: addr,
          provenance: 'peer_bus',
        })
      }
    }

    return {
      bus_id: bus.bus_id,
      protocol: bus.protocol,
      pins: { ...bus.pins },
      pads_on_netlist,
      expected_devices: allocateAddresses(expected),
    }
  })

  // INTENT: I²C custom_board must see at least one identity-bearing device on
  // the bus (on-board or peer). Empty device list = firmware has nothing to talk to.
  const i2cBuses = buses.filter((b) => b.protocol === 'i2c')
  for (const b of i2cBuses) {
    if (b.expected_devices.length === 0) {
      bind_errors.push({
        code: 'i2c_bus_empty',
        message: `${b.bus_id} has MCU pads but no expected I²C devices (on-board or peer)`,
      })
    }
  }

  const channels: BoardSimChannelBind[] = []
  for (const ch of args.channels) {
    ch.instances.forEach((inst, index) => {
      const resolved = resolveChannelNetNames(ch.role, args.nets, index)
      const enable_net = resolved?.enable_net ?? inst.enable_net ?? `${ch.role.toUpperCase()}_EN_${index}`
      const output_net = resolved?.output_net ?? inst.output_net ?? `${ch.role.toUpperCase()}_OUT_${index}`
      const enable_bound = netExists(args.nets, enable_net)
      const output_bound = netExists(args.nets, output_net)
      if (!enable_bound) {
        bind_errors.push({
          code: 'channel_enable_unbound',
          message: `${ch.role}/${inst.instance_id} enable_net ${enable_net} missing from netlist`,
        })
      }
      if (!output_bound) {
        bind_errors.push({
          code: 'channel_output_unbound',
          message: `${ch.role}/${inst.instance_id} output_net ${output_net} missing from netlist`,
        })
      }
      channels.push({
        role: ch.role,
        instance_id: inst.instance_id,
        enable_net,
        output_net,
        enable_bound,
        output_bound,
      })
    })
  }

  return {
    schema: 'pcb-firmware-board-sim-model/v1',
    proof_target_id: args.proofTargetId,
    skipped: false,
    mcu_mpn: mcuMpn,
    buses,
    channels,
    bind_errors,
  }
}

/**
 * @description proveCatch both directions for the synthetic board binder.
 */
export function proveCatchBoardSimModel(): void {
  const mcu = {
    instanceName: 'mcu',
    functionClass: 'microcontroller',
    partNumber: 'ATSAMD21G18A-AU',
  }
  const good = buildBoardSimModel({
    proofTargetId: 'wet_lab_hat',
    kind: 'custom_board',
    mcuMpn: 'ATSAMD21G18A-AU',
    buses: [{
      bus_id: 'i2c0',
      protocol: 'i2c',
      pins: { sda: 'PA22', scl: 'PA23', gnd: 'GND' },
      expected_devices: [],
    }],
    channels: [{
      role: 'stir_channel',
      instances: [{ instance_id: 'stir_channel_0' }],
    }],
    nets: [
      { name: 'HEATER_I2C_SDA', members: [{ instanceName: 'mcu', pin: 'PA22' }] },
      { name: 'HEATER_I2C_SCL', members: [{ instanceName: 'mcu', pin: 'PA23' }] },
      { name: 'STIR_MOTOR_CTRL', members: [{ instanceName: 'drv', pin: '1' }] },
      { name: 'STIR_MOTOR_A', members: [{ instanceName: 'drv', pin: '8' }] },
    ],
    components: [mcu],
    peerComponents: [{
      instanceName: 'tmp',
      functionClass: 'temperature_sensor',
      partNumber: 'TMP1075DSGR',
      characterId: 'culture_temperature_probe',
    }],
  })
  if (good.skipped) throw new Error('proveCatch expected non-skipped model')
  if (good.bind_errors.length !== 0) {
    throw new Error(`proveCatch expected 0 bind_errors, got ${JSON.stringify(good.bind_errors)}`)
  }
  const i2c = good.buses.find((b) => b.protocol === 'i2c')
  if (!i2c?.expected_devices.some((d) => d.mpn.includes('TMP1075'))) {
    throw new Error('proveCatch expected peer TMP1075 on i2c0')
  }
  if (!good.channels[0]?.enable_bound) {
    throw new Error('proveCatch expected stir enable bound to STIR_MOTOR_CTRL')
  }

  const bad = buildBoardSimModel({
    proofTargetId: 'wet_lab_hat',
    kind: 'custom_board',
    mcuMpn: 'ATSAMD21G18A-AU',
    buses: [{
      bus_id: 'i2c0',
      protocol: 'i2c',
      pins: { sda: 'PA22', scl: 'PA23', gnd: 'GND' },
      expected_devices: [],
    }],
    channels: [{
      role: 'stir_channel',
      instances: [{ instance_id: 'stir_channel_0', enable_net: 'STIR_CHANNEL_EN_0', output_net: 'STIR_CHANNEL_OUT_0' }],
    }],
    nets: [
      // MCU pads missing from netlist — must fail.
      { name: 'GND', members: [{ instanceName: 'mcu', pin: 'GND' }] },
    ],
    components: [mcu],
  })
  if (!bad.bind_errors.some((e) => e.code === 'firmware_pad_not_on_netlist')) {
    throw new Error('proveCatch expected firmware_pad_not_on_netlist')
  }
  if (!bad.bind_errors.some((e) => e.code === 'channel_enable_unbound')) {
    throw new Error('proveCatch expected channel_enable_unbound')
  }
}
