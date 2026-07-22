/**
 * @file pcb-firmware-pinmap-from-nets.ts
 * @description Derive firmware-proof bus pin maps from real MCU net membership
 * + the curated MCU reference pin-map. Never invent TX/RX placeholders when
 * the netlist already assigned PA22/PA23 (I2C) or PA10/PA11 (UART).
 */

import {
  resolveMcuReferencePad,
  type McuHostFunction,
} from './pcb-mcu-reference-pinmap'

export type FirmwareNetMember = {
  instanceName: string
  pin: string
}

export type FirmwareNetLike = {
  name: string
  kind?: string
  members: FirmwareNetMember[]
}

export type FirmwareComponentLike = {
  instanceName: string
  functionClass?: string | null
  characterId?: string
  manufacturer?: string | null
  partNumber?: string | null
}

export type FirmwareBusPinMap = {
  bus_id: string
  protocol: 'i2c' | 'uart' | 'swd'
  pins: Record<string, string>
  expected_devices: string[]
}

function mcuBlob(mcu: FirmwareComponentLike | undefined): string {
  if (!mcu) return ''
  return `${mcu.manufacturer ?? ''} ${mcu.partNumber ?? ''} ${mcu.characterId ?? ''}`
}

function findMcu(components: FirmwareComponentLike[]): FirmwareComponentLike | undefined {
  return components.find(
    (c) =>
      c.functionClass === 'microcontroller'
      || /mcu|microcontroller/i.test(`${c.characterId ?? ''} ${c.instanceName ?? ''}`),
  )
}

/**
 * @description Strip KiCad uniquify suffixes (`PA22__31` → `PA22`) for firmware
 * headers. Leaves single-underscore aliases (`PA22_1`) intact.
 */
export function normalizeFirmwarePadName(pin: string): string {
  return pin.replace(/__\d+$/, '')
}

function mcuPinOnNet(
  nets: FirmwareNetLike[],
  mcu: FirmwareComponentLike,
  netName: string,
): string | null {
  const net = nets.find((n) => n.name.toUpperCase() === netName.toUpperCase())
  if (!net) return null
  const member = net.members.find((m) => m.instanceName === mcu.instanceName)
  return member?.pin ? normalizeFirmwarePadName(member.pin) : null
}

function padOrNet(
  mcu: FirmwareComponentLike | undefined,
  nets: FirmwareNetLike[],
  fn: McuHostFunction,
  netCandidates: string[],
): string | null {
  if (!mcu) return null
  for (const name of netCandidates) {
    const onNet = mcuPinOnNet(nets, mcu, name)
    if (onNet) return onNet
  }
  return resolveMcuReferencePad(mcuBlob(mcu), fn)
}

/**
 * @description Build firmware bus contracts from netlist evidence.
 * Prefers I2C when HEATER_I2C_* / OD_I2C_* / I2C_* nets touch the MCU;
 * falls back to UART from the reference map; always includes SWD when pads resolve.
 */
export function buildFirmwareBusesFromNets(args: {
  nets: FirmwareNetLike[]
  components: FirmwareComponentLike[]
  mcuMpn?: string
}): FirmwareBusPinMap[] {
  // DECISION (fixpack12): never invent an MCU from mcuMpn alone. Daughterboards
  // (OD / heater) previously inherited the HAT MPN and claimed SAMD21 I2C/SWD
  // pads with no microcontroller on the board — Goodhart Tier-0 PASS.
  const mcu = findMcu(args.components)
  if (!mcu) return []

  const buses: FirmwareBusPinMap[] = []

  const sda = padOrNet(mcu, args.nets, 'i2c_sda', [
    'HEATER_I2C_SDA',
    'OD_I2C_SDA',
    'I2C_SDA',
  ])
  const scl = padOrNet(mcu, args.nets, 'i2c_scl', [
    'HEATER_I2C_SCL',
    'OD_I2C_SCL',
    'I2C_SCL',
  ])
  // INTENT: when the board has a real MCU, reference-map I2C pads are honest
  // even before nets are wired; the Goodhart we killed was inventing the MCU.
  if (sda && scl) {
    buses.push({
      bus_id: 'i2c0',
      protocol: 'i2c',
      pins: {
        sda: normalizeFirmwarePadName(sda),
        scl: normalizeFirmwarePadName(scl),
        gnd: 'GND',
      },
      expected_devices: [],
    })
  }

  const tx = padOrNet(mcu, args.nets, 'uart_tx', ['UART_TX', 'TX'])
  const rx = padOrNet(mcu, args.nets, 'uart_rx', ['UART_RX', 'RX'])
  if (tx && rx && buses.length === 0) {
    // INTENT: only emit UART when no I2C bus was derived — avoids TX/RX
    // placeholder theatre when the board is I2C-native.
    buses.push({
      bus_id: 'uart0',
      protocol: 'uart',
      pins: {
        tx: normalizeFirmwarePadName(tx),
        rx: normalizeFirmwarePadName(rx),
        gnd: 'GND',
      },
      expected_devices: [],
    })
  }

  const swdio = padOrNet(mcu, args.nets, 'swdio', ['SWDIO'])
  const swclk = padOrNet(mcu, args.nets, 'swclk', ['SWCLK'])
  if (swdio && swclk) {
    buses.push({
      bus_id: 'swd0',
      protocol: 'swd',
      pins: {
        swdio: normalizeFirmwarePadName(swdio),
        swclk: normalizeFirmwarePadName(swclk),
        gnd: 'GND',
      },
      expected_devices: [],
    })
  }

  // GOTCHA: no synthetic TX/RX fallback — empty buses means "no bus evidence".
  return buses
}

/**
 * @description proveCatch: SAMD21 + HEATER_I2C nets → I2C pads PA22/PA23;
 * uniquify suffixes stripped; no MCU on board → zero buses.
 */
export function proveCatchFirmwarePinmapFromNets(): void {
  const buses = buildFirmwareBusesFromNets({
    mcuMpn: 'ATSAMD21G18A-AU',
    components: [
      {
        instanceName: 'mcu',
        functionClass: 'microcontroller',
        partNumber: 'ATSAMD21G18A-AU',
        manufacturer: 'Microchip',
      },
    ],
    nets: [
      {
        name: 'HEATER_I2C_SDA',
        members: [{ instanceName: 'mcu', pin: 'PA22__31' }],
      },
      {
        name: 'HEATER_I2C_SCL',
        members: [{ instanceName: 'mcu', pin: 'PA23__32' }],
      },
    ],
  })
  const i2c = buses.find((b) => b.protocol === 'i2c')
  if (!i2c || i2c.pins.sda !== 'PA22' || i2c.pins.scl !== 'PA23') {
    throw new Error(
      `proveCatch expected I2C PA22/PA23, got ${JSON.stringify(i2c?.pins)}`,
    )
  }
  const ghost = buildFirmwareBusesFromNets({
    mcuMpn: 'ATSAMD21G18A-AU',
    components: [
      { instanceName: 'tmp1075', functionClass: 'temperature_sensor', partNumber: 'TMP1075DSGR' },
    ],
    nets: [
      { name: 'HEATER_I2C_SDA', members: [{ instanceName: 'tmp1075', pin: 'SDA' }] },
    ],
  })
  if (ghost.length !== 0) {
    throw new Error(
      `proveCatch: daughterboard without MCU must emit 0 buses, got ${JSON.stringify(ghost)}`,
    )
  }
}
