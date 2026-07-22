/**
 * @file Derive implemented channel counts from real component topology evidence.
 * @description Architecture `channelRequirements` used to stay at 0 whenever the
 * generator had ANY electronic words — `functionRequirements` was only emitted on
 * an empty board, so fitness always reported channel_under_implementation. This
 * module counts channels from (a) passive geometry roles and (b) known component
 * topology signatures (heater gold / minimal temp+load, OD optical path) — never
 * from a bare role name. Stir/pump stay 0 without HAT electrical evidence (honest DRAFT).
 */

import type { AtopileFunctionRequirementRecord } from './atopile-generator'

export interface ChannelEvidenceComponent {
  partNumber?: string | null
  characterId?: string | null
  nameHuman?: string | null
  functionClass?: string | null
}

/** Pioreactor heater_20ml gold constituents (ca40a91e) — full set mints heater_channel. */
export const HEATER_CHANNEL_GOLD_MPNS = [
  'TMP1075DSGR',
  'DRV5021A3QDBZR',
  'ESR18EZPJ3R9',
  '52207-0760',
] as const

/**
 * @description Normalize an MPN for set membership (case / separator insensitive).
 */
export function normalizeMpnToken(mpn: string): string {
  return mpn.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/**
 * @description True when every gold heater MPN appears among resolved components.
 */
export function hasHeaterChannelGoldTopology(
  components: ChannelEvidenceComponent[],
): boolean {
  const have = new Set(
    components
      .map((c) => (c.partNumber ? normalizeMpnToken(c.partNumber) : ''))
      .filter(Boolean),
  )
  return HEATER_CHANNEL_GOLD_MPNS.every((mpn) => have.has(normalizeMpnToken(mpn)))
}

/**
 * @description True when the board has both temperature sense AND a heater load.
 * INTENT (2026-07-21): organoid wet_actuation resolves TMP1075 + ESR18/cartridge
 * heater without the unpublished HAT hall + FFC gold pair — mint heater=1 from
 * that minimal closed loop, never from a lone "heater" noun or temp probe alone.
 */
export function hasHeaterChannelMinimalTopology(
  components: ChannelEvidenceComponent[],
): boolean {
  const blob = components
    .map((c) => `${c.characterId ?? ''} ${c.nameHuman ?? ''} ${c.functionClass ?? ''} ${c.partNumber ?? ''}`)
    .join(' ')
    .toLowerCase()
  const mpns = new Set(
    components
      .map((c) => (c.partNumber ? normalizeMpnToken(c.partNumber) : ''))
      .filter(Boolean),
  )
  const hasTempSense =
    mpns.has(normalizeMpnToken('TMP1075DSGR'))
    || /tmp1075|temperature[_ -]?(?:sensor|probe|ic)|culture[_ -]?temperature/.test(blob)
  const hasHeaterLoad =
    mpns.has(normalizeMpnToken('ESR18EZPJ3R9'))
    || /cartridge[_ -]?heater|resistive[_ -]?heater|heater[_ -]?element|esr18/.test(blob)
  return hasTempSense && hasHeaterLoad
}

/**
 * @description True when components show an OD measurement path (source + sense/ADC).
 */
export function hasOdMeasurementPath(components: ChannelEvidenceComponent[]): boolean {
  const hasSource = components.some((c) => {
    if (c.functionClass === 'led') return true
    const blob = `${c.characterId ?? ''} ${c.nameHuman ?? ''} ${c.partNumber ?? ''}`.toLowerCase()
    return /led|emitter|light.?source|od.?source|optical.?source|szyy0603/.test(blob)
  })
  const hasSense = components.some((c) => {
    const blob = `${c.characterId ?? ''} ${c.nameHuman ?? ''} ${c.functionClass ?? ''} ${c.partNumber ?? ''}`.toLowerCase()
    return /photodiode|photo.?transistor|ads111|od.?detector|optical.?detector|tsl2591|optical[_ -]?adc/.test(blob)
      || (c.functionClass === 'sensor_ic' && /\badc\b|ads111|optical/.test(blob))
  })
  return hasSource && hasSense
}

/**
 * @description Count implemented channels from topology evidence + function records.
 * @param components Resolved on-board components for THIS board (or aggregate).
 * @param functionRequirements Generator function-requirement records.
 * @param requiredRoles Roles the architecture demands (union of board channelRequirements).
 * @returns role → implemented count (0 when no honest evidence).
 */
export function deriveImplementedChannelCounts(args: {
  components: ChannelEvidenceComponent[]
  functionRequirements: AtopileFunctionRequirementRecord[]
  requiredRoles: string[]
}): Record<string, number> {
  const { components, functionRequirements, requiredRoles } = args
  const counts: Record<string, number> = {}

  for (const role of requiredRoles) {
    counts[role] = 0
  }

  for (const fr of functionRequirements) {
    if (fr.implementation === 'passive_board_geometry') {
      counts[fr.role] = Math.max(counts[fr.role] ?? 0, 1)
    }
  }

  // Heater: full gold OR minimal temp-sense + heater-load — never a lone noun.
  if (
    (counts.heater_channel ?? 0) === 0
    && (hasHeaterChannelGoldTopology(components) || hasHeaterChannelMinimalTopology(components))
  ) {
    counts.heater_channel = 1
  }

  // OD: source + detector/ADC co-present.
  if ((counts.od_measurement_channel ?? 0) === 0 && hasOdMeasurementPath(components)) {
    counts.od_measurement_channel = 1
  }

  // Stir/pump: DRV8876 (or named motor driver) on the host HAT — never a bare role.
  if ((counts.stir_channel ?? 0) === 0 && hasStirChannelTopology(components)) {
    counts.stir_channel = 1
  }
  if ((counts.pump_channel ?? 0) === 0 && hasPumpChannelTopology(components)) {
    counts.pump_channel = 1
  }

  return counts
}

/**
 * @description True when a stir motor driver IC is present (host-HAT DRV8876 path).
 */
export function hasStirChannelTopology(components: ChannelEvidenceComponent[]): boolean {
  return components.some((c) => {
    const blob = `${c.characterId ?? ''} ${c.nameHuman ?? ''} ${c.partNumber ?? ''}`
    return /stir[_ -]?motor[_ -]?driver/i.test(blob) && /DRV8876/i.test(c.partNumber ?? '')
  })
}

/**
 * @description True when a pump motor driver IC is present (host-HAT DRV8876 path).
 */
export function hasPumpChannelTopology(components: ChannelEvidenceComponent[]): boolean {
  return components.some((c) => {
    const blob = `${c.characterId ?? ''} ${c.nameHuman ?? ''} ${c.partNumber ?? ''}`
    return /pump[_ -]?motor[_ -]?driver/i.test(blob) && /DRV8876/i.test(c.partNumber ?? '')
  })
}
